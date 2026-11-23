// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate } from '@/lib/emba/access';
import { createWorkspace } from '@/lib/emba/workspaces';
import { groupByRef, groupPolls, pollGroup } from './groups';
import { createPoll, saveAnswer } from './polls';
import { sendPoll } from './send';

vi.mock('server-only', () => ({}));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });
afterEach(() => { vi.unstubAllEnvs(); });

const NOW = new Date(), DAY = 86_400_000, day = (ahead: number) => new Date(NOW.getTime() + ahead * DAY).toISOString().slice(0, 10);
const PLAN = { title: 'Pitch practice', startDate: day(5), endDate: day(6), hourStart: 17, hourEnd: 22, timezone: 'UTC', expectedSize: 3, deadline: new Date(NOW.getTime() + 2 * DAY).toISOString(), threshold: 'majority' };
async function person(email: string) {
  const row = await makePerson(t.db);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
}
async function team() {
  const owner = await person('owner@example.test');
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', owner.subject);
  const group = await createWorkspace(t.db, owner, { name: 'Study team', description: '', namespace: 'study-team' }), scope = { orgId: group.orgId, loopId: group.loopId };
  const join = async (email: string, role: string) => { const member = await person(email);
    await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [scope.orgId, member.personId]);
    await t.db.query('insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,$4)', [scope.orgId, scope.loopId, member.personId, role]); return member; };
  return { owner, scope, ana: await join('ana@example.test', 'member'), fan: await join('fan@example.test', 'follower'), outsider: await person('out@example.test') };
}

it('finds a group by its address for someone who may post in it, with its name and how many are in it', async () => {
  const f = await team();
  expect(await groupByRef(t.db, f.ana, 'study-team')).toMatchObject({ scope: f.scope, ref: 'study-team', name: 'Study team', href: '/groups/study-team', size: 2 });
  // A follower reads the group and cannot start anything in it; an outsider cannot open it; a made-up address is nobody's.
  expect(await groupByRef(t.db, f.fan, 'study-team')).toBeNull();
  expect(await groupByRef(t.db, f.outsider, 'study-team')).toBeNull();
  expect(await groupByRef(t.db, f.ana, 'no-such-team')).toBeNull();
  expect(await groupByRef(t.db, f.ana, 'Study Team/../x')).toBeNull();
});

it('lists a group\'s polls on its page: open with who has answered, then with the time that was set', async () => {
  const f = await team();
  const { id } = await createPoll(t.db, f.owner, PLAN, NOW, f.scope), alone = await createPoll(t.db, f.owner, { ...PLAN, title: 'Not the group\'s' }, NOW);
  const slot = `${day(5)}T17:00:00.000Z`;
  await saveAnswer(t.db, f.ana, { pollId: id, slots: [slot] }, NOW);
  await saveAnswer(t.db, f.outsider, { pollId: id, slots: [slot] }, NOW);

  const forAna = await groupPolls(t.db, f.ana, f.scope), forOwner = await groupPolls(t.db, f.owner, f.scope);
  expect(forAna).toMatchObject([{ id, title: 'Pitch practice', status: 'open', answered: 2, size: 3, mine: true, chosenSlot: null }]);
  expect(forOwner[0].mine).toBe(false);
  // Someone who cannot read the group is told nothing about its polls.
  expect(await groupPolls(t.db, f.outsider, f.scope)).toEqual([]);

  // The poll's own page names its group to a member, with how many answers came from outside it, and to nobody else.
  expect(await pollGroup(t.db, f.ana, id)).toMatchObject({ name: 'Study team', href: '/groups/study-team', guests: 1 });
  expect(await pollGroup(t.db, f.outsider, id)).toBeNull();
  expect(await pollGroup(t.db, null, id)).toBeNull();
  expect(await pollGroup(t.db, f.ana, alone.id)).toBeNull();

  expect(await sendPoll(t.db, f.owner, { pollId: id, slot }, NOW)).toEqual({ sent: true });
  expect(await groupPolls(t.db, f.ana, f.scope)).toMatchObject([{ id, status: 'sent', chosenSlot: slot }]);
});

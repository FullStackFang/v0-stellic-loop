// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { accessRequestPreview } from '@/lib/emba/access-requests';
import { startGroup, type StartInput } from '@/lib/emba/group-start';
import { listInvitations } from '@/lib/emba/invitations';
import { listDocuments } from '@/lib/emba/knowledge';
import { teamState } from '@/lib/emba/team-read';

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function person(clientId?: string) {
  const row = await makePerson(t.db);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: `${row.id}@example.test`, clientId })))!;
}
async function pilot() { const owner = await person(); vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', owner.subject); return owner; }
const start = (p: Principal, over: Partial<StartInput> = {}) => startGroup(t.db, p, { name: 'EMBA 2027', slug: 'emba-2027', parent: null, links: [], people: [], note: '', files: [], ...over });
const scope = (g: { orgId: string; loopId: string }) => ({ orgId: g.orgId, loopId: g.loopId });
async function member(g: { orgId: string; loopId: string }, role = 'member') {
  const p = await person();
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2) on conflict do nothing', [g.orgId, p.personId]);
  await t.db.query('insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,$4)', [g.orgId, g.loopId, p.personId, role]);
  return p;
}

it('starts a top-level group from a name alone, with a working join link', async () => {
  const owner = await pilot();
  const report = await start(owner);
  expect(report).toMatchObject({ group: { handle: '@emba-2027/workspace', orgName: 'EMBA 2027' }, added: { files: [], links: [], people: [], announcement: null }, failed: [] });
  expect(await accessRequestPreview(t.db, report.joinToken!)).toMatchObject({ groupName: 'EMBA 2027' });
});

it('applies every lane, and reports what could not be added without undoing the rest', async () => {
  const owner = await pilot();
  const report = await start(owner, {
    files: [new File(['Week 1: read chapter 2.'], 'reading-list.txt', { type: 'text/plain' }), new File(['not a pdf'], 'broken.pdf', { type: 'application/pdf' })],
    links: ['https://example.edu/syllabus', 'http://example.edu/insecure'], people: ['Priya@Example.edu', 'not-an-email'], note: 'Kickoff is Thursday at 6.\nBring a laptop.',
  });
  expect(report.added).toEqual({ files: ['reading-list.txt'], links: ['https://example.edu/syllabus'], people: ['priya@example.edu'], announcement: 'Kickoff is Thursday at 6. Bring a laptop.' });
  expect(report.failed.map(item => item.what)).toEqual(['broken.pdf', 'http://example.edu/insecure', 'not-an-email']);
  expect(report.joinToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
  const group = scope(report.group);
  expect((await listDocuments(t.db, owner, group)).map(doc => doc.title)).toEqual(['reading-list.txt']);
  expect((await listInvitations(t.db, owner, group.orgId, group.loopId)).map(invite => [invite.recipient_email, invite.role])).toEqual([['priya@example.edu', 'member']]);
  const state = JSON.stringify(await teamState(t.db, owner, group));
  expect((await t.db.query("select v.body from emba_team_record r join emba_team_record_version v on v.record_id=r.id where r.kind='announcement'")).rows).toEqual([{ body: 'Kickoff is Thursday at 6. Bring a laptop.' }]);
  expect(state).toContain('https://example.edu/syllabus');
});

it('starts a group inside a group only where the person may, and makes nothing when the group cannot be made', async () => {
  const owner = await pilot(), cohort = (await start(owner)).group;
  const outer = await member(cohort), organizer = await member(cohort, 'organizer'), assistant = await person('claude');
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [cohort.orgId, assistant.personId]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'owner')", [cohort.orgId, cohort.loopId, assistant.personId]);
  const inner = { name: 'Team 1', slug: 'team-1', parent: '@emba-2027', links: ['https://example.edu/a'], people: ['priya@example.edu'], note: 'Hello' };
  for (const p of [outer, assistant, await person()]) await expect(start(p, inner)).rejects.toThrow('forbidden');
  await expect(start(owner, { ...inner, parent: '@no-such-group' })).rejects.toThrow('forbidden');
  await expect(start(outer, { name: 'Mine', slug: 'mine' })).rejects.toThrow('forbidden');
  // A taken handle: no group, and nothing from the lanes is saved anywhere.
  await expect(start(owner, { ...inner, slug: 'emba-2027' })).rejects.toThrow('conflict');
  expect((await t.db.query('select (select count(*) from emba_loop)::int as loops,(select count(*) from emba_invitation)::int as invites,(select count(*) from emba_team_record)::int as records')).rows).toEqual([{ loops: 1, invites: 0, records: 0 }]);
  const report = await start(organizer, inner);
  expect(report).toMatchObject({ group: { handle: '@emba-2027/team-1', orgName: 'Team 1', loopPath: 'emba-2027/team-1' }, added: { links: ['https://example.edu/a'], people: ['priya@example.edu'], announcement: 'Hello' }, failed: [] });
  expect(await accessRequestPreview(t.db, report.joinToken!)).toMatchObject({ groupName: 'Team 1' });
});
it('keeps a Drive folder as a link like any other: Loop itself never reads Drive', async () => {
  const owner = await pilot(), folder = 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  expect(await start(owner, { links: [folder] })).toMatchObject({ added: { links: [folder] }, failed: [] });
  expect((await t.db.query("select to_regclass('emba_drive_folder') as found")).rows).toEqual([{ found: null }]);
});

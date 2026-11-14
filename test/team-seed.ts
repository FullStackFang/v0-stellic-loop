// A team with something in every list, for measuring what a team page costs and for checking that a
// change to the list builders leaves every answer as it was. Used by tests (PGlite) and by
// scripts/perf-probe.ts (the configured database, inside a transaction that is rolled back).
import type { Db, Q } from '../lib/db';
import { authenticate, type Principal } from '../lib/emba/access';
import { grantLease } from '../lib/emba/consent';
import { revokeMembership } from '../lib/emba/roles';
import { setMemberHandle } from '../lib/emba/tags';
import { answerAsk, askResults, closeAsk, createAsk, listAsks } from '../lib/emba/team-asks';
import { addEvent } from '../lib/emba/team-events';
import { eventDetail, setInterest, upcomingEvents } from '../lib/emba/team-interest';
import { saveBrief, teamBrief, teamState, whatsNew } from '../lib/emba/team-read';
import { claim, fileOutput, logDecision, postAnnouncement } from '../lib/emba/team-records';
import { createWorkspace } from '../lib/emba/workspaces';

const issuer = 'urn:loop:busy-team';
const forever = '2099-01-01T00:00:00Z';
const saved = <T extends { saved: boolean }>(result: T): Extract<T, { saved: true }> => {
  if (!result.saved) throw new Error(`The seed was refused: ${JSON.stringify(result)}`);
  return result as Extract<T, { saved: true }>;
};
/** A closing time some days from now, with an offset. */
const inDays = (days: number) => `${new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 19)}Z`;

export type Scope = { orgId: string; loopId: string };
/** A person with a known id, so that an order that ends in the id is the same on every run. */
export async function seedPerson(db: Db, n: number, name: string, clientId?: string): Promise<Principal> {
  const id = `5eed0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  await db.query('insert into person(id,phone,name) values($1,$2,$3) on conflict(id) do nothing', [id, `+1607${Math.floor(1_000_000 + Math.random() * 9_000_000)}`, name]);
  await db.query('insert into emba_identity(issuer,subject,person_id,verified_at) values($1,$2,$3,now()) on conflict do nothing', [issuer, id, id]);
  return (await authenticate(db, 'seed', async () => ({ issuer, subject: id, expiresAt: Date.parse(forever), verifiedEmail: `${id}@example.test`, clientId, scopes: clientId ? ['plan:read', 'group-memory:write'] : [] })))!;
}
export async function seedJoin(db: Db, team: Scope, person: Principal, role: 'member' | 'follower' | 'organizer', handle?: string) {
  await db.query('insert into emba_membership(org_id,person_id) values($1,$2) on conflict do nothing', [team.orgId, person.personId]);
  await db.query('insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,$4)', [team.orgId, team.loopId, person.personId, role]);
  if (handle) await setMemberHandle(db, person, { orgId: team.orgId, handle });
}

/**
 * The owner must be allowed to start a group (LOOP_PILOT_OWNER_SUBJECTS). Everything else is made here:
 * six members and a follower, a brief, an announcement, two events, decisions (one superseded), outputs
 * (one replaced, one flagged), claims (one past due, one proposed with tags and an overlap), four asks
 * with answers (one closed, with answers from two people who then left), and interest in an event.
 */
export async function seedBusyTeam(db: Db, owner: Principal, namespace = 'loop-probe-team') {
  const group = await createWorkspace(db, owner, { name: 'Busy team', description: '', namespace });
  const team: Scope = { orgId: group.orgId, loopId: group.loopId };
  await setMemberHandle(db, owner, { orgId: team.orgId, handle: 'lead' });
  const member = async (n: number, name: string, handle?: string, role: 'member' | 'follower' = 'member') => { const p = await seedPerson(db, n, name); await seedJoin(db, team, p, role, handle); return p; };
  const ana = await member(1, 'Ana Member', 'ana'), ben = await member(2, 'Ben Member', 'ben'), cal = await member(3, 'Cal Member', 'cal'), dee = await member(4, 'Dee Member', 'dee');
  // No handle: an assistant is shown this member with no name at all.
  const eli = await member(5, 'Eli Member'), fay = await member(6, 'Fay Follower', 'fay', 'follower');
  // Gus joins and answers before Hal, and Hal's id sorts first: once both have left, only a stated order tells them apart.
  const gus = await member(8, 'Gus Leaver', 'gus'), hal = await member(7, 'Hal Leaver', 'hal');

  await saveBrief(db, owner, { ...team, body: 'Final deck for Strategy.\nTen slides.', deadline: '2099-06-30', timezone: 'America/New_York', expectedVersion: 0 });
  saved(await postAnnouncement(db, owner, { ...team, text: 'Deck due Friday.' }));
  saved(await addEvent(db, owner, { ...team, slug: 'final-deck', name: 'Final deck', startsAt: '2099-03-01T19:00', endsAt: '2099-03-01T21:00', place: 'Sage Hall' }));
  saved(await addEvent(db, owner, { ...team, slug: 'kickoff', name: 'Kickoff' }));

  const first = saved(await logDecision(db, ana, { ...team, topic: 'deck-tool', statement: 'Google Slides.', newTopic: true }));
  const colour = saved(await logDecision(db, ben, { ...team, topic: 'colour', statement: 'Carnelian on white.', newTopic: true, tags: ['cal'] }));
  const tool = saved(await logDecision(db, ana, { ...team, topic: 'deck-tool', statement: 'Keynote.', supersedes: first.record.number }));
  const draft = saved(await fileOutput(db, ana, { ...team, url: 'https://docs.google.com/document/d/abc', title: 'Deck draft', summary: 'Built in Canva.', decisionsVersion: tool.decisionsVersion, conflictsWith: [colour.record.number, tool.record.number], fileAnyway: true, event: 'final-deck', tags: ['ben', 'gus'] }));
  const sizing = saved(await fileOutput(db, cal, { ...team, url: 'https://files.example.org/sizing-v1.pdf', title: 'Market sizing', summary: 'TAM is 4.2bn.', decisionsVersion: tool.decisionsVersion }));
  saved(await fileOutput(db, cal, { ...team, url: 'https://files.example.org/sizing-v2.pdf', title: 'Market sizing v2', summary: 'TAM is 4.6bn.', decisionsVersion: tool.decisionsVersion, replaces: sizing.record.number }));
  const slides = saved(await claim(db, ben, { ...team, what: 'Slides 1 to 3', dueOn: '2020-01-01' }));
  saved(await claim(db, ana, { ...team, what: 'Slides 4 to 8', owner: 'ben', tags: ['ben', 'cal'], overlapsWith: [slides.record.number], event: 'final-deck' }));
  saved(await claim(db, dee, { ...team, what: 'Appendix', dueOn: '2099-05-01' }));

  const dates = saved(await createAsk(db, ana, { ...team, question: 'Which date works?', kind: 'dates', options: ['2099-03-14', '2099-03-21', '2099-03-28'], closesAt: inDays(5), event: 'final-deck' })).ask.number;
  const wine = saved(await createAsk(db, ben, { ...team, question: 'Red or white?', kind: 'one', options: ['Red', 'White'], closesAt: inDays(1), reveal: 'counts' })).ask.number;
  const grape = saved(await createAsk(db, cal, { ...team, question: 'Favourite grape?', kind: 'text', closesAt: inDays(3) })).ask.number;
  const bring = saved(await createAsk(db, dee, { ...team, question: 'What should we bring?', kind: 'many', options: ['Cheese', 'Bread', 'Olives'], closesAt: inDays(10) })).ask.number;
  const answer = async (who: Principal, number: number, value: (number | string)[] | string) => void saved(await answerAsk(db, who, { ...team, number, ...(typeof value === 'string' ? { text: value } : { choices: value }) }));
  await answer(ben, dates, [1]); await answer(cal, dates, [1, 2]); await answer(eli, dates, [2]); await answer(owner, dates, [3]);
  await answer(ana, wine, ['Red']); await answer(cal, wine, ['White']); await answer(gus, wine, ['Red']);
  await answer(gus, grape, 'Syrah'); await answer(ben, grape, 'Gamay'); await answer(hal, grape, 'Merlot'); await answer(eli, grape, 'Chenin');
  await answer(gus, bring, ['Cheese']); await answer(ana, bring, ['Cheese', 'Bread']); await answer(hal, bring, ['Cheese', 'Olives']); await answer(eli, bring, ['Olives']);
  saved(await closeAsk(db, cal, { ...team, number: grape }));
  saved(await closeAsk(db, dee, { ...team, number: bring }));
  for (const who of [ana, ben, eli, gus, owner]) saved(await setInterest(db, who, { ...team, event: 'final-deck' }));
  // Two people leave. Their answers to the closed asks stay, as former members'.
  for (const who of [gus, hal]) await revokeMembership(db, owner, { orgId: team.orgId, personId: who.personId });

  await grantLease(db, ana, { ...team, clientId: 'claude', actions: ['plan:read'], expiresAt: forever });
  const assistant = (await authenticate(db, 'seed', async () => ({ issuer, subject: ana.subject, clientId: 'claude', scopes: ['plan:read', 'group-memory:write'], expiresAt: Date.parse(forever) })))!;
  return { team, owner, ana, ben, cal, dee, eli, fay, assistant, asks: { dates, wine, grape, bring }, draft: draft.record.number };
}
export type BusyTeam = Awaited<ReturnType<typeof seedBusyTeam>>;

// What differs from one run to the next and says nothing about a list builder: clock readings, tokens, and the cursor's mark of the team.
const VOLATILE = new Set(['createdAt', 'closesAt', 'closes', 'editedAt', 'today', 'cursor', 'shareUrl', 'at']);
const steady = <T,>(value: T): T => JSON.parse(JSON.stringify(value, (key, item) => VOLATILE.has(key) && item !== null ? `<${key}>` : item));

/** What the site and an assistant are told about the busy team, with clock readings and tokens blanked. */
export async function captureTeam(db: Db, f: BusyTeam) {
  const out: Record<string, unknown> = {};
  for (const [name, who] of Object.entries({ owner: f.owner, member: f.ben, follower: f.fay, assistant: f.assistant })) {
    const results: Record<string, unknown> = {};
    for (const [key, number] of Object.entries(f.asks)) results[key] = await askResults(db, who, { ...f.team, number });
    out[name] = {
      state: await teamState(db, who, f.team), stateOfEvent: await teamState(db, who, { ...f.team, event: 'final-deck' }), brief: await teamBrief(db, who, f.team), news: await whatsNew(db, who, f.team),
      asks: await listAsks(db, who, f.team), results, upcoming: await upcomingEvents(db, who, { ...f.team, people: true }), event: await eventDetail(db, who, { ...f.team, event: 'final-deck' }),
    };
  }
  return steady(out);
}

/** Counts the statements a read sends, as the test database sees them: `begin` and `commit` are not among them. */
export function counting(db: Db) {
  let statements = 0;
  const count = (q: Q): Q => ({ query: (text, params) => { statements++; return q.query(text, params); } });
  const counted: Db = { ...count(db), tx: fn => db.tx(q => fn(count(q))) };
  return { db: counted, async of<T>(run: (db: Db) => Promise<T>): Promise<number> { const before = statements; await run(counted); return statements - before; } };
}

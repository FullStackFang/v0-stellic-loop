// Sample class groups for demos: two Fall 2026 EMBA courses with the dates from their syllabi, five sample
// classmates, and a few asks with answers. Everything goes through the same services the site uses.
//
//   npm run emba:seed            shows what it would do and which database it would write to
//   npm run emba:seed -- --yes   writes it
//
// It writes to the database in .env.local. A group whose handle already exists is left alone, so it is safe to run twice.
import { pathToFileURL } from 'node:url';
import type { Db } from '../lib/db';
import { authenticate, type Principal } from '../lib/emba/access';
import { enableAccessRequests, setJoinMode } from '../lib/emba/access-requests';
import { setMemberHandle } from '../lib/emba/tags';
import { answerAsk, createAsk } from '../lib/emba/team-asks';
import { addEvent } from '../lib/emba/team-events';
import { setInterest } from '../lib/emba/team-interest';
import { saveBrief } from '../lib/emba/team-read';
import { createWorkspace } from '../lib/emba/workspaces';

const ZONE = 'America/New_York';
/** Sample classmates sign in nowhere: this issuer is never one a real sign-in presents. */
export const SAMPLE_ISSUER = 'urn:loop:sample';
const CLASSMATES = [['priya', 'Priya Raman'], ['marcus', 'Marcus Bell'], ['elena', 'Elena Costa'], ['dev', 'Dev Malhotra'], ['hannah', 'Hannah Okafor']] as const;
type Who = typeof CLASSMATES[number][0];

type SeedEvent = { slug: string; name: string; startsAt: string; endsAt?: string; note?: string; interested: Who[] };
type SeedAsk = { by?: Who; question: string; kind: 'one' | 'many' | 'dates' | 'text'; options?: string[]; closesAt: string; reveal?: 'named' | 'counts'; event?: string;
  answers: [Who, number[] | string][] };
type SeedGroup = { namespace: string; name: string; description: string; brief: string; events: SeedEvent[]; asks: SeedAsk[] };

// Times are local to New York, as the syllabi state them.
export const GROUPS: SeedGroup[] = [{
  namespace: 'nbae-6830', name: 'NBAE 6830 Innovation and New Venture Creation',
  description: 'Sample group for the Fall 2026 course. Dates come from the syllabus.',
  brief: ['NBAE 6830: Innovation and New Venture Creation, Summer and Fall 2026. Instructor: Tom Schryver.',
    'Teams pick a business idea, run customer discovery, test the business model and finish with a pitch to a panel of entrepreneurs and investors on December 12.',
    'Grade, 145 points: participation 25, quizzes 30, feedback to other teams 10, individual assignments 20, team progress assignments 20, final presentation 40.',
    'Late quizzes lose half their points. Use of AI tools is required; hand in the prompt as well as the output.'].join('\n'),
  events: [
    { slug: 'weekend-4-day-1', name: 'Weekend 4, day 1', startsAt: '2026-11-14T13:30', endsAt: '2026-11-14T17:30', note: 'Test result report outs, iterating business models, milestones. Module 7 quiz and the Weekend 4 deliverable are due the night before.', interested: ['priya', 'marcus', 'elena', 'dev'] },
    { slug: 'weekend-4-day-2', name: 'Weekend 4, day 2', startsAt: '2026-11-15T10:30', endsAt: '2026-11-15T12:45', note: 'Crafting and assembling a pitch.', interested: ['priya', 'marcus', 'hannah'] },
    { slug: 'draft-pitch-due', name: 'Weekend 5 draft pitch and Module 8 quiz due', startsAt: '2026-12-04T23:59', note: 'Team draft pitch on Canvas. Module 8 quiz: Entrepreneurial Finance and Legal, 15 points.', interested: ['elena'] },
    { slug: 'weekend-5-day-1', name: 'Weekend 5, day 1', startsAt: '2026-12-05T13:30', endsAt: '2026-12-05T17:30', note: 'Practice, iterate and finalize the pitch. Fundraising, dilution, deal terms.', interested: ['priya', 'dev', 'hannah'] },
    { slug: 'weekend-5-day-2', name: 'Weekend 5, day 2', startsAt: '2026-12-06T10:30', endsAt: '2026-12-06T12:45', interested: ['priya'] },
    { slug: 'demo-day', name: 'Final pitch to the investor panel', startsAt: '2026-12-12T13:30', endsAt: '2026-12-12T17:30', note: 'Final pitch deck and supporting materials. Reception to follow.', interested: ['priya', 'marcus', 'elena', 'dev', 'hannah'] },
    { slug: 'course-wrap-up', name: 'Course wrap-up', startsAt: '2026-12-13T10:30', endsAt: '2026-12-13T12:45', interested: ['marcus'] },
  ],
  asks: [
    { question: 'Which evening works for a pitch dry run before Weekend 5?', kind: 'dates', options: ['2026-12-01', '2026-12-02', '2026-12-03'], closesAt: '2026-11-27T18:00',
      answers: [['priya', [1, 2]], ['marcus', [2]], ['elena', [2, 3]]] },
    { by: 'priya', question: 'Staying for the reception after the final pitch?', kind: 'one', options: ['Yes', 'No', 'Not sure yet'], closesAt: '2026-12-10T12:00', reveal: 'counts', event: 'demo-day',
      answers: [['marcus', [1]], ['dev', [1]], ['hannah', [3]]] },
    { by: 'dev', question: 'Which customer segment should we interview first this week?', kind: 'text', closesAt: '2026-11-20T20:00',
      answers: [['elena', 'Clinic office managers. Two already agreed to talk.'], ['hannah', 'Independent pharmacies near campus.']] },
  ],
}, {
  namespace: 'nbae-6561', name: 'NBAE 6561 Investment Banking',
  description: 'Sample group for the Fall 2026 course. Dates come from the syllabus.',
  brief: ['NBAE 6561: Investment Banking, Valuation and Transactions, Fall 2026. Professor: Drew Pascarella.',
    'Six assignments. Individual: EV/FV, DCF valuation, reflection. Group: IPO, LBO, M&A.',
    'Grade: assignments 80 percent (EV/FV 10, IPO 20, LBO 20, DCF 15, M&A 10, reflection 5), attendance and participation 20 percent.',
    'Late assignments lose half their points. No generative AI for answering a quiz, case or reflection; background research and slide formatting are allowed.'].join('\n'),
  events: [
    { slug: 'dcf-due', name: 'DCF valuation, parts 1 and 2 due', startsAt: '2026-11-14T12:00', note: 'Individual assignment, on Canvas.', interested: ['priya', 'marcus', 'dev'] },
    { slug: 'm-and-a-due', name: 'M&A case due', startsAt: '2026-12-12T10:15', note: 'Group assignment, on Canvas.', interested: ['priya', 'elena', 'dev', 'hannah'] },
    { slug: 'reflection-due', name: 'Reflection paper due', startsAt: '2026-12-16T23:59', note: 'Individual assignment, 5 percent of the grade.', interested: ['marcus'] },
  ],
  asks: [
    { question: 'When should we meet to split up the M&A case?', kind: 'dates', options: ['2026-11-18', '2026-11-19', '2026-11-22'], closesAt: '2026-11-17T12:00', event: 'm-and-a-due',
      answers: [['priya', [1, 3]], ['dev', [3]], ['hannah', [2, 3]], ['elena', [3]]] },
    { by: 'marcus', question: 'Who can take the accretion and dilution model?', kind: 'one', options: ['I can', 'I can help', 'Not this time'], closesAt: '2026-11-21T18:00',
      answers: [['dev', [1]], ['priya', [2]]] },
  ],
}];

export type Seeded = { namespace: string; state: 'created' | 'exists'; events: number; asks: number; joinLink?: string };
const saved = <T extends { saved: boolean }>(result: T, what: string) => { if (!result.saved) throw new Error(`${what}: ${JSON.stringify(result)}`); return result; };
// The syllabi give New York times; November and December are UTC-5.
const instantOf = (local: string) => new Date(`${local}:00-05:00`).getTime();

async function classmates(db: Db): Promise<Record<Who, Principal>> {
  const out = {} as Record<Who, Principal>;
  for (const [key, name] of CLASSMATES) {
    const { rows } = await db.query('select 1 from emba_identity where issuer=$1 and subject=$2', [SAMPLE_ISSUER, key]);
    if (!rows.length) await db.tx(async q => {
      const { rows: [person] } = await q.query<{ id: string }>('insert into person(name) values($1) returning id', [name]);
      await q.query('insert into emba_identity(issuer,subject,person_id,verified_at) values($1,$2,$3,now())', [SAMPLE_ISSUER, key, person.id]);
    });
    out[key] = (await authenticate(db, 'seed', async () => ({ issuer: SAMPLE_ISSUER, subject: key, expiresAt: Date.now() + 3_600_000 })))!;
  }
  return out;
}

/** Creates the sample groups the owner does not have yet. `owner` must be allowed to start groups. */
export async function seedClasses(db: Db, owner: Principal, now = Date.now()): Promise<Seeded[]> {
  const people = await classmates(db), report: Seeded[] = [];
  for (const group of GROUPS) {
    const { rows: taken } = await db.query('select 1 from emba_group_namespace where namespace=$1', [group.namespace]);
    if (taken.length) { report.push({ namespace: group.namespace, state: 'exists', events: 0, asks: 0 }); continue; }
    const made = await createWorkspace(db, owner, { name: group.name, description: group.description, namespace: group.namespace });
    const scope = { orgId: made.orgId, loopId: made.loopId };
    await saveBrief(db, owner, { ...scope, body: group.brief, timezone: ZONE, expectedVersion: 0 });
    for (const [key] of CLASSMATES) {
      await db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [scope.orgId, people[key].personId]);
      await db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')", [scope.orgId, scope.loopId, people[key].personId]);
      await setMemberHandle(db, people[key], { orgId: scope.orgId, handle: key });
    }
    let events = 0, asks = 0;
    const live = new Set<string>();
    for (const { interested, ...event } of group.events) {
      if (instantOf(event.startsAt) <= now) continue;
      saved(await addEvent(db, owner, { ...scope, ...event }), event.slug);
      for (const key of interested) saved(await setInterest(db, people[key], { ...scope, event: event.slug }), `${event.slug} interest`);
      live.add(event.slug); events++;
    }
    for (const { by, answers, event, ...ask } of group.asks) {
      if (instantOf(ask.closesAt) <= now) continue;
      const result = saved(await createAsk(db, by ? people[by] : owner, { ...scope, ...ask, ...(event && live.has(event) ? { event } : {}) }), ask.question);
      if (!result.saved) continue;
      for (const [key, value] of answers) saved(await answerAsk(db, people[key], { ...scope, number: result.ask.number, ...(typeof value === 'string' ? { text: value } : { choices: value }) }), `${ask.question} answer`);
      asks++;
    }
    // Real classmates come in through the join link, without waiting for approval. The owner can switch that on the group page.
    const token = await enableAccessRequests(db, owner, { ...scope, publicLabel: group.name });
    await setJoinMode(db, owner, { ...scope, mode: 'admit' });
    report.push({ namespace: group.namespace, state: 'created', events, asks, joinLink: `/groups/request#token=${token}` });
  }
  return report;
}

async function main() {
  process.loadEnvFile('.env.local');
  const { db, databaseUrl } = await import('../lib/db');
  const subject = (process.env.LOOP_PILOT_OWNER_SUBJECTS ?? '').split(',')[0]?.trim(), email = process.env.LOOP_PILOT_OWNER_EMAIL?.trim();
  if (!subject || !email) throw new Error('Set LOOP_PILOT_OWNER_SUBJECTS and LOOP_PILOT_OWNER_EMAIL in .env.local first.');
  const host = new URL(databaseUrl(process.env) ?? 'postgres://unset').hostname;
  console.log(`Database: ${host}`);
  console.log(`Groups: ${GROUPS.map(group => `${group.name} (@${group.namespace})`).join('; ')}`);
  console.log(`Sample classmates: ${CLASSMATES.map(([, name]) => name).join(', ')}`);
  if (!process.argv.includes('--yes')) { console.log('Nothing written. Run again with -- --yes to write it.'); return; }
  const { rows: [identity] } = await db().query<{ issuer: string }>('select issuer from emba_identity where subject=$1 and revoked_at is null', [subject]);
  if (!identity) throw new Error('No account for the first id in LOOP_PILOT_OWNER_SUBJECTS yet. Sign in to the site once, then run this again.');
  const owner = await authenticate(db(), 'seed', async () => ({ issuer: identity.issuer, subject, expiresAt: Date.now() + 3_600_000, verifiedEmail: email }));
  if (!owner) throw new Error('That account cannot be used.');
  for (const row of await seedClasses(db(), owner)) {
    console.log(row.state === 'exists' ? `@${row.namespace}: already there, left alone.` : `@${row.namespace}: created with ${row.events} events and ${row.asks} asks. Join link: ${process.env.NEXT_PUBLIC_APP_URL ?? ''}${row.joinLink}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().then(() => process.exit(0), error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });

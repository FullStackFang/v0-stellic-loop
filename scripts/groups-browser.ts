// Explicit local browser run-through of the group pages: the real pages, client panels and actions,
// with made-up signed-in people and a disposable PGlite. Never run this as a hosted app.
//   npm run groups:browser   then open http://127.0.0.1:4321/?actor=owner
// ?actor=owner|organizer|outer|inner|stranger|none  &page=members|team|event|ask  &slug=team-1  &tab=…  &ask=1|2|3
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { cloneElement, createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { makePerson, openTestDb } from '../test/db';
import { authenticate, type Principal } from '../lib/emba/access';
import { withPortalTestSession } from '../lib/emba/portal-session';
import { createWorkspace } from '../lib/emba/workspaces';
import { createInnerGroup } from '../lib/emba/group-tree';
import { enableAccessRequests, requestMembership } from '../lib/emba/access-requests';
import { setMemberHandle } from '../lib/emba/tags';
import { addEvent } from '../lib/emba/team-events';
import { setInterest } from '../lib/emba/team-interest';
import { answerAsk, createAsk } from '../lib/emba/team-asks';
import type { GroupAddress } from '../lib/emba/groups';
import MembersPage from '../app/groups/[namespace]/page';
import TeamPage from '../app/groups/[namespace]/team/page';
import SharedEventPage from '../app/e/[token]/page';
import SharedAskPage from '../app/a/[token]/page';
import { Invite, JoinLink, Roster, WaitingList } from '../app/groups/[namespace]/members-panel';
import { ActionForm } from '../components/emba/portal-forms';
import { grantScopedRole, removeOrgMembership, revokeScopedRole } from '../app/emba/role-actions';
import { cancelInvite, inviteMember, saveTagHandle } from '../app/groups/actions';
import { replaceRequestLink, reviewRequest, setJoinLink } from '../app/groups/request-actions';
import type { PortalAction } from '../components/emba/portal-types';

const PANELS = new Map<unknown, string>([[Roster, 'roster'], [JoinLink, 'joinLink'], [Invite, 'invite'], [WaitingList, 'waiting']]);
const calls: Record<string, PortalAction> = { grant: grantScopedRole, revokeRole: revokeScopedRole, removeFromGroup: removeOrgMembership, saveTag: saveTagHandle, setLink: setJoinLink, replaceLink: replaceRequestLink, invite: inviteMember, review: reviewRequest, cancelInvite };
type Lifted = { props: Record<string, unknown>; forms: { label: string; html: string }[]; actions: PortalAction[] };

/**
 * Makes a page's tree sendable. Each Members panel becomes an empty slot with its props; each ActionForm becomes a slot
 * with its fields as markup and its action kept here by number. The browser mounts the real client component in each slot.
 */
function lift(node: ReactNode, out: Lifted): ReactNode {
  if (Array.isArray(node)) return node.map((child, index) => { const lifted = lift(child, out); return isValidElement(lifted) && lifted.key == null ? cloneElement(lifted, { key: index }) : lifted; });
  if (!isValidElement<{ children?: ReactNode; actions?: unknown; action?: PortalAction; label?: string }>(node)) return node;
  const panel = PANELS.get(node.type);
  if (panel) { const { actions, ...rest } = node.props; out.props[panel] = { ...rest, actionNames: Object.keys(actions ?? {}) }; return createElement('div', { 'data-slot': panel }); }
  if (node.type === ActionForm) {
    out.actions.push(node.props.action!); out.forms.push({ label: node.props.label!, html: renderToStaticMarkup(node.props.children) });
    return createElement('div', { 'data-form': out.forms.length - 1 });
  }
  // A server component is a plain function: call it to reach the forms inside. One that uses hooks throws here and is left to render as it is.
  if (typeof node.type === 'function') {
    const warn = console.error; console.error = () => {}; // React reports the hook call it is about to throw for.
    try { const made = (node.type as (props: unknown) => ReactNode)(node.props); if (!(made instanceof Promise)) return lift(made, out); } catch { return node; } finally { console.error = warn; }
    return node;
  }
  return node.props.children === undefined ? node : cloneElement(node, undefined, lift(node.props.children, out));
}

async function main() {
  if (process.env.NODE_ENV !== 'test' || process.env.QB_DB === 'remote' || process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_TEST_DB_URL) throw new Error('Browser run-through requires explicit test mode and no configured database URLs');
  const port = 4321, origin = `http://127.0.0.1:${port}`, capability = randomBytes(32).toString('hex');
  process.env.NEXT_PUBLIC_APP_URL = origin;
  const t = await openTestDb();
  const person = async (email: string, name?: string) => {
    const row = await makePerson(t.db, name ?? email.split('@')[0]);
    await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('urn:loop:rehearsal',$1,$2,now())", [row.id, row.id]);
    return (await authenticate(t.db, 'synthetic', async () => ({ issuer: 'urn:loop:rehearsal', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
  };
  const join = async (group: GroupAddress, p: Principal, role: string) => {
    await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2) on conflict do nothing', [group.orgId, p.personId]);
    await t.db.query('insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,$4)', [group.orgId, group.loopId, p.personId, role]);
    return p;
  };
  const owner = await person('owner@example.test', 'Olivia Owner');
  process.env.LOOP_PILOT_OWNER_SUBJECTS = owner.subject;
  const cohort = await createWorkspace(t.db, owner, { name: 'EMBA 2027', description: '', namespace: 'emba-2027' });
  const scope = { orgId: cohort.orgId, loopId: cohort.loopId };
  const inner = (parent: GroupAddress, name: string, slug: string) => createInnerGroup(t.db, owner, { orgId: parent.orgId, parentLoopId: parent.loopId, name, description: '', slug });
  const team1 = await inner(cohort, 'Team 1', 'team-1');
  await inner(team1, 'NBAE 6830', 'nbae-6830'); await inner(cohort, 'Team 2', 'team-2');
  const actors: Record<string, Principal | null> = {
    owner, organizer: await join(cohort, await person('organizer@example.test', 'Omar Organizer'), 'organizer'),
    outer: await join(cohort, await person('outer@example.test', 'Uma Outer'), 'member'), inner: await join(team1, await person('inner@example.test', 'Ian Inner'), 'member'),
    stranger: await person('stranger@example.test', 'Sam Stranger'), none: null,
  };
  const first = ['Aisha', 'Ben', 'Carla', 'Diego', 'Emi', 'Farid', 'Grace', 'Hugo'], last = ['Adeyemi', 'Brooks', 'Chen', 'Dubois', 'Eriksen'], crowd: Principal[] = [];
  for (let n = 0; n < 40; n++) crowd.push(await join(cohort, await person(`p${n}@example.test`, `${first[n % 8]} ${last[Math.floor(n / 8)]}`), n % 9 === 0 ? 'organizer' : n % 11 === 5 ? 'follower' : 'member'));
  for (const [n, p] of crowd.slice(0, 12).entries()) await setMemberHandle(t.db, p, { orgId: cohort.orgId, handle: `${first[n % 8]}-${last[Math.floor(n / 8)][0]}`.toLowerCase() });
  // Two people already waiting: they asked through the join link, which starts as ask-first.
  const asking = await enableAccessRequests(t.db, owner, { ...scope, publicLabel: '' });
  for (const name of ['Sofia Reyes', 'Tomas Vega']) await requestMembership(t.db, await person(`${name.split(' ')[0].toLowerCase()}@example.test`, name), asking);

  // Events with people interested, and asks of each kind with some answers, for the Team page and the share pages.
  const must = <T extends { saved: boolean }>(write: T) => { if (!write.saved) throw new Error(`seed refused: ${JSON.stringify(write)}`); return write; };
  const day = (ahead: number, time = '18:30') => `${new Date(Date.now() + ahead * 86_400_000).toISOString().slice(0, 10)}T${time}`;
  const outer = actors.outer!, members = crowd.filter((_, n) => n % 9 !== 0 && n % 11 !== 5);
  must(await addEvent(t.db, owner, { ...scope, slug: 'ridge-walk', name: 'Ridge walk', startsAt: day(6, '09:00'), place: 'Trailhead car park, Buttermilk Falls', url: 'https://trails.example.org/ridge', note: 'Bring boots and a flask. We leave at nine sharp.' }));
  must(await addEvent(t.db, owner, { ...scope, slug: 'case-night', name: 'Case night: the Vietnam market entry', startsAt: day(2, '19:00'), place: 'Sage Hall B09', note: 'Read the case first.' }));
  must(await addEvent(t.db, owner, { ...scope, slug: 'alumni-dinner', name: 'Alumni dinner', startsAt: day(20, '18:30'), place: 'Statler Hotel' }));
  for (const [n, p] of members.slice(0, 9).entries()) { must(await setInterest(t.db, p, { ...scope, event: 'ridge-walk' })); if (n < 3) must(await setInterest(t.db, p, { ...scope, event: 'case-night' })); }
  must(await setInterest(t.db, outer, { ...scope, event: 'case-night' }));
  const named = must(await createAsk(t.db, owner, { ...scope, question: 'Which weekend works for the ridge walk?', kind: 'one', options: ['Saturday the 21st', 'Sunday the 22nd', 'Neither, pick another'], closesAt: day(5, '12:00'), reveal: 'named' }));
  const counts = must(await createAsk(t.db, outer, { ...scope, question: 'How is the workload this term, honestly?', kind: 'one', options: ['Fine', 'Heavy but manageable', 'Too much'], closesAt: day(1, '20:00'), reveal: 'counts' }));
  const written = must(await createAsk(t.db, owner, { ...scope, question: 'What should the alumni dinner cover that last year missed?', kind: 'text', closesAt: day(9, '12:00'), reveal: 'named' }));
  const numberOf = (write: unknown) => (write as { ask: { number: number; shareUrl: string } }).ask;
  for (const [n, p] of members.slice(0, 14).entries()) must(await answerAsk(t.db, p, { ...scope, number: numberOf(named).number, choices: [1 + n % 3] }));
  for (const [n, p] of members.slice(0, 22).entries()) must(await answerAsk(t.db, p, { ...scope, number: numberOf(counts).number, choices: [1 + (n * 7) % 3] }));
  for (const [n, p] of members.slice(0, 4).entries()) must(await answerAsk(t.db, p, { ...scope, number: numberOf(written).number, text: ['More time to talk to second-years.', 'A shorter program and a longer dinner.', 'Seating by industry, not by team.', 'Vegetarian mains that are not pasta.'][n] }));
  const askTokens = [named, counts, written].map(write => new URL(numberOf(write).shareUrl).pathname.split('/').pop()!);
  const { rows: [{ share_token: eventToken }] } = await t.db.query<{ share_token: string }>("select share_token from emba_team_event where slug='ridge-walk'");

  // The actions of the page each person last read, by the number of the form that carries them.
  const formActions = new Map<string, PortalAction[]>();
  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const json = (status: number, data: unknown) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(data)); };
    if (req.headers.host !== `127.0.0.1:${port}` || req.headers.origin && req.headers.origin !== origin) return json(403, { error: 'Local run-through only' });
    try {
      const url = new URL(req.url ?? '/', origin), actor = url.searchParams.get('actor') ?? 'owner';
      if (!Object.hasOwn(actors, actor)) return json(400, { error: 'Unknown actor' });
      const who = actors[actor], as = <T,>(run: () => T) => who ? withPortalTestSession(who, run) : run();
      if (req.method === 'GET' && url.pathname === '/page') {
        const slug = url.searchParams.get('slug'), page = url.searchParams.get('page') ?? 'members', tab = url.searchParams.get('tab');
        const params = Promise.resolve({ namespace: 'emba-2027', ...(slug ? { slug } : {}) });
        const tree = await as(() => page === 'team' ? TeamPage({ params, searchParams: Promise.resolve(tab ? { tab } : {}) })
          : page === 'event' ? SharedEventPage({ params: Promise.resolve({ token: eventToken }) })
          : page === 'ask' ? SharedAskPage({ params: Promise.resolve({ token: askTokens[Number(url.searchParams.get('ask') ?? 1) - 1] ?? askTokens[0] }) })
          : MembersPage({ params }));
        const out: Lifted = { props: {}, forms: [], actions: [] }, html = renderToStaticMarkup(lift(tree, out));
        formActions.set(actor, out.actions);
        return json(200, { html, props: out.props, forms: out.forms, shell: page === 'members' || page === 'team', capability, actors: Object.keys(actors) });
      }
      if (req.method !== 'POST' || req.headers.origin !== origin || req.headers['content-type'] !== 'application/json' || req.headers['x-rehearsal-capability'] !== capability) return json(403, { error: 'Invalid request' });
      let raw = ''; for await (const chunk of req) { raw += chunk.toString(); if (Buffer.byteLength(raw) > 65536) return json(413, { error: 'Request too large' }); }
      const body = JSON.parse(raw), form = new FormData();
      for (const [key, value] of body.entries ?? []) form.append(String(key), String(value));
      const action = url.pathname === '/action' ? typeof body.form === 'number' ? formActions.get(actor)?.[body.form] : Object.hasOwn(calls, body.action) ? calls[body.action] : undefined : undefined;
      if (action) return json(200, await as(() => action({ status: 'idle', message: '' }, form)));
      json(404, { error: 'Unknown operation' });
    } catch (error) { console.error(error); json(403, { error: 'Access or operation denied' }); }
  };
  const server = await createServer({ configFile: false, root: resolve('test/groups-browser'), publicDir: resolve('public'), plugins: [react(), { name: 'groups-run-through-api', configureServer(vite) { vite.middlewares.use('/__fixture', handler); } }], resolve: { alias: { '@': resolve('.') } }, server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [resolve('.')] } } });
  await server.listen();
  console.log(`Group pages run-through listening at ${origin}; disposable PGlite only.`);
  const stop = async () => { await server.close(); await t.close(); process.exit(0); };
  process.once('SIGINT', () => void stop()); process.once('SIGTERM', () => void stop());
}
main().catch(error => { console.error(error); process.exitCode = 1; });

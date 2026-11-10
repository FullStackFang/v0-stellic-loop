import Link from 'next/link';
import { db } from '@/lib/db';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { listPortalGroups } from '@/lib/emba/groups';
import { listTeamEvents } from '@/lib/emba/team-events';
import { briefHistory, myRecentRecords, teamBrief, teamState } from '@/lib/emba/team-read';
import type { PersonView, RecordView } from '@/lib/emba/team-records';
import { EmbaError } from '@/lib/emba/errors';
import { assistantName } from '@/lib/emba/team-text';
import { ActionForm } from '@/components/emba/portal-forms';
import { BriefForm } from '@/components/emba/brief-form';
import { addTeamEvent, amendTeamRecord, announceToTeam, changeTeamEvent, retireTeamEvent, saveTeamBrief } from '../../team-actions';

export const dynamic = 'force-dynamic';
type Signed = NonNullable<Awaited<ReturnType<typeof getPortalPrincipal>>>;
async function load(principal: Signed, namespace: string) {
  const group = (await listPortalGroups(db(), principal)).find(item => item.namespace === namespace && item.slug === 'workspace');
  if (!group) return null;
  const scope = { orgId: group.orgId, loopId: group.loopId };
  const [state, brief, events, mine] = await Promise.all([teamState(db(), principal, scope), teamBrief(db(), principal, scope), listTeamEvents(db(), principal, scope), myRecentRecords(db(), principal, scope)]);
  // Only an owner or organizer can read the brief's history; that is also what decides who sees the editing controls.
  // Any other failure is a failure of the page, not a reason to show an organizer the member view.
  const history = await briefHistory(db(), principal, scope).catch(error => { if (error instanceof EmbaError && error.code === 'forbidden') return null; throw error; });
  return { group, scope, state, brief, events, mine, history };
}

const who = (person: PersonView) => person.isYou ? 'you' : person.handle ?? (person.former ? 'a former teammate' : 'a teammate');
const more = (count: number) => count > 0 && <p className="emba-meta">{count} more not shown.</p>;
const claimStatus = { open: 'Open', proposed: 'Proposed, waiting for its owner', done: 'Done', released: 'Released', declined: 'Declined' } as const;

export default async function TeamPage({ params }: { params: Promise<{ namespace: string }> }) {
  const principal = await getPortalPrincipal();
  if (!principal) return <section className="lt-editor"><h1>Group unavailable</h1><Link href="/emba/sign-in">Sign in</Link></section>;
  const { namespace } = await params;
  const data = await load(principal, namespace).catch(() => null);
  if (!data) return <section className="lt-editor"><h1>Group unavailable</h1><p role="alert">This private group is unavailable or your access changed.</p></section>;
  const { group, scope, state, brief, events, mine, history } = data;
  const manager = history !== null;
  const Act = ({ record, action, label }: { record: RecordView; action: string; label: string }) => <ActionForm action={amendTeamRecord} label={label}>
    <input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="loopId" value={scope.loopId} /><input type="hidden" name="number" value={record.number} /><input type="hidden" name="action" value={action} />
  </ActionForm>;
  const Meta = ({ record }: { record: RecordView }) => <span className="emba-meta"> #{record.number} · by {who(record.by)}{record.assistant ? ` via ${assistantName(record.assistant)}` : ''} · {record.createdAt.slice(0, 10)}{record.event ? ` · ${record.event}` : ''}</span>;
  const Shared = ({ record }: { record: RecordView }) => <>
    {record.tags.length > 0 && <span className="emba-meta"> · tagged: {record.tags.map(who).join(', ')}</span>}
    {record.tags.some(tag => tag.isYou) && <Act record={record} action="untag" label="Remove my tag" />}
    {(record.by.isYou || manager) && <Act record={record} action="withdraw" label="Withdraw" />}
  </>;
  return <>
    <p><Link href="/groups">Groups</Link> / <Link href={`/groups/${namespace}`}>{group.handle}</Link> / Team</p>
    <h1>{group.orgName}</h1>
    <p>What the team has decided, filed and taken on. Members and their assistants see the same records. Today is {state.today} ({state.timezone}).</p>
    <nav aria-label="Team sections"><a href="#brief">Brief</a> · <a href="#decisions">Decisions</a> · <a href="#claims">Claims</a> · <a href="#outputs">Outputs</a> · <a href="#events">Events</a> · <a href="#mine">Your recent saves</a></nav>

    <section className="lt-editor" id="brief"><h2>Brief</h2>
      <p>{brief.brief?.deadline ? <>Deadline: <strong>{brief.brief.deadline}</strong></> : 'No deadline is set.'}</p>
      {brief.brief?.body ? brief.brief.body.split('\n').map((line, index) => <p key={index}>{line || ' '}</p>) : <p>No brief has been written yet.</p>}
      {manager ? <details><summary>Edit the brief</summary><BriefForm action={saveTeamBrief} orgId={scope.orgId} loopId={scope.loopId} version={brief.brief?.version ?? 0} body={brief.brief?.body ?? ''} deadline={brief.brief?.deadline ?? ''} timezone={state.timezone} />{history!.length > 1 && <details><summary>Earlier versions</summary><ul>{history!.slice(1).map(item => <li key={item.version}>Version {item.version} · {item.editedAt.slice(0, 10)}{item.deadline ? ` · deadline ${item.deadline}` : ''}<br />{item.body.split('\n').map((line, index) => <span key={index}>{line}<br /></span>)}</li>)}</ul></details>}</details> : <p className="emba-meta">Owners and organizers edit the brief.</p>}
      <h3>Announcements</h3>
      {brief.announcements.length ? <ul>{brief.announcements.map(item => <li key={item.number}>{item.text}<Meta record={item} />{manager && <Act record={item} action="withdraw" label="Withdraw" />}</li>)}</ul> : <p>No announcements.</p>}
      {manager && <ActionForm action={announceToTeam} label="Post announcement"><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="loopId" value={scope.loopId} /><label>Announcement (at most 600 characters)<textarea name="text" required maxLength={600} /></label><p>It appears in the brief and in what is new. No message is sent to anyone.</p></ActionForm>}
    </section>

    <section className="lt-editor" id="decisions"><h2>Current decisions</h2>
      {state.decisions.items.length ? <ul>{state.decisions.items.map(item => <li key={item.number}><strong>{item.topic}</strong>: {item.statement}<Meta record={item} /><Shared record={item} /></li>)}</ul> : <p>No decisions yet.</p>}{more(state.decisions.more)}
      {state.conflicts.items.length > 0 && <><h3>Conflict flags</h3><ul>{state.conflicts.items.map(flag => <li key={`${flag.output}-${flag.decision}`}>Output #{flag.output} {flag.state === 'flagged' ? 'is marked as conflicting with' : 'needs a re-check against'} decision #{flag.decision}{flag.topic ? ` (${flag.topic})` : ' (withdrawn)'}.</li>)}</ul>{more(state.conflicts.more)}</>}
    </section>

    <section className="lt-editor" id="claims"><h2>Open claims</h2>
      {state.claims.items.length ? <ul>{state.claims.items.map(item => <li key={item.number}>{item.what} · <strong>{who(item.owner!)}</strong>{item.dueOn ? ` · due ${item.dueOn}` : ''}{item.pastDue ? ' (date passed)' : ''} · {claimStatus[item.claimStatus!]}{item.overlaps?.length ? ` · overlaps with ${item.overlaps.map(number => `#${number}`).join(', ')}` : ''}<Meta record={item} />
        {item.claimStatus === 'proposed' && item.owner?.isYou && <><Act record={item} action="confirm" label="Confirm: I will do this" /><Act record={item} action="decline" label="Decline" /></>}
        {item.claimStatus === 'open' && (item.owner?.isYou || item.by.isYou || manager) && <Act record={item} action="done" label="Mark done" />}
        {(item.owner?.isYou || item.by.isYou || manager) && !(item.claimStatus === 'proposed' && item.owner?.isYou) && <Act record={item} action="release" label="Release" />}
        <Shared record={item} /></li>)}</ul> : <p>No open claims.</p>}{more(state.claims.more)}
    </section>

    <section className="lt-editor" id="outputs"><h2>Current outputs</h2><p>Loop stores the link, not the file. Open a link only if you trust where it points.</p>
      {state.outputs.items.length ? <ul>{state.outputs.items.map(item => <li key={item.number}><a href={item.url} rel="noopener noreferrer nofollow" target="_blank">{item.title}</a> <span className="emba-meta">{item.host}{item.recognisedHost ? '' : ' · unrecognised host'}</span><br />{item.summary}
        {item.conflicts?.map(flag => <span key={flag.decision}><br />{flag.state === 'flagged' ? 'Marked as conflicting with' : 'Needs a re-check against'} decision #{flag.decision}{flag.topic ? ` (${flag.topic})` : ' (withdrawn)'}.</span>)}
        <Meta record={item} /><Shared record={item} /></li>)}</ul> : <p>No outputs filed yet.</p>}{more(state.outputs.more)}
    </section>

    <section className="lt-editor" id="events"><h2>Events</h2><p>An event is a label under the team, such as a deliverable. Outputs and claims can be filed to it as <strong>@{group.namespace}/event</strong>.</p>
      {events.length ? <ul>{events.map(event => <li key={event.id}><strong>@{group.namespace}/{event.slug}</strong> · {event.name}
        {manager && <details><summary>Rename or archive</summary><ActionForm action={changeTeamEvent} label="Rename"><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="eventId" value={event.id} /><label>Tag<input name="slug" required defaultValue={event.slug} maxLength={48} pattern="[a-z0-9][a-z0-9-]{1,47}" /></label><label>Name<input name="name" required defaultValue={event.name} maxLength={80} /></label></ActionForm>
          <ActionForm action={retireTeamEvent} label="Archive"><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="eventId" value={event.id} /><p>An archived event takes no new records. Its existing records stay in the team&apos;s history.</p></ActionForm></details>}</li>)}</ul> : <p>No events yet.</p>}
      {manager && <ActionForm action={addTeamEvent} label="Create event"><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="loopId" value={scope.loopId} /><label>Tag<input name="slug" required maxLength={48} pattern="[a-z0-9][a-z0-9-]{1,47}" placeholder="final-deck" /></label><label>Name<input name="name" required maxLength={80} placeholder="Final deck" /></label></ActionForm>}
    </section>

    <section className="lt-editor" id="mine"><h2>Your recent saves</h2><p>Everything saved under your name, with the assistant that saved it. Withdrawing removes the text and link for everyone.</p>
      {mine.length ? <ul>{mine.map(item => <li key={item.number}>{item.kind} · {item.title ?? item.statement ?? item.what ?? item.text} <span className="emba-meta">#{item.number} · {item.assistant ? `saved by ${assistantName(item.assistant)}` : 'saved on this site'} · {item.createdAt.slice(0, 10)} · {item.state}</span><Act record={item} action="withdraw" label="Withdraw" /></li>)}</ul> : <p>You have not saved anything to this team yet.</p>}
    </section>
  </>;
}

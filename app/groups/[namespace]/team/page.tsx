import Link from 'next/link';
import type { ReactNode } from 'react';
import { db } from '@/lib/db';
import { groupHandle, groupPath, type GroupRoute } from '@/lib/emba/group-path';
import { Crumbs, Inside } from '@/app/groups/group-nav';
import { dayNum, mon } from '@/lib/days';
import { getPortalPrincipal, openGroup } from '@/lib/emba/portal-session';
import { canAccessLoop } from '@/lib/emba/access';
import { listTeamEvents } from '@/lib/emba/team-events';
import { upcomingEvents, whatsOn } from '@/lib/emba/team-interest';
import { feedAddress } from '@/lib/emba/team-calendar';
import { arrivals } from '@/lib/emba/team-travel';
import { listAsks } from '@/lib/emba/team-asks';
import { briefHistory, myRecentRecords, teamBrief, teamState } from '@/lib/emba/team-read';
import type { PersonView, RecordView } from '@/lib/emba/team-records';
import { EmbaError } from '@/lib/emba/errors';
import { ActionForm } from '@/components/emba/portal-forms';
import { BriefForm } from '@/components/emba/brief-form';
import { EventCard, type EventWithWho } from '@/components/emba/event-card';
import { AskForm, AskRow } from '@/components/emba/ask-parts';
import { sendingOn } from '@/lib/emba/reach-send';
import { addTeamEvent, amendTeamRecord, announceToTeam, changeTeamEvent, restoreTeamEvent, retireTeamEvent, saveTeamBrief } from '../../team-actions';
import { cancelTeamIdea, changeTeamIdea, newCalendarAddress, proposeTeamIdea, removeMyTravel, saveMyTravel, sendTeamEventInvites } from '../../trip-actions';
import { CopyLink } from '@/components/emba/copy-link';
import { Arrow, Rings } from '@/components/LoopGlyphs';
import { Alert, Via } from '../../glyphs';
import { listResources } from '@/lib/emba/team-resources';
import type { Described, LinkView, TextView } from '@/lib/emba/team-resources';
import { ResourceBox } from '@/components/emba/resource-box';
import { addResource, removeResource, removeTeamLink, retryResource } from '../../resource-actions';

export const dynamic = 'force-dynamic';
type Signed = NonNullable<Awaited<ReturnType<typeof getPortalPrincipal>>>;
// The record is one section at a time, chosen by ?tab=. Every tab is a link, so a view can be shared and nothing depends on script.
const TABS = [['decisions', 'Decisions'], ['claims', 'Claims'], ['outputs', 'Outputs'], ['resources', 'Resources'], ['events', 'Events'], ['ideas', 'Ideas'], ['travel', 'Travel'], ['asks', 'Asks'], ['brief', 'Brief'], ['mine', 'Your saves']] as const;
type Tab = typeof TABS[number][0];

async function load(principal: Signed, route: GroupRoute, tab: Tab) {
  const opened = await openGroup(principal, route, scope => {
  const can = (action: 'manage' | 'post') => db().tx(q => canAccessLoop(q, principal, scope.orgId, scope.loopId, action));
  // A list only owners and organizers may read is empty for everyone else. Any other failure is a failure of the page.
  const managersOnly = <T,>(read: Promise<T[]>) => read.catch(error => { if (error instanceof EmbaError && error.code === 'forbidden') return [] as T[]; throw error; });
  // A read that only another tab shows is not made, and so is not recorded.
  const shown = <T,>(on: Tab[], read: () => Promise<T>): Promise<T | null> => on.includes(tab) ? read() : Promise.resolve(null);
  // Every read starts at once: the page waits for the slowest one, not for their sum.
  return Promise.all([
    // The header and the tab bar: where the team stands, its brief and counts, its event tags, and whether to show the editing controls.
    teamState(db(), principal, scope), teamBrief(db(), principal, scope), listTeamEvents(db(), principal, scope), can('manage'),
    // The shown tab. Followers read the upcoming list and the asks but cannot mark interest or ask.
    shown(['events'], () => upcomingEvents(db(), principal, { ...scope, people: true })), shown(['events'], () => managersOnly(listTeamEvents(db(), principal, { ...scope, archived: true }))),
    shown(['asks'], () => listAsks(db(), principal, scope)), shown(['events', 'asks', 'ideas', 'travel', 'resources'], () => can('post')),
    shown(['ideas'], () => whatsOn(db(), principal, scope)), shown(['ideas'], () => feedAddress(db(), principal, scope)), shown(['travel'], () => arrivals(db(), principal, scope)),
    shown(['brief'], () => managersOnly(briefHistory(db(), principal, scope))), shown(['mine'], () => myRecentRecords(db(), principal, scope)), shown(['resources'], () => listResources(db(), principal, scope))]);
  });
  if (!opened) return null;
  const { group, scope, data: [state, brief, events, manager, upcoming, archived, asks, canPost, on, feed, travel, history, mine, resources] } = opened;
  return { group, scope, state, brief, events, manager, upcoming, archived: archived ?? [], asks, canPost: canPost ?? false, on, feed, travel, history: history ?? [], mine: mine ?? [], resources };
}

const who = (person: PersonView) => person.isYou ? 'you' : person.handle ?? (person.former ? 'a former teammate' : 'a teammate');
const more = (count: number) => count > 0 && <p className="emba-meta">{count} more not shown.</p>;
const claimStatus = { open: 'Open', proposed: 'Proposed, waiting for its owner', done: 'Done', released: 'Released', declined: 'Declined' } as const;
/** "Nov 20" from a date or timestamp that starts YYYY-MM-DD. */
const shortDay = (value: string) => `${mon(value.slice(0, 10))} ${dayNum(value.slice(0, 10))}`;
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function Person({ person, clientId }: { person: PersonView; clientId: string | null | undefined }) {
  const name = who(person);
  return <div className="lp-who"><span className="lp-face" aria-hidden="true">{name.replace(/^an? /, '').split('/').pop()!.slice(0, 1).toUpperCase()}</span><div><span className="lp-name">{name === 'you' ? 'You' : name}</span>{clientId !== undefined && <Via clientId={clientId} />}</div></div>;
}

/** What an assistant worked out about a link or a text, or the plain statement that nothing has been. Words are the assistant's: React escapes them. */
function Tags({ item }: { item: Described }) {
  if (!item.described) return <p className="lp-tags"><span className="lp-chip lp-chip-off">Not described yet</span><span>An assistant fills this in when it first reads it</span></p>;
  const { kind, about, audience, foundOn } = item.tags;
  const rest = [about, audience && `For ${audience}`, foundOn && `Date in it: ${shortDay(foundOn)}`].filter(Boolean);
  return <>{item.tags.summary && <p className="lp-lsum">{item.tags.summary}</p>}{(kind || rest.length > 0) && <p className="lp-tags">{kind && <span className="lp-chip">{kind}</span>}{rest.map(part => <span key={part}>{part}</span>)}</p>}</>;
}
const Tile = ({ text }: { text?: boolean }) => <span className={`lp-tile${text ? ' lp-tile-text' : ''}`} aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{text ? <path d="M3 4.5h10M3 8h10M3 11.5h6" /> : <path d="M6.5 9.5 9.5 6.5M7 4.5l1-1a3 3 0 0 1 4.5 4.5l-1 1M9 11.5l-1 1A3 3 0 0 1 3.5 8l1-1" />}</svg></span>;
const textState = { accepted: 'Reading', extracting: 'Reading', indexing: 'Reading', ready: 'Ready', failed: 'Not read' } as const;

export default async function TeamPage({ params, searchParams }: { params: Promise<GroupRoute>; searchParams?: Promise<{ tab?: string | string[] }> }) {
  const principal = await getPortalPrincipal();
  if (!principal) return <section className="lt-editor"><h1>Group unavailable</h1><Link href={`/groups/sign-in?redirect_url=${encodeURIComponent(`${groupPath((await params).namespace, (await params).slug)}/team`)}`}>Sign in</Link></section>;
  const route = await params, base = groupPath(route.namespace, route.slug);
  const requested = (await searchParams)?.tab;
  const tab: Tab = TABS.find(([key]) => key === requested)?.[0] ?? 'decisions';
  const data = await load(principal, route, tab).catch(() => null);
  if (!data) return <section className="lt-editor"><h1>Group unavailable</h1><p role="alert">This private group is unavailable or your access changed.</p></section>;
  const { group, scope, state, brief, events, manager, mine, history, upcoming, canPost, archived, asks, on, feed, travel, resources } = data;
  const href = (to: Tab, record?: number) => `${base}/team?tab=${to}${record ? `#r${record}` : ''}`;

  const Act = ({ record, action, label }: { record: RecordView; action: string; label: string }) => <ActionForm action={amendTeamRecord} label={label}>
    <input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="loopId" value={scope.loopId} /><input type="hidden" name="number" value={record.number} /><input type="hidden" name="action" value={action} />
  </ActionForm>;
  /** Tags, then the actions every kind of record shares. */
  const shared = (record: RecordView): ReactNode[] => [
    record.tags.some(tag => tag.isYou) && <Act key="untag" record={record} action="untag" label="Remove my tag" />,
    (record.by.isYou || manager) && <Act key="withdraw" record={record} action="withdraw" label="Withdraw" />,
  ];
  const Row = ({ record, topic, children, actions, flagged }: { record: RecordView; topic?: string; children: ReactNode; actions: ReactNode[]; flagged?: boolean }) => {
    const shown = actions.filter(Boolean);
    return <li id={`r${record.number}`} className={`lp-row${topic === undefined ? '' : ' lp-row-topic'}${flagged ? ' lp-row-flagged' : ''}`}>
      <span className="lp-num">#{record.number}</span>
      {topic !== undefined && <span className="lp-topic">{topic}</span>}
      <div className="lp-what">{children}
        {(record.event || record.tags.length > 0) && <p className="lp-sub">{record.event && <span>@{group.namespace}/{record.event}</span>}{record.tags.length > 0 && <span>tagged: {record.tags.map(who).join(', ')}</span>}</p>}
        {shown.length > 0 && <div className="lp-acts">{shown}</div>}
      </div>
      <Person person={record.by} clientId={record.assistant} />
      <span className="lp-date">{shortDay(record.createdAt)}</span>
    </li>;
  };

  const counts = { decisions: state.decisions.items.length + state.decisions.more, claims: state.claims.items.length + state.claims.more, outputs: state.outputs.items.length + state.outputs.more, resources: brief.resources.links.items.length + brief.resources.links.more + brief.resources.texts.items.length + brief.resources.texts.more, events: events.length, asks: brief.asks.open };
  const pastDue = state.claims.items.filter(item => item.pastDue).length, waiting = state.claims.items.filter(item => item.claimStatus === 'proposed').length;
  const flagged = state.conflicts.items.length + state.conflicts.more;
  const latest = state.decisions.items.reduce<RecordView | null>((best, item) => !best || item.createdAt > best.createdAt ? item : best, null);
  const deadline = brief.brief?.deadline ?? null;
  const daysLeft = deadline ? Math.round((Date.parse(deadline) - Date.parse(state.today)) / 86_400_000) : null;
  const purpose = brief.brief?.body.split('\n').find(line => line.trim());
  // A start or end in the team's timezone, as a datetime-local field reads it.
  const asLocal = (instant: string | null) => instant ? new Date(instant).toLocaleString('sv-SE', { timeZone: state.timezone }).slice(0, 16).replace(' ', 'T') : '';
  const eventFields = (event?: { startsAt: string | null; endsAt: string | null; place: string | null; url: string | null; note: string | null }) => <>
    <label>Starts ({state.timezone})<input name="startsAt" type="datetime-local" defaultValue={asLocal(event?.startsAt ?? null)} /></label><label>Ends ({state.timezone})<input name="endsAt" type="datetime-local" defaultValue={asLocal(event?.endsAt ?? null)} /></label>
    <label>Place<input name="place" maxLength={120} defaultValue={event?.place ?? ''} /></label><label>Link (https)<input name="url" type="url" maxLength={8000} defaultValue={event?.url ?? ''} /></label><label>Note<textarea name="note" maxLength={600} defaultValue={event?.note ?? ''} /></label>
    {event && <p className="emba-meta">Clearing a box removes that fact from the event.</p>}</>;
  const scopeFields = <><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="loopId" value={scope.loopId} /></>;

  const IdeaItem = ({ event }: { event: EventWithWho }) => <EventCard event={event} scope={scope} route="site" canPost={canPost}>
    {canPost && event.idea && (event.idea.youProposed || manager) && <details><summary>Change or cancel</summary>
      <ActionForm action={changeTeamIdea} label="Save changes">{scopeFields}<input type="hidden" name="event" value={event.slug} /><label>What<input name="name" required maxLength={120} defaultValue={event.name} /></label>{eventFields(event)}
        {!event.startsAt && <><label>Days on offer (YYYY-MM-DD, separated by commas)<input name="offeredDays" maxLength={120} defaultValue={event.idea.offeredDays.join(', ')} /></label><label>The day, if those who are in could not settle it<input name="day" type="date" defaultValue={event.idea.day ?? ''} /></label></>}</ActionForm>
      <ActionForm action={cancelTeamIdea} label="Cancel it">{scopeFields}<input type="hidden" name="event" value={event.slug} /><p>A cancelled idea or plan does not come back.{event.idea.state === 'planned' ? ' Everyone who had its calendar invite gets a cancellation.' : ''}</p></ActionForm></details>}
  </EventCard>;

  return <>
    <Crumbs trail={group.trail}><span className="lp-today">Today is {state.today} ({state.timezone})</span></Crumbs>

    <header className="lp-plate">
      <Rings className="lp-mark" inline />
      <div><p className="lp-handle">{groupHandle(group)}</p><h1>{group.orgName}</h1><p>{purpose ?? 'No brief has been written yet.'}</p></div>
      {deadline && daysLeft !== null && <div className="lp-dateblock"><time dateTime={deadline}><span>{mon(deadline)}</span><b>{dayNum(deadline)}</b><span>{deadline.slice(0, 4)}</span></time><div><span>Deadline</span><b>{daysLeft > 0 ? `${plural(daysLeft, 'day')} left` : daysLeft === 0 ? 'Due today' : `${plural(-daysLeft, 'day')} past`}</b></div></div>}
    </header>

    <Inside group={group} />

    <nav className="lp-facts" aria-label="Where the team stands">
      <Link href={href('decisions')} scroll={false}><b>{plural(counts.decisions, 'decision')}</b><span>{latest ? `Latest ${shortDay(latest.createdAt)} · ${latest.topic}` : 'None recorded yet'}</span></Link>
      <Link href={href('claims')} scroll={false}><b>{plural(counts.claims, 'open claim')}</b><span>{pastDue > 0 && <span className="lp-warn"><Alert />{pastDue} past due</span>}{pastDue > 0 && waiting > 0 && ' · '}{waiting > 0 && `${waiting} waiting on owner`}{pastDue + waiting === 0 && (counts.claims ? 'None past due' : 'Nothing taken on yet')}</span></Link>
      <Link href={href('outputs')} scroll={false}><b>{plural(counts.outputs, 'output')}</b><span>{flagged > 0 ? <><span className="lp-warn"><Alert />{flagged} flagged</span> against a decision</> : counts.outputs ? 'No conflicts flagged' : 'Nothing filed yet'}</span></Link>
      <Link href={href('events')} scroll={false}><b>{plural(counts.events, 'event')}</b><span>{events.length ? events.slice(0, 2).map(event => event.name).join(' · ') : 'Labels for deliverables'}</span></Link>
    </nav>

    <div className="lp-record">
      <div>
        <nav className="lp-tabs" aria-label="Team sections">{TABS.map(([key, label]) => <Link key={key} href={href(key)} scroll={false} aria-current={key === tab ? 'page' : undefined}>{label}{key in counts && <span>{counts[key as keyof typeof counts]}</span>}</Link>)}</nav>

        {tab === 'decisions' && <section id="decisions" aria-label="Current decisions">
          {state.decisions.items.length ? <ul className="lp-list">{state.decisions.items.map(item => <Row key={item.number} record={item} topic={item.topic} actions={shared(item)}>
            <p className="lp-stmt">{item.statement}</p>
            {state.conflicts.items.filter(flag => flag.decision === item.number).map(flag => <Link key={flag.output} className="lp-ref" href={href('outputs', flag.output)}><Alert />Output #{flag.output} {flag.state === 'flagged' ? 'is marked as conflicting with this decision' : 'needs a re-check against this decision'}<Arrow /></Link>)}
          </Row>)}</ul> : <p className="lp-empty">No decisions yet. When someone settles a question, their assistant records it here so nobody has to explain it twice.</p>}{more(state.decisions.more)}
          {state.conflicts.items.some(flag => !state.decisions.items.some(item => item.number === flag.decision)) && <><h3>Other conflict flags</h3><ul className="lp-plain">{state.conflicts.items.filter(flag => !state.decisions.items.some(item => item.number === flag.decision)).map(flag => <li key={`${flag.output}-${flag.decision}`}>Output #{flag.output} {flag.state === 'flagged' ? 'is marked as conflicting with' : 'needs a re-check against'} decision #{flag.decision}{flag.topic ? ` (${flag.topic})` : ' (withdrawn)'}.</li>)}</ul></>}{more(state.conflicts.more)}
        </section>}

        {tab === 'claims' && <section id="claims" aria-label="Open claims">
          {state.claims.items.length ? <ul className="lp-list">{state.claims.items.map(item => <Row key={item.number} record={item} flagged={item.pastDue} actions={[
            item.claimStatus === 'proposed' && item.owner?.isYou && <Act key="confirm" record={item} action="confirm" label="Confirm: I will do this" />,
            item.claimStatus === 'proposed' && item.owner?.isYou && <Act key="decline" record={item} action="decline" label="Decline" />,
            item.claimStatus === 'open' && (item.owner?.isYou || item.by.isYou || manager) && <Act key="done" record={item} action="done" label="Mark done" />,
            (item.owner?.isYou || item.by.isYou || manager) && !(item.claimStatus === 'proposed' && item.owner?.isYou) && <Act key="release" record={item} action="release" label="Release" />,
            ...shared(item)]}>
            <p className="lp-stmt">{item.what}</p>
            <p className="lp-sub"><span>Owner: <strong>{who(item.owner!)}</strong></span>{item.dueOn && <span className={item.pastDue ? 'lp-warn' : undefined}>{item.pastDue && <Alert />}due {shortDay(item.dueOn)}{item.pastDue ? ' (date passed)' : ''}</span>}<span className={`lp-chip${item.claimStatus === 'open' ? ' lp-chip-open' : ''}`}>{claimStatus[item.claimStatus!]}</span>{item.overlaps?.length ? <span>overlaps with {item.overlaps.map(number => `#${number}`).join(', ')}</span> : null}</p>
          </Row>)}</ul> : <p className="lp-empty">No open claims. A claim says who has taken something on, so two people do not do the same work.</p>}{more(state.claims.more)}
        </section>}

        {tab === 'outputs' && <section id="outputs" aria-label="Current outputs"><p className="emba-meta">Loop stores the link, not the file. Open a link only if you trust where it points.</p>
          {state.outputs.items.length ? <ul className="lp-list">{state.outputs.items.map(item => <Row key={item.number} record={item} flagged={!!item.conflicts?.length} actions={shared(item)}>
            <p className="lp-stmt"><a href={item.url} rel="noopener noreferrer nofollow" target="_blank">{item.title}</a> <span className="emba-meta">{item.host}{item.recognisedHost ? '' : ' · unrecognised host'}</span></p>
            <p>{item.summary}</p>
            {item.conflicts?.map(flag => <Link key={flag.decision} className="lp-ref" href={href('decisions', flag.decision)}><Alert />{flag.state === 'flagged' ? 'Marked as conflicting with' : 'Needs a re-check against'} decision #{flag.decision}{flag.topic ? ` (${flag.topic})` : ' (withdrawn)'}<Arrow /></Link>)}
          </Row>)}</ul> : <p className="lp-empty">No outputs filed yet. An output is a link to finished work, filed so every assistant can find it.</p>}{more(state.outputs.more)}
        </section>}

        {tab === 'resources' && resources && <section id="resources" aria-label="Resources" className="lp-resources">
          {canPost ? <ResourceBox action={addResource} orgId={scope.orgId} loopId={scope.loopId} /> : <p className="emba-meta">You follow this group and can read it. Only members can add to Resources.</p>}
          <p className="emba-meta">The tags under each one are worked out by an assistant from what it read: what it is, what it is for, who it is for, and any date in it. Nobody types them.</p>
          <div className="lp-lhead"><h3>Links</h3><span>{plural(resources.links.items.length + resources.links.more, 'link')}. Loop keeps the address, not what it points at. Open a link only if you trust where it points.</span></div>
          {resources.links.items.length ? <ul className="lp-list">{resources.links.items.map((link: LinkView) => <li key={link.id} className="lp-lrow"><Tile />
            <div className="lp-lwhat"><a href={link.url} rel="noopener noreferrer nofollow" target="_blank">{link.name}</a><span className="lp-host">{link.host}{link.recognisedHost ? '' : ' · unrecognised host'}</span><Tags item={link} /></div>
            <Person person={link.by} clientId={link.assistant} /><span className="lp-date">{shortDay(link.at)}</span>
            <div className="lp-lacts">{link.mayRemove && canPost && <ActionForm action={removeTeamLink} label="Remove">{scopeFields}<input type="hidden" name="id" value={link.id} /></ActionForm>}</div></li>)}</ul>
            : <p className="lp-empty">No links yet. Add the team&apos;s shared folder, the syllabus, or any page your assistants should know about.</p>}{more(resources.links.more)}
          <div className="lp-lhead"><h3>Texts</h3><span>Pasted or read from a file. The file itself is not kept.</span></div>
          {resources.texts.items.length ? <ul className="lp-list">{resources.texts.items.map((text: TextView) => <li key={text.id} className="lp-lrow"><Tile text />
            <div className="lp-lwhat"><Link href={`${base}/resources/${text.id}?version=${text.version}`}>{text.name}</Link><span className="lp-host">Version {text.version}</span><Tags item={text} /></div>
            <Person person={text.by} clientId={text.assistant} /><span className="lp-date">{shortDay(text.at)}</span>
            <div className="lp-lacts"><span className={`lp-chip${text.state === 'ready' ? '' : ' lp-chip-off'}`}>{textState[text.state]}{text.failedStage ? ` (${text.failedStage} failed)` : ''}</span>
              {text.state !== 'ready' && text.by.isYou && canPost && <ActionForm action={retryResource} label="Retry">{scopeFields}<input type="hidden" name="documentId" value={text.id} /><input type="hidden" name="version" value={text.version} /></ActionForm>}
              {text.mayRemove && canPost && <ActionForm action={removeResource} label="Remove"><input type="hidden" name="documentId" value={text.id} /><input type="hidden" name="version" value={text.version} /></ActionForm>}</div></li>)}</ul>
            : <p className="lp-empty">No texts yet.</p>}{more(resources.texts.more)}
        </section>}

        {tab === 'events' && upcoming && <section id="events" aria-label="Events"><p className="emba-meta">An event is a label under the team, such as a deliverable. Outputs and claims can be filed to it as <strong>@{group.namespace}/event</strong>.</p>
          <h3>Upcoming events</h3><p className="emba-meta">Times are in {state.timezone}.</p>
          {upcoming.events.items.length ? <ul className="lp-list">{upcoming.events.items.map(event => <EventCard key={event.slug} event={event as EventWithWho} scope={scope} route="site" canPost={canPost} />)}</ul> : <p className="lp-empty">No upcoming events.</p>}{more(upcoming.events.more)}
          <h3>Event tags</h3>
          {events.length ? <ul className="lp-list">{events.map(event => <li key={event.id} className="lp-event"><span className="lp-topic">@{group.namespace}/{event.slug}</span><div className="lp-what"><p className="lp-stmt">{event.name}</p>
            {manager && <details><summary>Rename or archive</summary><ActionForm action={changeTeamEvent} label="Rename"><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="eventId" value={event.id} /><label>Tag<input name="slug" required defaultValue={event.slug} maxLength={48} pattern="[a-z0-9][a-z0-9\-]{1,47}" /></label><label>Name<input name="name" required defaultValue={event.name} maxLength={80} /></label>{eventFields(event)}</ActionForm>
              <ActionForm action={retireTeamEvent} label="Archive"><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="eventId" value={event.id} /><p>An archived event takes no new records. Its existing records stay in the team&apos;s history.</p></ActionForm>
              {event.startsAt && <ActionForm action={sendTeamEventInvites} label="Send as a calendar invite">{scopeFields}<input type="hidden" name="event" value={event.slug} /><p>Goes by email to the members who marked interest and allow email from this group. It names no other member. Later changes to the time or place update the same calendar entry.</p></ActionForm>}</details>}</div></li>)}</ul> : <p className="lp-empty">No events yet.</p>}
          {manager && <div className="lt-editor"><h3>New event</h3><ActionForm action={addTeamEvent} label="Create event">{scopeFields}<label>Tag<input name="slug" required maxLength={48} pattern="[a-z0-9][a-z0-9\-]{1,47}" placeholder="final-deck" /></label><label>Name<input name="name" required maxLength={80} placeholder="Final deck" /></label>{eventFields()}</ActionForm></div>}
          {manager && archived.length > 0 && <div className="lt-editor"><h3>Archived events</h3><ul className="lp-plain">{archived.map(event => <li key={event.id}>@{group.namespace}/{event.slug} · {event.name}<ActionForm action={restoreTeamEvent} label="Restore"><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="eventId" value={event.id} /></ActionForm></li>)}</ul></div>}
        </section>}

        {tab === 'ideas' && on && <section id="ideas" aria-label="Ideas and plans"><p className="emba-meta">An idea is something a member proposes, with the number of people it needs. Once it has them, a start time and a place, it is a plan and goes to the calendars of those who are in. Times are in {state.timezone}.</p>
          <h3>Plans</h3>
          {on.plans.length ? <ul className="lp-list">{on.plans.map(event => <IdeaItem key={event.slug} event={event} />)}</ul> : <p className="lp-empty">No plans yet.</p>}
          <h3>Ideas</h3><p className="emba-meta">Those closest to the number they need come first.</p>
          {on.ideas.items.length ? <ul className="lp-list">{on.ideas.items.map(event => <IdeaItem key={event.slug} event={event} />)}</ul> : <p className="lp-empty">No open ideas. Propose one below, or ask your assistant to.</p>}{more(on.ideas.more)}
          {canPost ? <div className="lt-editor"><h3>Propose an idea</h3><ActionForm action={proposeTeamIdea} label="Propose">{scopeFields}<label>What<input name="name" required maxLength={120} placeholder="Buy suits" /></label><label>People it needs, you included<input name="needed" type="number" min={2} max={20} defaultValue={3} required /></label>{eventFields()}
            <label>Days you could do it, if there is no start yet (YYYY-MM-DD, separated by commas)<input name="offeredDays" maxLength={120} /></label><p>You are counted as in. Leave the start empty and Loop asks those who are in to choose a day once there are enough of them.</p></ActionForm></div> : <p className="emba-meta">You follow this group and can read it. Only members can propose.</p>}
          <div className="lt-editor"><h3>In your calendar</h3><p className="emba-meta">A private address for this group&apos;s fixed events and plans. Add it to Google, Apple or Outlook calendar as a subscription. It shows names, times and places of events, and nobody&apos;s name. Anyone who has the address can read it, so keep it to yourself.</p>
            {feed && <p><input readOnly value={feed} aria-label="Your calendar address" /> <CopyLink url={feed} /></p>}
            <ActionForm action={newCalendarAddress} label={feed ? 'Replace the address' : 'Make my calendar address'}>{scopeFields}{feed && <p>The address above stops working at once.</p>}</ActionForm></div>
        </section>}

        {tab === 'travel' && travel && <section id="travel" aria-label="Travel"><p className="emba-meta">When and where each member said they arrive and leave. It is what members stated; Loop checks no flight. Times are in {state.timezone}.</p>
          {travel.entries.items.length ? <ul className="lp-list">{travel.entries.items.map((entry, index) => <li key={index} className="lp-event"><span className="lp-topic">{entry.arrival?.when ?? 'No arrival stated'}</span><div className="lp-what">
            <p className="lp-stmt">{entry.who.isYou ? 'You' : entry.who.name ?? entry.who.handle ?? 'A teammate'}{(entry.nearYourArrival || entry.nearYourDeparture) && <span className="lp-chip lp-chip-open">{entry.nearYourArrival ? 'Arrives near you' : 'Leaves near you'}</span>}</p>
            <p className="lp-sub">{entry.arrival && <span>Arrives{entry.arrival.place ? ` ${entry.arrival.place}` : ''}{entry.arrival.flight ? ` · ${entry.arrival.flight}` : ''}</span>}{entry.departure && <span>Leaves {entry.departure.when}{entry.departure.place ? ` · ${entry.departure.place}` : ''}{entry.departure.flight ? ` · ${entry.departure.flight}` : ''}</span>}{entry.stay && <span>Staying: {entry.stay}</span>}<span>changed {entry.changedOn}</span></p>
          </div></li>)}</ul> : <p className="lp-empty">Nobody has stated their travel yet.</p>}{more(travel.entries.more)}
          {canPost ? <div className="lt-editor"><h3>Your travel</h3><ActionForm action={saveMyTravel} label="Save my travel">{scopeFields}
            <label>Arrive ({state.timezone})<input name="arrivesAt" type={travel.yours?.arrival && !travel.yours.arrival.timed ? 'date' : 'datetime-local'} defaultValue={travel.yours?.arrival ? (travel.yours.arrival.timed ? asLocal(travel.yours.arrival.at) : asLocal(travel.yours.arrival.at).slice(0, 10)) : ''} /></label><label>Arrive where<input name="arrivesPlace" maxLength={120} defaultValue={travel.yours?.arrival?.place ?? ''} /></label><label>Flight<input name="arrivesFlight" maxLength={12} defaultValue={travel.yours?.arrival?.flight ?? ''} /></label>
            <label>Leave ({state.timezone})<input name="departsAt" type={travel.yours?.departure && !travel.yours.departure.timed ? 'date' : 'datetime-local'} defaultValue={travel.yours?.departure ? (travel.yours.departure.timed ? asLocal(travel.yours.departure.at) : asLocal(travel.yours.departure.at).slice(0, 10)) : ''} /></label><label>Leave from<input name="departsPlace" maxLength={120} defaultValue={travel.yours?.departure?.place ?? ''} /></label><label>Flight<input name="departsFlight" maxLength={12} defaultValue={travel.yours?.departure?.flight ?? ''} /></label>
            <label>Staying at<input name="stay" maxLength={120} defaultValue={travel.yours?.stay ?? ''} /></label><p>Members and followers of this group can see it. Nobody else can.</p></ActionForm>
            {travel.yours && <ActionForm action={removeMyTravel} label="Remove my travel">{scopeFields}</ActionForm>}</div> : <p className="emba-meta">You follow this group and can read it. Only members state travel.</p>}
        </section>}

        {tab === 'asks' && asks && <section id="asks" aria-label="Asks"><p className="emba-meta">An ask is one question to the group with a closing time. Each member answers once. Times are in {state.timezone}.</p>
          <h3>Open asks</h3>
          {asks.open.items.length ? <ul className="lp-list">{asks.open.items.map(ask => <AskRow key={ask.number} ask={ask} />)}</ul> : <p className="lp-empty">No open asks.</p>}{more(asks.open.more)}
          <h3>Closed in the last 7 days</h3>
          {asks.closed.items.length ? <ul className="lp-list">{asks.closed.items.map(ask => <AskRow key={ask.number} ask={ask} />)}</ul> : <p className="lp-empty">Nothing closed recently.</p>}{more(asks.closed.more)}
          {canPost ? <div className="lt-editor"><h3>New ask</h3><AskForm scope={scope} timezone={state.timezone} /></div> : <p className="emba-meta">You follow this group and can read it. Only members can ask.</p>}
        </section>}

        {tab === 'brief' && <section id="brief" aria-label="Brief" className="lt-editor lp-brief">
          <p className="emba-meta">{deadline ? <>Deadline: <strong>{deadline}</strong></> : 'No deadline is set.'}</p>
          {brief.brief?.body ? brief.brief.body.split('\n').map((line, index) => <p key={index}>{line || ' '}</p>) : <p>No brief has been written yet.</p>}
          {manager ? <details><summary>Edit the brief</summary><BriefForm action={saveTeamBrief} orgId={scope.orgId} loopId={scope.loopId} version={brief.brief?.version ?? 0} body={brief.brief?.body ?? ''} deadline={brief.brief?.deadline ?? ''} timezone={state.timezone} />{history.length > 1 && <details><summary>Earlier versions</summary><ul className="lp-plain">{history.slice(1).map(item => <li key={item.version}>Version {item.version} · {item.editedAt.slice(0, 10)}{item.deadline ? ` · deadline ${item.deadline}` : ''}<br />{item.body.split('\n').map((line, index) => <span key={index}>{line}<br /></span>)}</li>)}</ul></details>}</details> : <p className="emba-meta">Owners and organizers edit the brief.</p>}
        </section>}

        {tab === 'mine' && <section id="mine" aria-label="Your recent saves"><p className="emba-meta">Everything saved under your name, with the assistant that saved it. Withdrawing removes the text and link for everyone.</p>
          {mine.length ? <ul className="lp-list">{mine.map(item => <li key={item.number} className="lp-row lp-row-topic"><span className="lp-num">#{item.number}</span><span className="lp-topic">{item.kind}</span>
            <div className="lp-what"><p className="lp-stmt">{item.title ?? item.statement ?? item.what ?? item.text}</p><div className="lp-acts"><Act record={item} action="withdraw" label="Withdraw" /></div></div>
            <div className="lp-who"><div><Via clientId={item.assistant} verb="saved by" /><span className="emba-meta">{item.state}</span></div></div><span className="lp-date">{shortDay(item.createdAt)}</span></li>)}</ul> : <p className="lp-empty">You have not saved anything to this team yet.</p>}
        </section>}
      </div>

      <aside className="lp-aside">
        <section className="lt-editor"><h2>Announcements</h2>
          {brief.announcements.length ? <ul className="lp-plain">{brief.announcements.map(item => <li key={item.number}><p className="lp-stmt">{item.text}</p><Person person={item.by} clientId={item.assistant} /><p className="emba-meta">#{item.number} · {shortDay(item.createdAt)}</p>{manager && <Act record={item} action="withdraw" label="Withdraw" />}</li>)}</ul> : <p className="emba-meta">No announcements.</p>}
          {manager && <details><summary>Post an announcement</summary><ActionForm action={announceToTeam} label="Post announcement">{scopeFields}<label>Announcement (at most 600 characters)<textarea name="text" required maxLength={600} /></label>{sendingOn() ? <><label className="lt-check"><input type="checkbox" name="send" value="true" />Send to members</label><p>It appears in the brief and in what is new. Ticked, it also goes to each member the way they chose, and to nobody who chose not to be messaged.</p></> : <p>It appears in the brief and in what is new. No message is sent to anyone.</p>}</ActionForm></details>}
        </section>
        {manager && <section className="lt-editor"><h2>Organize</h2><p className="emba-meta">Interest in each event by day, and how each open ask is filling.</p><Link className="lp-btn" href={`${groupPath(group.namespace, group.slug)}/organize`}>Open the organizer view<Arrow /></Link></section>}
        <section className="lt-editor"><h2>Your assistant</h2><p className="emba-meta">Connect Claude or another assistant once, and it reads this record before it drafts anything for the team.</p><Link className="lp-btn" href="/groups/connections">Connect an assistant<Arrow /></Link></section>
      </aside>
    </div>
  </>;
}

import Link from 'next/link';
import type { ReactNode } from 'react';
import { db } from '@/lib/db';
import { dayNum, mon } from '@/lib/days';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { listPortalGroups } from '@/lib/emba/groups';
import { canAccessLoop } from '@/lib/emba/access';
import { listTeamEvents } from '@/lib/emba/team-events';
import { upcomingEvents } from '@/lib/emba/team-interest';
import { listAsks } from '@/lib/emba/team-asks';
import { briefHistory, myRecentRecords, teamBrief, teamState } from '@/lib/emba/team-read';
import type { PersonView, RecordView } from '@/lib/emba/team-records';
import { EmbaError } from '@/lib/emba/errors';
import { ActionForm } from '@/components/emba/portal-forms';
import { BriefForm } from '@/components/emba/brief-form';
import { EventCard, type EventWithWho } from '@/components/emba/event-card';
import { AskForm, AskRow } from '@/components/emba/ask-parts';
import { addTeamEvent, amendTeamRecord, announceToTeam, changeTeamEvent, restoreTeamEvent, retireTeamEvent, saveTeamBrief } from '../../team-actions';
import { Arrow, Rings } from '@/components/LoopGlyphs';
import { Alert, Via } from '../../glyphs';

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
  // Followers read the upcoming list but cannot mark interest; archived events are listed for owners and organizers only.
  const [upcoming, canPost, archived, asks] = await Promise.all([upcomingEvents(db(), principal, { ...scope, people: true }), db().tx(q => canAccessLoop(q, principal, scope.orgId, scope.loopId, 'post')), history === null ? [] : listTeamEvents(db(), principal, { ...scope, archived: true }), listAsks(db(), principal, scope)]);
  return { group, scope, state, brief, events, mine, history, upcoming, canPost, archived, asks };
}

// The record is one section at a time, chosen by ?tab=. Every tab is a link, so a view can be shared and nothing depends on script.
const TABS = [['decisions', 'Decisions'], ['claims', 'Claims'], ['outputs', 'Outputs'], ['events', 'Events'], ['asks', 'Asks'], ['brief', 'Brief'], ['mine', 'Your saves']] as const;
type Tab = typeof TABS[number][0];

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

export default async function TeamPage({ params, searchParams }: { params: Promise<{ namespace: string }>; searchParams?: Promise<{ tab?: string | string[] }> }) {
  const principal = await getPortalPrincipal();
  if (!principal) return <section className="lt-editor"><h1>Group unavailable</h1><Link href={`/groups/sign-in?redirect_url=${encodeURIComponent(`/groups/${(await params).namespace}/team`)}`}>Sign in</Link></section>;
  const { namespace } = await params;
  const data = await load(principal, namespace).catch(() => null);
  if (!data) return <section className="lt-editor"><h1>Group unavailable</h1><p role="alert">This private group is unavailable or your access changed.</p></section>;
  const { group, scope, state, brief, events, mine, history, upcoming, canPost, archived, asks } = data;
  const manager = history !== null;
  const requested = (await searchParams)?.tab;
  const tab: Tab = TABS.find(([key]) => key === requested)?.[0] ?? 'decisions';
  const href = (to: Tab, record?: number) => `/groups/${namespace}/team?tab=${to}${record ? `#r${record}` : ''}`;

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

  const counts = { decisions: state.decisions.items.length + state.decisions.more, claims: state.claims.items.length + state.claims.more, outputs: state.outputs.items.length + state.outputs.more, events: events.length, asks: asks.open.items.length + asks.open.more };
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

  return <>
    <p className="lp-crumbs"><Link href="/groups">Groups</Link><span aria-hidden="true">›</span><Link href={`/groups/${namespace}`}>{group.handle}</Link><span aria-hidden="true">›</span><b>Team</b><span className="lp-today">Today is {state.today} ({state.timezone})</span></p>

    <header className="lp-plate">
      <Rings className="lp-mark" inline />
      <div><p className="lp-handle">@{group.namespace}</p><h1>{group.orgName}</h1><p>{purpose ?? 'No brief has been written yet.'}</p></div>
      {deadline && daysLeft !== null && <div className="lp-dateblock"><time dateTime={deadline}><span>{mon(deadline)}</span><b>{dayNum(deadline)}</b><span>{deadline.slice(0, 4)}</span></time><div><span>Deadline</span><b>{daysLeft > 0 ? `${plural(daysLeft, 'day')} left` : daysLeft === 0 ? 'Due today' : `${plural(-daysLeft, 'day')} past`}</b></div></div>}
    </header>

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

        {tab === 'events' && <section id="events" aria-label="Events"><p className="emba-meta">An event is a label under the team, such as a deliverable. Outputs and claims can be filed to it as <strong>@{group.namespace}/event</strong>.</p>
          <h3>Upcoming events</h3><p className="emba-meta">Times are in {state.timezone}.</p>
          {upcoming.events.items.length ? <ul className="lp-list">{upcoming.events.items.map(event => <EventCard key={event.slug} event={event as EventWithWho} scope={scope} route="site" canPost={canPost} />)}</ul> : <p className="lp-empty">No upcoming events.</p>}{more(upcoming.events.more)}
          <h3>Event tags</h3>
          {events.length ? <ul className="lp-list">{events.map(event => <li key={event.id} className="lp-event"><span className="lp-topic">@{group.namespace}/{event.slug}</span><div className="lp-what"><p className="lp-stmt">{event.name}</p>
            {manager && <details><summary>Rename or archive</summary><ActionForm action={changeTeamEvent} label="Rename"><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="eventId" value={event.id} /><label>Tag<input name="slug" required defaultValue={event.slug} maxLength={48} pattern="[a-z0-9][a-z0-9-]{1,47}" /></label><label>Name<input name="name" required defaultValue={event.name} maxLength={80} /></label>{eventFields(event)}</ActionForm>
              <ActionForm action={retireTeamEvent} label="Archive"><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="eventId" value={event.id} /><p>An archived event takes no new records. Its existing records stay in the team&apos;s history.</p></ActionForm></details>}</div></li>)}</ul> : <p className="lp-empty">No events yet.</p>}
          {manager && <div className="lt-editor"><h3>New event</h3><ActionForm action={addTeamEvent} label="Create event">{scopeFields}<label>Tag<input name="slug" required maxLength={48} pattern="[a-z0-9][a-z0-9-]{1,47}" placeholder="final-deck" /></label><label>Name<input name="name" required maxLength={80} placeholder="Final deck" /></label>{eventFields()}</ActionForm></div>}
          {manager && archived.length > 0 && <div className="lt-editor"><h3>Archived events</h3><ul className="lp-plain">{archived.map(event => <li key={event.id}>@{group.namespace}/{event.slug} · {event.name}<ActionForm action={restoreTeamEvent} label="Restore"><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="eventId" value={event.id} /></ActionForm></li>)}</ul></div>}
        </section>}

        {tab === 'asks' && <section id="asks" aria-label="Asks"><p className="emba-meta">An ask is one question to the group with a closing time. Each member answers once. Times are in {state.timezone}.</p>
          <h3>Open asks</h3>
          {asks.open.items.length ? <ul className="lp-list">{asks.open.items.map(ask => <AskRow key={ask.number} ask={ask} />)}</ul> : <p className="lp-empty">No open asks.</p>}{more(asks.open.more)}
          <h3>Closed in the last 7 days</h3>
          {asks.closed.items.length ? <ul className="lp-list">{asks.closed.items.map(ask => <AskRow key={ask.number} ask={ask} />)}</ul> : <p className="lp-empty">Nothing closed recently.</p>}{more(asks.closed.more)}
          {canPost ? <div className="lt-editor"><h3>New ask</h3><AskForm scope={scope} timezone={state.timezone} /></div> : <p className="emba-meta">You follow this group and can read it. Only members can ask.</p>}
        </section>}

        {tab === 'brief' && <section id="brief" aria-label="Brief" className="lt-editor lp-brief">
          <p className="emba-meta">{deadline ? <>Deadline: <strong>{deadline}</strong></> : 'No deadline is set.'}</p>
          {brief.brief?.body ? brief.brief.body.split('\n').map((line, index) => <p key={index}>{line || ' '}</p>) : <p>No brief has been written yet.</p>}
          {manager ? <details><summary>Edit the brief</summary><BriefForm action={saveTeamBrief} orgId={scope.orgId} loopId={scope.loopId} version={brief.brief?.version ?? 0} body={brief.brief?.body ?? ''} deadline={brief.brief?.deadline ?? ''} timezone={state.timezone} />{history!.length > 1 && <details><summary>Earlier versions</summary><ul className="lp-plain">{history!.slice(1).map(item => <li key={item.version}>Version {item.version} · {item.editedAt.slice(0, 10)}{item.deadline ? ` · deadline ${item.deadline}` : ''}<br />{item.body.split('\n').map((line, index) => <span key={index}>{line}<br /></span>)}</li>)}</ul></details>}</details> : <p className="emba-meta">Owners and organizers edit the brief.</p>}
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
          {manager && <details><summary>Post an announcement</summary><ActionForm action={announceToTeam} label="Post announcement">{scopeFields}<label>Announcement (at most 600 characters)<textarea name="text" required maxLength={600} /></label><p>It appears in the brief and in what is new. No message is sent to anyone.</p></ActionForm></details>}
        </section>
        <section className="lt-editor"><h2>Your assistant</h2><p className="emba-meta">Connect Claude or another assistant once, and it reads this record before it drafts anything for the team.</p><Link className="lp-btn" href="/groups/connections">Connect an assistant<Arrow /></Link></section>
      </aside>
    </div>
  </>;
}

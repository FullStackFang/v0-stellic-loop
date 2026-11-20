import Link from 'next/link';
import type { ReactNode } from 'react';
import { db } from '@/lib/db';
import { groupHandle, groupPath, type GroupRoute } from '@/lib/emba/group-path';
import { Crumbs, Inside } from '@/app/groups/group-nav';
import { addDays, dayNum, dow, dowLong, mon } from '@/lib/days';
import { DaysRow } from '@/app/groups/days-row';
import { getPortalPrincipal, openGroup } from '@/lib/emba/portal-session';
import { canAccessLoop } from '@/lib/emba/access';
import { groupPictureMap, groupTile } from '@/lib/emba/group-picture';
import { GroupTile } from '@/app/groups/group-picture';
import { listTeamEvents } from '@/lib/emba/team-events';
import { upcomingEvents, whatsOn } from '@/lib/emba/team-interest';
import { feedAddress } from '@/lib/emba/team-calendar';
import { nearby, teamFeeds } from '@/lib/emba/team-nearby';
import { LinkBox } from '@/components/emba/link-box';
import { arrivals } from '@/lib/emba/team-travel';
import { listAsks } from '@/lib/emba/team-asks';
import { briefHistory, myRecentRecords, teamBrief, teamState } from '@/lib/emba/team-read';
import type { PersonView, RecordView } from '@/lib/emba/team-records';
import { EmbaError } from '@/lib/emba/errors';
import { ActionForm } from '@/components/emba/portal-forms';
import { BriefForm } from '@/components/emba/brief-form';
import { EventCard, type EventWithWho } from '@/components/emba/event-card';
import { AskForm, AskRow, askPath, nameOf } from '@/components/emba/ask-parts';
import { sendingOn } from '@/lib/emba/reach-send';
import { addTeamEvent, addTeamFeed, amendTeamRecord, announceToTeam, changeTeamEvent, joinNearbyEvent, linkTeamEvent, readTeamFeedNow, removeTeamFeed, restoreTeamEvent, retireTeamEvent, saveTeamBrief, setTeamFeedOn, setTeamInterest } from '../../team-actions';
import { cancelTeamIdea, changeTeamIdea, newCalendarAddress, proposeTeamIdea, removeMyTravel, saveMyTravel, sendTeamEventInvites } from '../../trip-actions';
import { CopyLink } from '@/components/emba/copy-link';
import { Arrow } from '@/components/LoopGlyphs';
import { Alert, Via } from '../../glyphs';
import { listResources } from '@/lib/emba/team-resources';
import type { Described, LinkView, TextView } from '@/lib/emba/team-resources';
import { ResourceBox } from '@/components/emba/resource-box';
import { addResource, removeResource, removeTeamLink, retryResource } from '../../resource-actions';

export const dynamic = 'force-dynamic';
// Drawing a group's picture, from the card on the group's tile, can take a minute.
export const maxDuration = 120;
type Signed = NonNullable<Awaited<ReturnType<typeof getPortalPrincipal>>>;
// The record is one section at a time, chosen by ?tab=. Every tab is a link, so a view can be shared and nothing depends on script.
// "All" opens first: what is coming up, a column a day, with what waits on the reader marked.
const TABS = [['all', 'All'], ['decisions', 'Decisions'], ['claims', 'Claims'], ['outputs', 'Outputs'], ['events', 'Events'], ['asks', 'Asks'], ['ideas', 'Ideas'], ['resources', 'Resources'], ['travel', 'Travel'], ['brief', 'Brief'], ['mine', 'Your saves']] as const;
type Tab = typeof TABS[number][0];
/** The sections kept under "More", with the group's Members page. */
const MORE: readonly Tab[] = ['brief', 'mine'];
/** How many days past today get a column of their own on "All"; anything further is under Later. */
const DAYS_AHEAD = 6;
/** How many settled things "All" lists. */
const SETTLED = 12;

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
    shown(['all', 'events'], () => upcomingEvents(db(), principal, { ...scope, people: true })), shown(['events'], () => managersOnly(listTeamEvents(db(), principal, { ...scope, archived: true }))),
    shown(['all', 'asks'], () => listAsks(db(), principal, scope)), shown(['all', 'events', 'asks', 'ideas', 'travel', 'resources'], () => can('post')),
    shown(['all', 'ideas'], () => whatsOn(db(), principal, scope)), shown(['ideas'], () => feedAddress(db(), principal, scope)), shown(['all', 'travel'], () => arrivals(db(), principal, scope)),
    shown(['brief'], () => managersOnly(briefHistory(db(), principal, scope))), shown(['mine'], () => myRecentRecords(db(), principal, scope)), shown(['resources'], () => listResources(db(), principal, scope)),
    // Nearby is listed to everyone in the group; the feeds, with their last results, only to owners and organizers.
    shown(['events'], () => nearby(db(), principal, scope)), shown(['events'], async () => await can('manage') ? teamFeeds(db(), principal, scope) : []), groupTile(db(), principal, scope)]);
  });
  if (!opened) return null;
  const { group, scope, data: [state, brief, events, manager, upcoming, archived, asks, canPost, on, feed, travel, history, mine, resources, near, feeds, tile] } = opened;
  return { group, scope, state, brief, events, manager, upcoming, archived: archived ?? [], asks, canPost: canPost ?? false, on, feed, travel, history: history ?? [], mine: mine ?? [], resources, near, feeds: feeds ?? [], tile, inside: await groupPictureMap(db(), group.inside.map(inner => inner.loopId)) };
}

const who = (person: PersonView) => person.isYou ? 'you' : person.handle ?? (person.former ? 'a former teammate' : 'a teammate');
const more = (count: number) => count > 0 && <p className="emba-meta">{count} more not shown.</p>;
const claimStatus = { open: 'Open', proposed: 'Proposed, waiting for its owner', done: 'Done', released: 'Released', declined: 'Declined' } as const;
/** "Nov 20" from a date or timestamp that starts YYYY-MM-DD. */
const shortDay = (value: string) => `${mon(value.slice(0, 10))} ${dayNum(value.slice(0, 10))}`;
/** "New York time" from America/New_York. */
const zoneName = (timezone: string) => `${timezone.split("/").pop()!.replace(/_/g, " ")} time`;
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** A card on "All": the day it falls on (null for no day), whether its date has passed, and what it wants from the reader, if anything. */
type Card = { key: string; day: string | null; over?: boolean; you?: string; cls: string; body: ReactNode };

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
  const tab: Tab = TABS.find(([key]) => key === requested)?.[0] ?? 'all';
  const data = await load(principal, route, tab).catch(() => null);
  if (!data) return <section className="lt-editor"><h1>Group unavailable</h1><p role="alert">This private group is unavailable or your access changed.</p></section>;
  const { group, scope, state, brief, events, manager, mine, history, upcoming, canPost, archived, asks, on, feed, travel, resources, near, feeds } = data;
  const href = (to: Tab, record?: number) => `${base}/team?tab=${to}${record ? `#r${record}` : ''}`;

  const Act = ({ record, action, label }: { record: RecordView; action: string; label: string }) => <ActionForm action={amendTeamRecord} label={label}>
    <input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="loopId" value={scope.loopId} /><input type="hidden" name="number" value={record.number} /><input type="hidden" name="action" value={action} />
  </ActionForm>;
  /** Tags, then the actions every kind of record shares. */
  const shared = (record: RecordView): ReactNode[] => [
    record.tags.some(tag => tag.isYou) && <Act key="untag" record={record} action="untag" label="Remove my tag" />,
    (record.by.isYou || manager) && <Act key="withdraw" record={record} action="withdraw" label="Withdraw" />,
  ];
  /** What its owner, its writer or a manager can do with a claim. `quick` leaves out Release, for the card on "All". */
  type Claim = typeof state.claims.items[number];
  const claimActs = (item: Claim, quick = false): ReactNode[] => [
    item.claimStatus === 'proposed' && item.owner?.isYou && <Act key="confirm" record={item} action="confirm" label="Confirm: I will do this" />,
    item.claimStatus === 'proposed' && item.owner?.isYou && <Act key="decline" record={item} action="decline" label="Decline" />,
    item.claimStatus === 'open' && (item.owner?.isYou || item.by.isYou || manager) && <Act key="done" record={item} action="done" label="Mark done" />,
    !quick && (item.owner?.isYou || item.by.isYou || manager) && !(item.claimStatus === 'proposed' && item.owner?.isYou) && <Act key="release" record={item} action="release" label="Release" />,
  ];
  const claimLook = (item: Claim) => `gt-claim${item.pastDue ? ' late' : item.claimStatus === 'proposed' ? ' asked' : ''}`;
  const claimLabel = (item: Claim) => { const owner = who(item.owner!); return item.claimStatus === 'proposed' ? `Asked of ${owner}` : owner === 'you' ? 'You have this' : `${owner} has this`; };
  /** One record, drawn as the kind of thing it is (app/groups/campus-look.css): `look` is its class, `stamp` the date stamped on a decision. */
  const Row = ({ record, look, label, stamp, children, actions }: { record: RecordView; look: string; label: string; stamp?: string; children: ReactNode; actions: ReactNode[] }) => {
    const shown = actions.filter(Boolean);
    return <li id={`r${record.number}`} className={`gt-it ${look}`}><div>
      {stamp && <span className="gt-stamp">{stamp}</span>}
      <p className="gt-kind"><span>{label}</span><i>#{record.number}</i></p>
      {children}
      {(record.event || record.tags.length > 0) && <p className="lp-sub">{record.event && <span>@{group.namespace}/{record.event}</span>}{record.tags.length > 0 && <span>tagged: {record.tags.map(who).join(', ')}</span>}</p>}
      <div className="gt-foot"><Person person={record.by} clientId={record.assistant} /><span>{shortDay(record.createdAt)}</span></div>
      {shown.length > 0 && <div className="lp-acts">{shown}</div>}
    </div></li>;
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

  // "All": everything with a day ahead of it, a column a day in the team's timezone, and what is settled as one line each.
  const today = state.today, horizon = addDays(today, DAYS_AHEAD);
  const dayIn = (instant: string) => new Date(instant).toLocaleDateString('sv-SE', { timeZone: state.timezone });
  /** Only a claim can be overdue. Anything else that began before today and is still listed is happening now. */
  const fromToday = (day: string | null) => day && day < today ? today : day;
  const cards: Card[] = tab !== 'all' ? [] : [
    // A decision of yours that an output is marked as conflicting with.
    ...state.conflicts.items.filter(flag => flag.state === 'flagged').flatMap(flag => { const item = state.decisions.items.find(each => each.number === flag.decision); return item?.by.isYou ? [{ flag, item }] : []; })
      .map(({ flag, item }): Card => ({ key: `d${item.number}-${flag.output}`, day: today, you: `Output #${flag.output} disagrees`, cls: 'gt-decision', body: <>
        <span className="gt-stamp">Decided {shortDay(item.createdAt)}</span><p className="gt-kind"><span>Decision · {item.topic}</span><i>#{item.number}</i></p>
        <p className="gt-stmt"><Link href={href('decisions', item.number)}>{item.statement}</Link></p>
        <div className="gt-foot"><span>You</span><Link className="gt-go" href={href('outputs', flag.output)}>See output #{flag.output}</Link></div></> })),
    ...state.claims.items.map((item): Card => { const mine = !!item.owner?.isYou, asked = item.claimStatus === 'proposed', acts = claimActs(item, true).filter(Boolean);
      return { key: `c${item.number}`, day: item.dueOn ?? (asked && mine ? today : null), over: item.pastDue, cls: claimLook(item),
        you: !mine ? undefined : asked ? 'Take it or pass' : item.dueOn ? `Yours, due ${shortDay(item.dueOn)}` : 'Yours',
        body: <><p className="gt-kind"><span>{claimLabel(item)}</span><i>#{item.number}</i></p><p className="gt-stmt"><Link href={href('claims', item.number)}>{item.what}</Link></p>
          <div className="gt-foot"><span>{item.dueOn ? `Due ${shortDay(item.dueOn)}${item.pastDue ? ' · date passed' : ''}` : 'No date set'}</span></div>
          {acts.length > 0 && <div className="lp-acts">{acts}</div>}</> }; }),
    ...(upcoming?.events.items ?? []).map((event): Card => { const day = event.startsAt ? dayIn(event.startsAt) : null;
      return { key: `e${event.slug}`, day: fromToday(day), cls: 'gt-event', body: <>
        <span className="gt-day">{day ? <><small>{dow(day)}</small><b>{dayNum(day)}</b><small>{mon(day)}</small></> : <small>No date</small>}</span>
        <div className="gt-in"><p className="gt-kind"><span>{event.idea ? 'Plan' : 'Event'}</span><i>@{group.namespace}/{event.slug}</i></p><p className="gt-stmt"><Link href={href('events')}>{event.name}</Link></p>
          {(event.starts || event.place) && <p className="gt-note">{[event.starts, event.place].filter(Boolean).join(' · ')}</p>}
          <div className="gt-foot"><span>{event.interested} {event.idea ? 'in' : 'interested'}</span>{event.youAreInterested && <span>You are in</span>}</div></div></> }; }),
    ...(asks?.open.items ?? []).map((ask): Card => { const wants = canPost && !ask.yourAnswer && !ask.forThoseIn;
      return { key: `a${ask.number}`, day: fromToday(dayIn(ask.closesAt)), you: wants ? 'Needs your answer' : undefined, cls: 'gt-ask', body: <>
        <p className="gt-kind"><span>Ask</span><i>Closes {ask.closes}</i></p><p className="gt-stmt"><Link href={askPath(ask)}>{ask.question}</Link></p>
        <p className="gt-meter" style={{ '--p': ask.expected ? ask.answered / ask.expected : 0 } as React.CSSProperties}><i /></p>
        <div className="gt-foot"><span>{nameOf(ask.by)} · {ask.answered} of {ask.expected} answered</span>{wants && <Link className="gt-go" href={askPath(ask)}>Answer</Link>}</div></> }; }),
    ...(on?.ideas.items ?? []).flatMap((event): Card[] => { const idea = event.idea; if (!idea) return [];
      const short = idea.needs === 1 && !event.youAreInterested && canPost;
      return [{ key: `i${event.slug}`, day: fromToday(idea.day ?? (event.startsAt ? dayIn(event.startsAt) : null)), you: short ? 'One more makes it a plan' : undefined, cls: `gt-idea${idea.needs === 1 ? ' near' : ''}`, body: <>
        <p className="gt-kind"><span>Idea</span><i>{event.starts ?? idea.day ?? 'No day yet'}</i></p><p className="gt-stmt"><Link href={href('ideas')}>{event.name}</Link></p>
        <p className="gt-seats">{Array.from({ length: Math.min(idea.needed, 8) }, (_, at) => <i key={at} className={at < event.interested ? 'in' : at === event.interested ? 'next' : undefined} />)}<small>{idea.needs ? `${idea.needs} more and it is a plan` : 'Has the people it needs'}</small></p>
        <div className="gt-foot">{event.youAreInterested ? <span>You are in</span> : canPost && <ActionForm action={setTeamInterest} label="I'm in">{scopeFields}<input type="hidden" name="event" value={event.slug} /><input type="hidden" name="interested" value="true" /><input type="hidden" name="route" value="site" /></ActionForm>}</div></> }]; }),
    ...(travel?.entries.items ?? []).flatMap((entry, at): Card[] => { const arrival = entry.arrival; if (!arrival || dayIn(arrival.at) < today) return [];
      return [{ key: `t${at}`, day: dayIn(arrival.at), cls: 'gt-travel', body: <>
        <p className="gt-kind"><span>Travel</span><i>{entry.stay}</i></p>
        <p className="gt-legs"><span><b>{arrival.when}</b><small>arrives{arrival.place ? ` ${arrival.place}` : ''}{arrival.flight ? ` · ${arrival.flight}` : ''}</small></span><i />
          <span>{entry.departure ? <><b>{entry.departure.when}</b><small>leaves{entry.departure.place ? ` ${entry.departure.place}` : ''}</small></> : <small>No departure stated</small>}</span></p>
        <div className="gt-foot"><span>{nameOf(entry.who)}</span>{entry.nearYourArrival && <span>Arrives near you</span>}</div></> }]; }),
  ];
  const laneOf = (card: Card) => card.over || (card.day !== null && card.day < today) ? 'over' : card.day === null || card.day > horizon ? 'later' : card.day;
  const tomorrow = addDays(today, 1), filled = new Set(cards.map(laneOf));
  const lanes = [...(filled.has('over') ? ['over'] : []), today, tomorrow, ...[...filled].filter(key => key > tomorrow && key <= horizon).sort(), ...(filled.has('later') ? ['later'] : [])]
    .map(key => ({ key, cards: cards.filter(card => laneOf(card) === key).sort((a, b) => Number(!!b.you) - Number(!!a.you)),
      tile: key === 'over' ? ['Late', '!'] : key === 'later' ? ['Then', '→'] : [dow(key), String(dayNum(key))],
      name: key === 'over' ? 'Overdue' : key === 'later' ? 'Later' : key === today ? 'Today' : key === tomorrow ? 'Tomorrow' : dowLong(key) }));
  const shownDecisions = new Set(cards.filter(card => card.cls === 'gt-decision').map(card => card.key.slice(1).split('-')[0]));
  const settledList = tab !== 'all' ? [] : [
    ...state.decisions.items.filter(item => !shownDecisions.has(String(item.number))).map(item => ({ key: `d${item.number}`, kind: 'decision', text: item.statement, sub: `Decision #${item.number} · ${item.topic} · ${who(item.by)}`, at: item.createdAt, href: href('decisions', item.number) })),
    ...state.outputs.items.map(item => ({ key: `o${item.number}`, kind: 'output', text: item.title, sub: `Output #${item.number} · ${item.host} · ${who(item.by)}`, at: item.createdAt, href: href('outputs', item.number) })),
    ...(asks?.closed.items ?? []).map(ask => ({ key: `a${ask.number}`, kind: 'ask', text: ask.question, sub: `Ask, closed · ${nameOf(ask.by)}`, at: ask.closesAt, href: askPath(ask) })),
  ].sort((a, b) => a.at < b.at ? 1 : -1).slice(0, SETTLED);
  const fact = (count: number, one: string) => <b>{count} <small>{count === 1 ? one : `${one}s`}</small></b>;
  const tabLink = ([key, label]: readonly [Tab, string]) => <Link key={key} href={href(key)} scroll={false} aria-current={key === tab ? 'page' : undefined}>{label}{key in counts && <span>{counts[key as keyof typeof counts]}</span>}</Link>;

  return <div className="gt">
    {group.trail.length > 1 && <Crumbs trail={group.trail} />}

    <section className="gt-tk gt-head"><div>
      <header className="gt-plate">
        {deadline ? <time className="gt-tile" dateTime={deadline}><small>{mon(deadline)}</small><b>{dayNum(deadline)}</b></time> : <GroupTile {...data.tile} name={group.orgName} />}
        <div><h1>{group.orgName}</h1>
          <p className="gt-handle"><span>{groupHandle(group)}</span>{daysLeft !== null && <em>{daysLeft > 0 ? `${plural(daysLeft, 'day')} left` : daysLeft === 0 ? 'Due today' : `${plural(-daysLeft, 'day')} past`}</em>}</p>
          <p>{purpose ?? 'No brief has been written yet.'}</p></div>
      </header>
      <nav className="gt-facts" aria-label="Where the team stands">
        <Link href={href('decisions')} scroll={false}>{fact(counts.decisions, 'decision')}<span>{latest ? `Latest ${shortDay(latest.createdAt)} · ${latest.topic}` : 'None recorded yet'}</span></Link>
        <Link href={href('claims')} scroll={false}>{fact(counts.claims, 'open claim')}<span>{pastDue > 0 && <span className="lp-warn"><Alert />{pastDue} past due</span>}{pastDue > 0 && waiting > 0 && ' · '}{waiting > 0 && `${waiting} waiting on owner`}{pastDue + waiting === 0 && (counts.claims ? 'None past due' : 'Nothing taken on yet')}</span></Link>
        <Link href={href('outputs')} scroll={false}>{fact(counts.outputs, 'output')}<span>{flagged > 0 ? <><span className="lp-warn"><Alert />{flagged} flagged</span> against a decision</> : counts.outputs ? 'No conflicts flagged' : 'Nothing filed yet'}</span></Link>
        <Link href={href('events')} scroll={false}>{fact(counts.events, 'event')}<span>{events.length ? events.slice(0, 2).map(event => event.name).join(' · ') : 'Labels for deliverables'}</span></Link>
      </nav>
    </div></section>

    <Inside group={group} pictures={data.inside} />

    <nav className="gt-tabs" aria-label="Team sections">{TABS.filter(([key]) => !MORE.includes(key)).map(tabLink)}
      <details className="gt-more" data-on={MORE.includes(tab) || undefined}><summary>{MORE.includes(tab) ? TABS.find(([key]) => key === tab)![1] : 'More'}<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6" /></svg></summary>
        <div><Link href={base}>Members</Link>{TABS.filter(([key]) => MORE.includes(key)).map(tabLink)}</div></details>
      <time dateTime={today}>{shortDay(today)} · {zoneName(state.timezone)}</time></nav>

    <div className="gt-strip">
      <div className="gt-pins">{brief.announcements.map(item => <section key={item.number} className="gt-pin"><h2>Announcement</h2><p className="lp-stmt">{item.text}</p><Person person={item.by} clientId={item.assistant} /><span className="gt-date">#{item.number} · {shortDay(item.createdAt)}</span>{manager && <Act record={item} action="withdraw" label="Withdraw" />}</section>)}</div>
      {manager && <details className="gt-post"><summary>Post an announcement</summary><div><ActionForm action={announceToTeam} label="Post announcement">{scopeFields}<label>Announcement (at most 600 characters)<textarea name="text" required maxLength={600} /></label>{sendingOn() ? <><label className="lt-check"><input type="checkbox" name="send" value="true" />Send to members</label><p>It appears in the brief and in what is new. Ticked, it also goes to each member the way they chose, and to nobody who chose not to be messaged.</p></> : <p>It appears in the brief and in what is new. No message is sent to anyone.</p>}</ActionForm></div></details>}
      {manager && <Link className="gt-btn" href={`${base}/organize`} title="Interest in each event by day, and how each open ask is filling.">Organizer view</Link>}
      <Link className="gt-btn" href="/groups/connections" title="Connect Claude or another assistant once, and it reads this record before it drafts anything for the team.">Connect an assistant</Link>
    </div>

    <div>
      <div>
        {tab === 'all' && <section id="gt-all" aria-label="What is coming up">
          <DaysRow>{lanes.map(lane => { const mine = lane.cards.filter(card => card.you).length;
            return <section key={lane.key} className="gt-col" aria-label={lane.name}>
              <header><span className={`gt-dtile${lane.key === today ? ' today' : lane.key === 'over' ? ' over' : lane.key === 'later' ? ' later' : ''}`}><small>{lane.tile[0]}</small><b>{lane.tile[1]}</b></span>
                <h3 className="gt-dl">{lane.name}<span>{lane.cards.length ? plural(lane.cards.length, 'thing') : 'Nothing'}{mine > 0 && <> · <em>{mine} {mine === 1 ? 'needs' : 'need'} you</em></>}</span></h3></header>
              {lane.cards.length ? <ul>{lane.cards.map((card, at) => <li key={card.key} className={`gt-it ${card.cls}${card.you ? ' you' : ''}`} style={card.you ? { '--i': at } as React.CSSProperties : undefined}>{card.you && <b className="gt-yours">{card.you}</b>}<div>{card.body}</div></li>)}</ul> : <p className="gt-free">Nothing with this day on it.</p>}
            </section>; })}</DaysRow>
          {settledList.length > 0 && <><h3 className="gt-dl gt-dl-row">Settled lately<span>newest first</span></h3>
            <ul className="gt-minis">{settledList.map(item => <li key={item.key} className="gt-mini"><i className={`gt-g ${item.kind}`} /><span><b><Link href={item.href}>{item.text}</Link></b><small>{item.sub}</small></span><time>{shortDay(dayIn(item.at))}</time></li>)}</ul></>}
        </section>}

        {tab === 'decisions' && <section id="decisions" aria-label="Current decisions">
          {state.decisions.items.length ? <ul className="gt-grid">{state.decisions.items.map(item => <Row key={item.number} record={item} look="gt-decision" label={`Decision · ${item.topic}`} stamp={`Decided ${shortDay(item.createdAt)}`} actions={shared(item)}>
            <p className="lp-stmt">{item.statement}</p>
            {state.conflicts.items.filter(flag => flag.decision === item.number).map(flag => <Link key={flag.output} className="lp-ref" href={href('outputs', flag.output)}><Alert />Output #{flag.output} {flag.state === 'flagged' ? 'is marked as conflicting with this decision' : 'needs a re-check against this decision'}<Arrow /></Link>)}
          </Row>)}</ul> : <p className="lp-empty">No decisions yet. When someone settles a question, their assistant records it here so nobody has to explain it twice.</p>}{more(state.decisions.more)}
          {state.conflicts.items.some(flag => !state.decisions.items.some(item => item.number === flag.decision)) && <><h3>Other conflict flags</h3><ul className="lp-plain">{state.conflicts.items.filter(flag => !state.decisions.items.some(item => item.number === flag.decision)).map(flag => <li key={`${flag.output}-${flag.decision}`}>Output #{flag.output} {flag.state === 'flagged' ? 'is marked as conflicting with' : 'needs a re-check against'} decision #{flag.decision}{flag.topic ? ` (${flag.topic})` : ' (withdrawn)'}.</li>)}</ul></>}{more(state.conflicts.more)}
        </section>}

        {tab === 'claims' && <section id="claims" aria-label="Open claims">
          {state.claims.items.length ? <ul className="gt-grid">{state.claims.items.map(item => <Row key={item.number} record={item} look={claimLook(item)} label={claimLabel(item)} actions={[...claimActs(item), ...shared(item)]}>
            <p className="lp-stmt">{item.what}</p>
            <p className="lp-sub"><span>Owner: <strong>{who(item.owner!)}</strong></span>{item.dueOn && <span className={item.pastDue ? 'lp-warn' : undefined}>{item.pastDue && <Alert />}due {shortDay(item.dueOn)}{item.pastDue ? ' (date passed)' : ''}</span>}<span className={`lp-chip${item.claimStatus === 'open' ? ' lp-chip-open' : ''}`}>{claimStatus[item.claimStatus!]}</span>{item.overlaps?.length ? <span>overlaps with {item.overlaps.map(number => `#${number}`).join(', ')}</span> : null}</p>
          </Row>)}</ul> : <p className="lp-empty">No open claims. A claim says who has taken something on, so two people do not do the same work.</p>}{more(state.claims.more)}
        </section>}

        {tab === 'outputs' && <section id="outputs" aria-label="Current outputs"><p className="emba-meta">Loopd stores the link, not the file. Open a link only if you trust where it points.</p>
          {state.outputs.items.length ? <ul className="gt-grid">{state.outputs.items.map(item => <Row key={item.number} record={item} look={`gt-output${item.conflicts?.length ? ' clash' : ''}`} label={`Output · ${item.host}`} actions={shared(item)}>
            <p className="lp-stmt"><a href={item.url} rel="noopener noreferrer nofollow" target="_blank">{item.title}</a> <span className="emba-meta">{item.host}{item.recognisedHost ? '' : ' · unrecognised host'}</span></p>
            <p>{item.summary}</p>
            {item.conflicts?.map(flag => <Link key={flag.decision} className="lp-ref" href={href('decisions', flag.decision)}><Alert />{flag.state === 'flagged' ? 'Marked as conflicting with' : 'Needs a re-check against'} decision #{flag.decision}{flag.topic ? ` (${flag.topic})` : ' (withdrawn)'}<Arrow /></Link>)}
          </Row>)}</ul> : <p className="lp-empty">No outputs filed yet. An output is a link to finished work, filed so every assistant can find it.</p>}{more(state.outputs.more)}
        </section>}

        {tab === 'resources' && resources && <section id="resources" aria-label="Resources" className="lp-resources">
          {canPost ? <ResourceBox action={addResource} orgId={scope.orgId} loopId={scope.loopId} /> : <p className="emba-meta">You follow this group and can read it. Only members can add to Resources.</p>}
          <p className="emba-meta">The tags under each one are worked out by an assistant from what it read: what it is, what it is for, who it is for, and any date in it. Nobody types them.</p>
          <div className="lp-lhead"><h3>Links</h3><span>{plural(resources.links.items.length + resources.links.more, 'link')}. Loopd keeps the address, not what it points at. Open a link only if you trust where it points.</span></div>
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
          {canPost && <div className="lt-editor"><LinkBox action={linkTeamEvent} orgId={scope.orgId} loopId={scope.loopId} timezone={state.timezone} /></div>}
          {upcoming.events.items.length ? <ul className="lp-list">{upcoming.events.items.map(event => <EventCard key={event.slug} event={event as EventWithWho} scope={scope} route="site" canPost={canPost} />)}</ul> : <p className="lp-empty">No upcoming events.</p>}{more(upcoming.events.more)}
          {near && near.items.length > 0 && <><h3>Nearby</h3><ul className="lp-list">{near.items.map(item => <li key={item.code} className="lp-event"><span className="lp-topic">{item.starts}</span>
            <div className="lp-what"><p className="lp-stmt">{item.title}</p><p className="lp-sub">{item.place && <span>{item.place}</span>}{item.host && <span>{item.host}</span>}{item.feed !== item.host && <span>{item.feed}</span>}</p>
              {canPost && <ActionForm action={joinNearbyEvent} label="I'm interested">{scopeFields}<input type="hidden" name="nearby" value={item.code} /></ActionForm>}</div></li>)}</ul></>}
          <h3>Event tags</h3>
          {events.length ? <ul className="lp-list">{events.map(event => <li key={event.id} className="lp-event"><span className="lp-topic">@{group.namespace}/{event.slug}</span><div className="lp-what"><p className="lp-stmt">{event.name}</p>
            {manager && <details><summary>Rename or archive</summary><ActionForm action={changeTeamEvent} label="Rename"><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="eventId" value={event.id} /><label>Tag<input name="slug" required defaultValue={event.slug} maxLength={48} pattern="[a-z0-9][a-z0-9\-]{1,47}" /></label><label>Name<input name="name" required defaultValue={event.name} maxLength={80} /></label>{eventFields(event)}</ActionForm>
              <ActionForm action={retireTeamEvent} label="Archive"><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="eventId" value={event.id} /><p>An archived event takes no new records. Its existing records stay in the team&apos;s history.</p></ActionForm>
              {event.startsAt && <ActionForm action={sendTeamEventInvites} label="Send as a calendar invite">{scopeFields}<input type="hidden" name="event" value={event.slug} /><p>Goes by email to the members who marked interest and allow email from this group. It names no other member. Later changes to the time or place update the same calendar entry.</p></ActionForm>}</details>}</div></li>)}</ul> : <p className="lp-empty">No events yet.</p>}
          {manager && <div className="lt-editor"><h3>New event</h3><ActionForm action={addTeamEvent} label="Create event">{scopeFields}<label>Tag<input name="slug" required maxLength={48} pattern="[a-z0-9][a-z0-9\-]{1,47}" placeholder="final-deck" /></label><label>Name<input name="name" required maxLength={80} placeholder="Final deck" /></label>{eventFields()}</ActionForm></div>}
          {manager && <div className="lt-editor"><h3>Feeds</h3><p className="emba-meta">Calendar feeds, such as a club&apos;s. What starts in the next 14 days is listed under Nearby. Loopd reads each feed that is on every hour.</p>
            {feeds.length > 0 && <ul className="lp-plain">{feeds.map(feed => <li key={feed.id}><p className="lp-stmt">{feed.name}</p><p className="emba-meta">{feed.url}</p>{feed.lastResult && <p className={feed.lastOk === false ? 'lp-err' : 'emba-meta'}>{feed.lastResult}</p>}
              <div className="lp-acts"><ActionForm action={setTeamFeedOn} label={feed.on ? 'Turn off' : 'Turn on'}>{scopeFields}<input type="hidden" name="feedId" value={feed.id} /><input type="hidden" name="on" value={feed.on ? 'false' : 'true'} /></ActionForm>
                <ActionForm action={readTeamFeedNow} label="Read now">{scopeFields}<input type="hidden" name="feedId" value={feed.id} /></ActionForm>
                <ActionForm action={removeTeamFeed} label="Remove">{scopeFields}<input type="hidden" name="feedId" value={feed.id} /></ActionForm></div></li>)}</ul>}
            <ActionForm action={addTeamFeed} label="Add feed">{scopeFields}<label>Name<input name="name" required maxLength={80} placeholder="Entrepreneurship Club" /></label><label>Address (https)<input name="url" type="url" required maxLength={8000} /></label></ActionForm></div>}
          {manager && archived.length > 0 && <div className="lt-editor"><h3>Archived events</h3><ul className="lp-plain">{archived.map(event => <li key={event.id}>@{group.namespace}/{event.slug} · {event.name}<ActionForm action={restoreTeamEvent} label="Restore"><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="eventId" value={event.id} /></ActionForm></li>)}</ul></div>}
        </section>}

        {tab === 'ideas' && on && <section id="ideas" aria-label="Ideas and plans"><p className="emba-meta">An idea is something a member proposes, with the number of people it needs. Once it has them, a start time and a place, it is a plan and goes to the calendars of those who are in. Times are in {state.timezone}.</p>
          <h3>Plans</h3>
          {on.plans.length ? <ul className="lp-list">{on.plans.map(event => <IdeaItem key={event.slug} event={event} />)}</ul> : <p className="lp-empty">No plans yet.</p>}
          <h3>Ideas</h3><p className="emba-meta">Those closest to the number they need come first.</p>
          {on.ideas.items.length ? <ul className="lp-list">{on.ideas.items.map(event => <IdeaItem key={event.slug} event={event} />)}</ul> : <p className="lp-empty">No open ideas. Propose one below, or ask your assistant to.</p>}{more(on.ideas.more)}
          {canPost ? <div className="lt-editor"><h3>Propose an idea</h3><ActionForm action={proposeTeamIdea} label="Propose">{scopeFields}<label>What<input name="name" required maxLength={120} placeholder="Buy suits" /></label><label>People it needs, you included<input name="needed" type="number" min={2} max={20} defaultValue={3} required /></label>{eventFields()}
            <label>Days you could do it, if there is no start yet (YYYY-MM-DD, separated by commas)<input name="offeredDays" maxLength={120} /></label><p>You are counted as in. Leave the start empty and Loopd asks those who are in to choose a day once there are enough of them.</p></ActionForm></div> : <p className="emba-meta">You follow this group and can read it. Only members can propose.</p>}
          <div className="lt-editor"><h3>In your calendar</h3><p className="emba-meta">A private address for this group&apos;s fixed events and plans. Add it to Google, Apple or Outlook calendar as a subscription. It shows names, times and places of events, and nobody&apos;s name. Anyone who has the address can read it, so keep it to yourself.</p>
            {feed && <p><input readOnly value={feed} aria-label="Your calendar address" /> <CopyLink url={feed} /></p>}
            <ActionForm action={newCalendarAddress} label={feed ? 'Replace the address' : 'Make my calendar address'}>{scopeFields}{feed && <p>The address above stops working at once.</p>}</ActionForm></div>
        </section>}

        {tab === 'travel' && travel && <section id="travel" aria-label="Travel"><p className="emba-meta">When and where each member said they arrive and leave. It is what members stated; Loopd checks no flight. Times are in {state.timezone}.</p>
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
    </div>
  </div>;
}

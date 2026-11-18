import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Rings } from '@/components/LoopGlyphs';
import { db } from '@/lib/db';
import { customFace } from '@/lib/campus/animals';
import { premiumAsks } from '@/lib/campus/custom-face';
import { LEVELS } from '@/lib/campus/levels';
import { listCampuses } from '@/lib/campus/listings';
import { adminListings, campusFeeds } from '@/lib/campus/manage';
import { campusPlaces } from '@/lib/campus/places';
import { campusRewards, type Reward } from '@/lib/campus/rewards';
import { frontIsCampus } from '@/lib/campus/schools';
import { campusViewer, signInHref } from '@/lib/campus/session';
import { dayLabel, localParts, timeLabel } from '@/lib/campus/time';
import { addCampusAction, addEventAction, addFeedAction, readFeedAction, saveRewardAction, savePlaceAction, setCampusAction, setFeedOnAction, setHiddenAction, setRewardHiddenAction, setWordsAction } from './actions';

export const dynamic = 'force-dynamic';

const RULES = { outings: 'any outings', word: 'outings on events with a word', weeks: 'the same group at the giver’s events, weeks in a row' } as const;

/** The admin's page for running a campus by hand (design D2, D6, D8). Anyone who is not the admin is told it does not exist. */
export default async function CampusAdminPage({ searchParams }: { searchParams: Promise<{ campus?: string; said?: string; q?: string }> }) {
  const viewer = await campusViewer();
  if (!viewer) redirect(signInHref('/c/admin'));
  if (!viewer.admin) notFound();
  const { campus: slug, said, q = '' } = await searchParams, campuses = await listCampuses(db());
  const campus = campuses.find(each => each.slug === slug) ?? campuses[0];
  if (!campus) notFound();
  const now = new Date(), tz = campus.tz, asks = await premiumAsks(db());
  const [feeds, places, events, rewards] = await Promise.all([campusFeeds(db(), campus.id), campusPlaces(db(), campus.id), adminListings(db(), campus.id, q), campusRewards(db(), campus.id, true)]);
  const when = (at: string) => { const parts = localParts(tz, new Date(at)); return `${dayLabel(tz, at, now)} ${parts.date.slice(5)} · ${timeLabel(tz, at)}`; };
  const Campus = () => <input type="hidden" name="campus" value={campus.slug} />;
  const texts = (reward?: Reward) => <div className="three">{LEVELS.map((level, at) => <label key={level.name}>{level.name} gets{at > 0 && <small>blank: the same as the level below</small>}<input name={level.name.toLowerCase()} maxLength={200} defaultValue={reward?.texts[at] ?? ''} required={at === 0 && !reward} /></label>)}</div>;
  const rides = (reward: Reward) => reward.kind === 'group'
    ? `Group of ${reward.headCount} · on ${reward.listingId ? `“${events.rows.find(event => event.id === reward.listingId)?.title ?? 'one event'}”` : `every event of ${reward.hostName}`}`
    : `After ${reward.ruleCount} · ${RULES[reward.rule!]}${reward.ruleWord ? `: ${reward.ruleWord}` : ''}`;
  const rewardForm = (kind: 'group' | 'building', reward?: Reward) => <form action={saveRewardAction} className="cs-form"><Campus /><input type="hidden" name="kind" value={kind} />{reward && <input type="hidden" name="reward" value={reward.id} />}
    <label>Who gives it<input name="giver" required maxLength={120} placeholder={kind === 'group' ? 'Northside Coffee' : 'Collegetown Bagels'} defaultValue={reward?.giver} /></label>
    {texts(reward)}
    {kind === 'group' ? <div className="three">
        <label>Group of<input name="headCount" type="number" min={2} max={50} required defaultValue={reward?.headCount ?? 3} /></label>
        <label>On one event<select name="on" defaultValue={reward?.listingId ?? ''}><option value="">Every event of a host</option>{reward?.listingId && !events.rows.some(event => event.id === reward.listingId) && <option value={reward.listingId}>The event it is on now</option>}{events.rows.map(event => <option key={event.id} value={event.id}>{event.title} · {when(event.startsAt)}</option>)}</select></label>
        <label>Or the host’s name<input name="hostName" maxLength={200} placeholder="Chess Club" defaultValue={reward?.hostName ?? ''} /></label></div>
      : <div className="three">
        <label>Earned by<select name="rule" defaultValue={reward?.rule ?? 'outings'}>{Object.entries(RULES).map(([rule, label]) => <option key={rule} value={rule}>{label}</option>)}</select></label>
        <label>How many<input name="ruleCount" type="number" min={1} max={100} required defaultValue={reward?.ruleCount ?? 5} /></label>
        <label>The word <small>for the word rule</small><input name="ruleWord" maxLength={30} placeholder="run" defaultValue={reward?.ruleWord ?? ''} /></label></div>}
    <div className="end"><span className="cs-note">{kind === 'group' ? 'Unlocks when that many people of one outing have checked in.' : 'A giver’s events are those it hosts or that happen at a place with its name.'}</span><button className="cs-btn sm go">{reward ? 'Save' : 'Add reward'}</button></div></form>;

  return <div className="cs">
    <header className="cs-nav"><Link className="cs-wm" href={`/c/${campus.slug}`}><Rings />Loop</Link>
      <nav className="cs-links"><Link href={`/c/${campus.slug}`}>This week</Link><Link href="/c/admin" aria-current="page">Admin</Link></nav>
      <div className="cs-nav-end"><Link className="cs-btn sm" href="/groups">The groups site</Link><Link className="cs-btn sm" href="/groups/archive">How we got here</Link></div></header>
    <main className="cs-adm">
      <header><h1>Admin</h1><p>Only you see this page.{frontIsCampus() ? ' Everyone else gets This week and nothing more.' : ' The groups site is open to its members again: LOOP_FRONT is set to groups.'}</p></header>
      {said && <p className="cs-alert wide" role="status" style={{ gridColumn: '1 / -1', margin: 0 }}>{said}</p>}

      <section className="wide"><h2>Premium</h2>
        <p>{asks.length ? `${asks.length} ${asks.length === 1 ? 'person has' : 'people have'} asked to subscribe, across every campus. Nobody is charged. Each got one animal free, and every one made is kept here.` : 'Nobody has asked to subscribe yet.'}</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- pictures Loop made, served from the database at their own address */}
        {asks.length > 0 && <ul className="cs-adm-asks">{asks.map(ask => <li key={ask.email + ask.asked}><span>{ask.pictures.map(token => <img key={token} src={customFace(token)} alt="" />)}</span><b>{ask.email}</b><small>{ask.asked}</small></li>)}</ul>}</section>

      <section className="wide"><h2>Campus</h2>
        <nav className="cs-schools">{campuses.map(each => <Link key={each.id} className="cs-btn sm" style={each.id === campus.id ? { background: 'var(--cs-ink)', color: 'var(--cs-field)' } : undefined} href={`/c/admin?campus=${each.slug}`} aria-current={each.id === campus.id ? 'true' : undefined}>{each.name}</Link>)}</nav>
        <form action={setCampusAction} className="cs-form"><Campus /><div className="three">
          <label>Email domains <small>a subdomain counts</small><input name="domains" required defaultValue={campus.domains.join(', ')} /></label>
          <label>The complete list is called<input name="listSource" required maxLength={60} defaultValue={campus.listSource} /></label>
          <label>Timezone<input value={campus.tz} readOnly /></label></div>
          <div className="end"><span className="cs-note">People are placed at {campus.name} when their verified email ends in one of these.</span><button className="cs-btn sm">Save</button></div></form>
        <details><summary>Add a campus</summary><form action={addCampusAction} className="cs-form"><Campus /><div className="three">
          <label>Name<input name="name" required maxLength={80} placeholder="Barnard" /></label>
          <label>Address <small>/c/…</small><input name="slug" required pattern="[a-z0-9][a-z0-9-]{1,39}" placeholder="barnard" /></label>
          <label>Timezone<input name="tz" required defaultValue="America/New_York" /></label>
          <label>Email domains<input name="domains" required placeholder="barnard.edu" /></label>
          <label>The complete list is called<input name="listSource" defaultValue="CampusGroups" /></label></div>
          <div className="end"><span /><button className="cs-btn sm go">Add campus</button></div></form></details>
      </section>

      <section><h2>Feeds</h2><p>Calendar feeds are read every hour. A feed that fails leaves its events as they were.</p>
        <ul className="cs-adm-list">{feeds.map(feed => <li key={feed.id} className={feed.on ? '' : 'off'}><div><b>{feed.source}{feed.on ? '' : ' · off'}</b><span>{feed.url}<br />{feed.lastReadAt ? `${feed.lastOk ? '' : 'Failed: '}${feed.lastResult ?? ''} · ${when(feed.lastReadAt)}` : 'Not read yet'}</span></div>
          <form action={readFeedAction}><Campus /><input type="hidden" name="feed" value={feed.id} /><button className="cs-btn sm">Read now</button></form>
          <form action={setFeedOnAction}><Campus /><input type="hidden" name="feed" value={feed.id} /><input type="hidden" name="on" value={String(!feed.on)} /><button className="cs-btn sm">{feed.on ? 'Turn off' : 'Turn on'}</button></form></li>)}
          {!feeds.length && <li className="off"><div><span>No feeds yet.</span></div></li>}</ul>
        <details><summary>Add a feed</summary><form action={addFeedAction} className="cs-form"><Campus />
          <label>Source <small>shown on its events, such as CampusGroups or Luma</small><input name="source" required maxLength={60} defaultValue={campus.listSource} /></label>
          <label>Calendar address <small>https, ending in .ics or a Luma calendar link</small><input name="url" type="url" required placeholder="https://" /></label>
          <div className="end"><span /><button className="cs-btn sm go">Add feed</button></div></form></details>
      </section>

      <section><h2>Places</h2><p>An event whose place text names one of these gets a map. Other names are matched too.</p>
        <ul className="cs-adm-list">{places.map(place => <li key={place.id}><details style={{ flex: 1, boxShadow: 'none', background: 'none' }}><summary style={{ padding: 0 }}>{place.name} <span>· {place.lat}, {place.lon}{place.otherNames.length ? ` · also ${place.otherNames.join(', ')}` : ''}</span></summary>
          <form action={savePlaceAction} className="cs-form" style={{ padding: '12px 0 4px' }}><Campus /><input type="hidden" name="place" value={place.id} /><div className="three">
            <label>Name<input name="name" required defaultValue={place.name} /></label><label>Latitude<input name="lat" required inputMode="decimal" defaultValue={place.lat} /></label><label>Longitude<input name="lon" required inputMode="decimal" defaultValue={place.lon} /></label></div>
            <label>Other names <small>separated by commas</small><input name="otherNames" defaultValue={place.otherNames.join(', ')} /></label><div className="end"><span /><button className="cs-btn sm">Save</button></div></form></details></li>)}
          {!places.length && <li className="off"><div><span>No places yet.</span></div></li>}</ul>
        <details><summary>Add a place</summary><form action={savePlaceAction} className="cs-form"><Campus /><div className="three">
          <label>Name<input name="name" required placeholder="Willard Straight Hall" /></label><label>Latitude<input name="lat" required inputMode="decimal" placeholder="42.4466" /></label><label>Longitude<input name="lon" required inputMode="decimal" placeholder="-76.4857" /></label></div>
          <label>Other names <small>separated by commas</small><input name="otherNames" placeholder="The Straight, WSH" /></label><div className="end"><span /><button className="cs-btn sm go">Add place</button></div></form></details>
      </section>

      <section className="wide"><h2>Rewards</h2><p>Entered by hand. A group reward unlocks when its head count has checked in on one outing. A building reward is earned over time.</p>
        <ul className="cs-adm-list">{rewards.map(reward => <li key={reward.id} className={reward.hidden ? 'off' : ''}><details style={{ flex: '1 1 320px', boxShadow: 'none', background: 'none' }}><summary style={{ padding: 0 }}>{reward.giver}: {reward.texts.find(Boolean)}{reward.hidden ? ' · hidden' : ''} <span>· {rides(reward)}</span></summary>{rewardForm(reward.kind, reward)}</details>
          <form action={setRewardHiddenAction}><Campus /><input type="hidden" name="reward" value={reward.id} /><input type="hidden" name="hidden" value={String(!reward.hidden)} /><button className="cs-btn sm">{reward.hidden ? 'Show' : 'Hide'}</button></form></li>)}
          {!rewards.length && <li className="off"><div><span>No rewards yet.</span></div></li>}</ul>
        <details><summary>Add a group reward</summary>{rewardForm('group')}</details>
        <details><summary>Add a building reward</summary>{rewardForm('building')}</details>
      </section>

      <section className="wide"><h2>Events</h2><p>Everything that has not ended, hidden ones included. Words decide what a search finds; words you save here survive the next read of the feed.</p>
        <form className="cs-adm-list" style={{ display: 'flex', gap: 8 }}><input type="hidden" name="campus" value={campus.slug} /><input name="q" type="search" placeholder="Find by title or host" defaultValue={q} style={{ flex: '1 1 260px' }} /><button className="cs-btn sm">Find</button></form>
        <p>{events.rows.length < events.total ? `Showing the next ${events.rows.length} of ${events.total}. Search to narrow.` : `${events.total} ${events.total === 1 ? 'event' : 'events'}.`}</p>
        <ul className="cs-adm-list">{events.rows.map(event => <li key={event.id} className={event.hidden ? 'off' : ''}><div><b>{event.title}{event.hidden ? ' · hidden' : ''}</b><span>{when(event.startsAt)} · {event.origin === 'feed' ? event.source : event.origin === 'member' ? 'Posted plan' : 'Entered by hand'}{event.host ? ` · ${event.host}` : ''}{event.placeText ? ` · ${event.placeText}${event.matched ? ' (on the map)' : ''}` : ''}</span></div>
          <form action={setHiddenAction}><Campus /><input type="hidden" name="listing" value={event.id} /><input type="hidden" name="hidden" value={String(!event.hidden)} /><button className="cs-btn sm">{event.hidden ? 'Show' : 'Hide'}</button></form>
          <form action={setWordsAction} className="words"><Campus /><input type="hidden" name="listing" value={event.id} /><input name="words" aria-label={`Good-for words of ${event.title}`} defaultValue={event.words.join(' ')} placeholder="up to twelve words" /><button className="cs-btn sm">Save words</button></form></li>)}</ul>
        <details><summary>Add an event by hand</summary><form action={addEventAction} className="cs-form"><Campus />
          <label>Title<input name="title" required maxLength={200} /></label>
          <div className="three"><label>Starts <small>{tz}</small><input name="starts" type="datetime-local" required /></label><label>Ends <small>optional</small><input name="ends" type="datetime-local" /></label><label>Host <small>optional</small><input name="host" maxLength={200} /></label></div>
          <label>Place <small>optional</small><input name="place" maxLength={300} /></label><label>About <small>optional</small><input name="about" maxLength={1000} /></label>
          <div className="end"><span /><button className="cs-btn sm go">Add event</button></div></form></details>
      </section>
    </main>
  </div>;
}

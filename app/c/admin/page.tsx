import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Rings } from '@/components/LoopGlyphs';
import { db } from '@/lib/db';
import { customFace } from '@/lib/campus/animals';
import { catalogue } from '@/lib/campus/animal-tiers';
import { premiumAsks } from '@/lib/campus/custom-face';
import { LEVELS } from '@/lib/campus/levels';
import { listCampuses } from '@/lib/campus/listings';
import { adminListings, campusFeeds } from '@/lib/campus/manage';
import { campusPlaces } from '@/lib/campus/places';
import { campusRewards, type Reward } from '@/lib/campus/rewards';
import { frontIsCampus } from '@/lib/campus/schools';
import { campusViewer, signInHref } from '@/lib/campus/session';
import { dayLabel, localParts, timeLabel } from '@/lib/campus/time';
import { addCampusAction, addEventAction, addFeedAction, deletePictureAction, setTierAction, readFeedAction, saveRewardAction, savePlaceAction, setCampusAction, setFeedOnAction, setHiddenAction, setRewardHiddenAction, setWordsAction } from './actions';

export const dynamic = 'force-dynamic';

const RULES = { outings: 'any outings', word: 'outings on events with a word', weeks: 'the same group at the giver’s events, weeks in a row' } as const;
/** The page shows one of these at a time. */
const TABS = { events: 'Events', rewards: 'Rewards', feeds: 'Feeds', places: 'Places', animals: 'Animals', premium: 'Premium', campus: 'Campus' } as const;
type Tab = keyof typeof TABS;
const TIER = { core: 'Core', premium: 'Premium', off: 'Off', own: 'Only its maker' } as const;
type Place = keyof typeof TIER;
const HOLDS: Record<Place, string> = { core: 'In everyone’s picker.', premium: 'For people who subscribed.', off: 'In nobody’s picker.', own: 'Made by one person, and theirs alone.' };

/** The admin's page for running a campus by hand (design D2, D6, D8). Anyone who is not the admin is told it does not exist. */
export default async function CampusAdminPage({ searchParams }: { searchParams: Promise<{ campus?: string; said?: string; q?: string; tab?: string }> }) {
  const viewer = await campusViewer();
  if (!viewer) redirect(signInHref('/c/admin'));
  if (!viewer.admin) notFound();
  const { campus: slug, said, q = '', tab: asked } = await searchParams, campuses = await listCampuses(db());
  const campus = campuses.find(each => each.slug === slug) ?? campuses[0];
  if (!campus) notFound();
  const tab: Tab = asked && asked in TABS ? asked as Tab : 'events';
  const now = new Date(), tz = campus.tz;
  const when = (at: string) => { const parts = localParts(tz, new Date(at)); return `${dayLabel(tz, at, now)} ${parts.date.slice(5)} · ${timeLabel(tz, at)}`; };
  const at = (to: Tab, school = campus.slug) => `/c/admin?campus=${school}&tab=${to}`;
  /** What every form carries: the campus it acts on, and the section to come back to. */
  const keep = <><input type="hidden" name="campus" value={campus.slug} /><input type="hidden" name="tab" value={tab} /></>;

  async function events() {
    const found = await adminListings(db(), campus.id, q);
    return <section><h2>Events</h2>
      <form className="cs-adm-find"><input type="hidden" name="campus" value={campus.slug} /><input type="hidden" name="tab" value="events" /><input name="q" type="search" aria-label="Find by title or host" placeholder="Find by title or host" defaultValue={q} /><button>Find</button></form>
      <p className="cs-adm-lede">{found.rows.length < found.total ? `The next ${found.rows.length} of ${found.total}.` : `${found.total} ${found.total === 1 ? 'event' : 'events'} not yet over.`} Words decide what a search finds, and the ones you save survive the next read of the feed.</p>
      <ul className="cs-adm-rows">{found.rows.map(event => <li key={event.id} className={event.hidden ? 'off' : ''}><div><b>{event.title}{event.hidden ? ' · hidden' : ''}</b><span>{when(event.startsAt)} · {event.origin === 'feed' ? event.source : event.origin === 'member' ? 'Posted plan' : 'Entered by hand'}{event.host ? ` · ${event.host}` : ''}{event.placeText ? ` · ${event.placeText}${event.matched ? ' (on the map)' : ''}` : ''}</span>
          <form action={setWordsAction} className="words">{keep}<input type="hidden" name="listing" value={event.id} /><input name="words" aria-label={`Good-for words of ${event.title}`} defaultValue={event.words.join(' ')} placeholder="up to twelve words" /><button>Save words</button></form></div>
        <form action={setHiddenAction}>{keep}<input type="hidden" name="listing" value={event.id} /><input type="hidden" name="hidden" value={String(!event.hidden)} /><button>{event.hidden ? 'Show' : 'Hide'}</button></form></li>)}</ul>
      <details><summary>Add an event by hand</summary><form action={addEventAction} className="cs-adm-form">{keep}
        <label>Title<input name="title" required maxLength={200} /></label>
        <div className="three"><label>Starts <small>{tz}</small><input name="starts" type="datetime-local" required /></label><label>Ends <small>optional</small><input name="ends" type="datetime-local" /></label><label>Host <small>optional</small><input name="host" maxLength={200} /></label></div>
        <label>Place <small>optional</small><input name="place" maxLength={300} /></label><label>About <small>optional</small><input name="about" maxLength={1000} /></label>
        <button className="cs-btn sm go">Add event</button></form></details>
    </section>;
  }

  async function rewards() {
    const [all, found] = await Promise.all([campusRewards(db(), campus.id, true), adminListings(db(), campus.id, '')]);
    const texts = (reward?: Reward) => <div className="three">{LEVELS.map((level, rung) => <label key={level.name}>{level.name} gets{rung > 0 && <small>blank: the same as the level below</small>}<input name={level.name.toLowerCase()} maxLength={200} defaultValue={reward?.texts[rung] ?? ''} required={rung === 0 && !reward} /></label>)}</div>;
    const rides = (reward: Reward) => reward.kind === 'group'
      ? `Group of ${reward.headCount} · on ${reward.listingId ? `“${found.rows.find(event => event.id === reward.listingId)?.title ?? 'one event'}”` : `every event of ${reward.hostName}`}`
      : `After ${reward.ruleCount} · ${RULES[reward.rule!]}${reward.ruleWord ? `: ${reward.ruleWord}` : ''}`;
    const form = (kind: 'group' | 'building', reward?: Reward) => <form action={saveRewardAction} className="cs-adm-form">{keep}<input type="hidden" name="kind" value={kind} />{reward && <input type="hidden" name="reward" value={reward.id} />}
      <label>Who gives it<input name="giver" required maxLength={120} placeholder={kind === 'group' ? 'Northside Coffee' : 'Collegetown Bagels'} defaultValue={reward?.giver} /></label>
      {texts(reward)}
      {kind === 'group' ? <div className="three">
          <label>Group of<input name="headCount" type="number" min={2} max={50} required defaultValue={reward?.headCount ?? 3} /></label>
          <label>On one event<select name="on" defaultValue={reward?.listingId ?? ''}><option value="">Every event of a host</option>{reward?.listingId && !found.rows.some(event => event.id === reward.listingId) && <option value={reward.listingId}>The event it is on now</option>}{found.rows.map(event => <option key={event.id} value={event.id}>{event.title} · {when(event.startsAt)}</option>)}</select></label>
          <label>Or the host’s name<input name="hostName" maxLength={200} placeholder="Chess Club" defaultValue={reward?.hostName ?? ''} /></label></div>
        : <div className="three">
          <label>Earned by<select name="rule" defaultValue={reward?.rule ?? 'outings'}>{Object.entries(RULES).map(([rule, label]) => <option key={rule} value={rule}>{label}</option>)}</select></label>
          <label>How many<input name="ruleCount" type="number" min={1} max={100} required defaultValue={reward?.ruleCount ?? 5} /></label>
          <label>The word <small>for the word rule</small><input name="ruleWord" maxLength={30} placeholder="run" defaultValue={reward?.ruleWord ?? ''} /></label></div>}
      <p className="cs-adm-lede">{kind === 'group' ? 'Unlocks when that many people of one outing have checked in.' : 'A giver’s events are those it hosts or that happen at a place with its name.'}</p>
      <button className="cs-btn sm go">{reward ? 'Save' : 'Add reward'}</button></form>;
    return <section><h2>Rewards</h2>
      <p className="cs-adm-lede">Entered by hand. A group reward unlocks when its head count has checked in on one outing. A building reward is earned over time.</p>
      <ul className="cs-adm-rows">{all.map(reward => <li key={reward.id} className={reward.hidden ? 'off' : ''}><details><summary><div><b>{reward.giver}: {reward.texts.find(Boolean)}{reward.hidden ? ' · hidden' : ''}</b><span>{rides(reward)}</span></div><i>Edit</i></summary>{form(reward.kind, reward)}</details>
          <form action={setRewardHiddenAction}>{keep}<input type="hidden" name="reward" value={reward.id} /><input type="hidden" name="hidden" value={String(!reward.hidden)} /><button>{reward.hidden ? 'Show' : 'Hide'}</button></form></li>)}
        {!all.length && <li className="off"><span>No rewards yet.</span></li>}</ul>
      <details><summary>Add a group reward</summary>{form('group')}</details>
      <details><summary>Add a building reward</summary>{form('building')}</details>
    </section>;
  }

  async function feeds() {
    const all = await campusFeeds(db(), campus.id);
    return <section><h2>Feeds</h2>
      <p className="cs-adm-lede">Calendar feeds are read every hour. A feed that fails leaves its events as they were.</p>
      <ul className="cs-adm-rows">{all.map(feed => <li key={feed.id} className={feed.on ? '' : 'off'}><div><b>{feed.source}{feed.on ? '' : ' · off'}</b><span>{feed.url}</span><span>{feed.lastReadAt ? `${feed.lastOk ? '' : 'Failed: '}${feed.lastResult ?? ''} · ${when(feed.lastReadAt)}` : 'Not read yet'}</span></div>
          <form action={readFeedAction}>{keep}<input type="hidden" name="feed" value={feed.id} /><button>Read now</button></form>
          <form action={setFeedOnAction}>{keep}<input type="hidden" name="feed" value={feed.id} /><input type="hidden" name="on" value={String(!feed.on)} /><button>{feed.on ? 'Turn off' : 'Turn on'}</button></form></li>)}
        {!all.length && <li className="off"><span>No feeds yet.</span></li>}</ul>
      <details><summary>Add a feed</summary><form action={addFeedAction} className="cs-adm-form">{keep}
        <label>Source <small>shown on its events, such as CampusGroups or Luma</small><input name="source" required maxLength={60} defaultValue={campus.listSource} /></label>
        <label>Calendar address <small>https, ending in .ics or a Luma calendar link</small><input name="url" type="url" required placeholder="https://" /></label>
        <button className="cs-btn sm go">Add feed</button></form></details>
    </section>;
  }

  async function places() {
    const all = await campusPlaces(db(), campus.id);
    return <section><h2>Places</h2>
      <p className="cs-adm-lede">An event whose place text names one of these gets a map. Other names are matched too.</p>
      <ul className="cs-adm-rows">{all.map(place => <li key={place.id}><details><summary><div><b>{place.name}</b><span>{place.lat}, {place.lon}{place.otherNames.length ? ` · also ${place.otherNames.join(', ')}` : ''}</span></div><i>Edit</i></summary>
          <form action={savePlaceAction} className="cs-adm-form">{keep}<input type="hidden" name="place" value={place.id} /><div className="three">
            <label>Name<input name="name" required defaultValue={place.name} /></label><label>Latitude<input name="lat" required inputMode="decimal" defaultValue={place.lat} /></label><label>Longitude<input name="lon" required inputMode="decimal" defaultValue={place.lon} /></label></div>
            <label>Other names <small>separated by commas</small><input name="otherNames" defaultValue={place.otherNames.join(', ')} /></label><button className="cs-btn sm">Save</button></form></details></li>)}
        {!all.length && <li className="off"><span>No places yet.</span></li>}</ul>
      <details><summary>Add a place</summary><form action={savePlaceAction} className="cs-adm-form">{keep}<div className="three">
        <label>Name<input name="name" required placeholder="Willard Straight Hall" /></label><label>Latitude<input name="lat" required inputMode="decimal" placeholder="42.4466" /></label><label>Longitude<input name="lon" required inputMode="decimal" placeholder="-76.4857" /></label></div>
        <label>Other names <small>separated by commas</small><input name="otherNames" placeholder="The Straight, WSH" /></label><button className="cs-btn sm go">Add place</button></form></details>
    </section>;
  }

  async function animals() {
    const all = await catalogue(db());
    type Pet = { key: string; src: string; name: string; now: Place; which: { face: number } | { picture: string } };
    const pets: Pet[] = [...all.built.map(one => ({ key: String(one.face), src: one.src, name: one.name, now: one.tier as Place, which: { face: one.face } })),
      ...all.made.map(one => ({ key: one.token, src: one.src, name: one.email ? `Made by ${one.email}` : 'Made', now: (one.tier ?? 'own') as Place, which: { picture: one.token } }))];
    /* eslint-disable @next/next/no-img-element -- icons from public/animals, and pictures Loop made, served from the database */
    const shelf = (place: Place) => { const here = pets.filter(pet => pet.now === place); return here.length > 0 && <div key={place} className="cs-adm-shelf"><h3>{TIER[place]} <small>{here.length} · {HOLDS[place]}</small></h3>
      <ul className="cs-adm-pets">{here.map(pet => <li key={pet.key}><img src={pet.src} alt={pet.name} title={pet.name} />
        <form action={setTierAction}>{keep}{'face' in pet.which ? <input type="hidden" name="face" value={pet.which.face} /> : <input type="hidden" name="picture" value={pet.which.picture} />}
          {(['core', 'premium', 'face' in pet.which ? 'off' : 'own'] as Place[]).filter(to => to !== place).map(to => <button key={to} name="tier" value={to} aria-label={`${pet.name}: move to ${TIER[to]}`}>{TIER[to]}</button>)}</form>
        {'picture' in pet.which && <details><summary>Delete</summary><form action={deletePictureAction}>{keep}<input type="hidden" name="picture" value={pet.which.picture} /><button>Delete for good</button></form></details>}</li>)}</ul></div>; };
    /* eslint-enable @next/next/no-img-element */
    return <section><h2>Animals</h2>
      <p className="cs-adm-lede">Every picture a person can have. Press a name under one to move it there. A move changes what can be picked from now on: whoever already has it keeps it.</p>
      {(['core', 'premium', 'own', 'off'] as Place[]).map(shelf)}
    </section>;
  }

  async function premium() {
    const asks = await premiumAsks(db());
    return <section><h2>Premium</h2>
      <p className="cs-adm-lede">{asks.length ? `${asks.length} ${asks.length === 1 ? 'person has' : 'people have'} asked to subscribe, across every campus. Nobody is charged, and each got one animal free.` : 'Nobody has asked to subscribe yet.'}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- pictures Loop made, served from the database at their own address */}
      <ul className="cs-adm-rows">{asks.map(ask => <li key={ask.email + ask.asked}><div><b>{ask.email}</b><span>{ask.asked}</span></div><span className="made">{ask.pictures.map(token => <img key={token} src={customFace(token)} alt="" />)}</span></li>)}</ul>
    </section>;
  }

  function school() {
    return <section><h2>Campus</h2>
      <p className="cs-adm-lede">People are placed at {campus.name} when their verified email ends in one of its domains. A subdomain counts.</p>
      <form action={setCampusAction} className="cs-adm-form">{keep}<div className="three">
        <label>Email domains<input name="domains" required defaultValue={campus.domains.join(', ')} /></label>
        <label>The complete list is called<input name="listSource" required maxLength={60} defaultValue={campus.listSource} /></label>
        <label>Timezone<input value={campus.tz} readOnly /></label></div>
        <button className="cs-btn sm">Save</button></form>
      <details><summary>Add a campus</summary><form action={addCampusAction} className="cs-adm-form">{keep}<div className="three">
        <label>Name<input name="name" required maxLength={80} placeholder="Barnard" /></label>
        <label>Address <small>/c/…</small><input name="slug" required pattern="[a-z0-9][a-z0-9-]{1,39}" placeholder="barnard" /></label>
        <label>Timezone<input name="tz" required defaultValue="America/New_York" /></label>
        <label>Email domains<input name="domains" required placeholder="barnard.edu" /></label>
        <label>The complete list is called<input name="listSource" defaultValue="CampusGroups" /></label></div>
        <button className="cs-btn sm go">Add campus</button></form></details>
    </section>;
  }

  const body = tab === 'events' ? await events() : tab === 'rewards' ? await rewards() : tab === 'feeds' ? await feeds() : tab === 'places' ? await places() : tab === 'animals' ? await animals() : tab === 'premium' ? await premium() : school();
  return <div className="cs">
    <header className="cs-nav"><Link className="cs-wm" href={`/c/${campus.slug}`}><Rings />Loop</Link>
      <nav className="cs-links"><Link href={`/c/${campus.slug}`}>This week</Link><Link href="/c/admin" aria-current="page">Admin</Link></nav>
      <div className="cs-nav-end"><Link className="cs-btn sm" href="/groups">The groups site</Link><Link className="cs-btn sm" href="/groups/archive">How we got here</Link></div></header>
    <main className="cs-adm">
      <header><h1>Admin</h1>
        <nav aria-label="Campus">{campuses.map(each => <Link key={each.id} href={at(tab, each.slug)} aria-current={each.id === campus.id ? 'true' : undefined}>{each.name}</Link>)}</nav></header>
      <nav className="cs-adm-tabs" aria-label="Sections">{(Object.keys(TABS) as Tab[]).map(each => <Link key={each} href={at(each)} aria-current={each === tab ? 'page' : undefined}>{TABS[each]}</Link>)}</nav>
      {said && <p className="cs-adm-said" role="status">{said}</p>}
      {body}
      <p className="cs-adm-foot">Only you see this page.{frontIsCampus() ? ' Everyone else gets This week and nothing more.' : ' The groups site is open to its members again: LOOP_FRONT is set to groups.'}</p>
    </main>
  </div>;
}

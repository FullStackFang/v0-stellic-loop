import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { db } from '@/lib/db';
import { customFace } from '@/lib/campus/animals';
import { clubClaims, type AdminClaim } from '@/lib/campus/club-claim';
import { catalogue } from '@/lib/campus/animal-tiers';
import { premiumAsks } from '@/lib/campus/custom-face';
import { clubAsks } from '@/lib/campus/imprint';
import { callAsks } from '@/lib/campus/call-ask';
import { signedOutAsks, subscribeAsks } from '@/lib/campus/ink';
import { LEVELS } from '@/lib/campus/levels';
import { linkedinPeople, type LinkedinPerson } from '@/lib/campus/linkedin';
import { listCampuses } from '@/lib/campus/listings';
import { adminListings, campusFeeds } from '@/lib/campus/manage';
import { campusPlaces } from '@/lib/campus/places';
import { campusRewards, type Reward } from '@/lib/campus/rewards';
import { WAYS, type Way } from '@/lib/campus/stats';
import { schoolsAsked } from '@/lib/campus/school-ask';
import { frontIsCampus } from '@/lib/campus/schools';
import { campusViewer, signInHref } from '@/lib/campus/session';
import { siteBar } from '../site-bar';
import { WordsField } from '@/components/campus/words-field';
import { PickCount } from '@/components/campus/pick-count';
import { campusTags, KINDS } from '@/lib/campus/tags';
import { dayLabel, localParts, timeLabel } from '@/lib/campus/time';
import { addCampusAction, addEventAction, approveLinkedinAction, addFeedAction, decideClubClaimAction, deletePictureAction, joinTagAction, setAnimalNameAction, setTierAction, readFeedAction, removeLinkedinAction, removeSchoolAskAction, saveRewardAction, savePlaceAction, setCampusAction, setFeedOnAction, setHiddenAction, setRewardHiddenAction, setTagKindAction, setWordsAction, splitTagAction } from './actions';
import { Activity, People, SPANS, type Span } from './stats';

export const dynamic = 'force-dynamic';

const RULES = { outings: 'any outings', word: 'outings on events with a word', weeks: 'the same group at the giver’s events, weeks in a row' } as const;
/** The sections, down the left. The page shows one at a time. What waits for the admin comes first (public/demo/mockups-admin-review.html). */
const TABS = { activity: 'Activity', people: 'People', review: 'Review', clubs: 'Clubs', schools: 'Schools', events: 'Events', rewards: 'Rewards', feeds: 'Feeds', places: 'Places', tags: 'Tags', animals: 'Animals', premium: 'Premium', linkedin: 'LinkedIn', campus: 'Campus' } as const;
type Tab = keyof typeof TABS;
/** Where an animal stands. One a person had made, and nobody else may pick, is `own`: it is listed with the ones that are off. */
const TIER = { core: 'Core', premium: 'Premium', school: 'School', off: 'Off', own: 'Maker only' } as const;
/** Where the admin can move an animal to, in the order the buttons show. */
const MOVES = ['core', 'premium', 'school', 'off'] as const;
const SHOW = ['all', 'core', 'premium', 'school', 'off'] as const;
type Show = typeof SHOW[number];

/** The admin's page for running a campus by hand (design D2, D6, D8). Anyone who is not the admin is told it does not exist. */
export default async function CampusAdminPage({ searchParams }: { searchParams: Promise<{ campus?: string; said?: string; q?: string; tab?: string; show?: string; days?: string; way?: string; n?: string }> }) {
  const viewer = await campusViewer();
  if (!viewer) redirect(signInHref('/c/admin'));
  if (!viewer.admin) notFound();
  const { campus: slug, said, q = '', tab: asked, show: wanted, days, way, n } = await searchParams, campuses = await listCampuses(db());
  const campus = campuses.find(each => each.slug === slug) ?? campuses[0];
  if (!campus) notFound();
  const tab: Tab = asked && asked in TABS ? asked as Tab : 'events', show: Show = SHOW.find(each => each === wanted) ?? 'all';
  const now = new Date(), tz = campus.tz;
  const [found, allRewards, allFeeds, allPlaces, asks, all, allTags, linked, wanted_, clubs, claims] = await Promise.all([adminListings(db(), campus.id, tab === 'events' ? q : ''), campusRewards(db(), campus.id, true), campusFeeds(db(), campus.id), campusPlaces(db(), campus.id), premiumAsks(db()), catalogue(db()), campusTags(db(), campus.id), linkedinPeople(db()), schoolsAsked(db()), clubAsks(db()).catch(() => []), clubClaims(db()).catch((): AdminClaim[] => [])]);
  // Every sign-up, with the button pressed, and every ask for a call (app/c/ink). Read only on the Premium tab.
  const [signUps, calls, outs] = tab === 'premium' ? await Promise.all([subscribeAsks(db()).catch(() => []), callAsks(db()).catch(() => []), signedOutAsks(db()).catch(() => [])]) : [[], [], []];
  const when = (at: string) => { const parts = localParts(tz, new Date(at)); return `${dayLabel(tz, at, now)} ${parts.date.slice(5)} · ${timeLabel(tz, at)}`; };
  const at = (to: Tab, school = campus.slug) => `/c/admin?campus=${school}&tab=${to}`;
  /** What every form carries: the campus it acts on, and the section to come back to. */
  const keep = <><input type="hidden" name="campus" value={campus.slug} /><input type="hidden" name="tab" value={tab} /></>;
  // Waiting for a school check, the longest wait first. Everyone else in `linked` is let in.
  const queue = linked.filter(each => each.waiting).sort((a, b) => b.days - a.days || a.added.localeCompare(b.added)), waiting = queue.length;
  const claimsWaiting = claims.filter(each => each.state === 'waiting').length;
  const failed = allFeeds.filter(feed => feed.on && feed.lastReadAt && feed.lastOk === false).length;
  // Activity and People are about the whole site and carry no count.
  const counts: Partial<Record<Tab, number>> = { review: waiting, clubs: claims.length, schools: wanted_.length, events: found.total, rewards: allRewards.length, feeds: allFeeds.length, places: allPlaces.length, tags: allTags.length, animals: all.built.length + all.made.length, premium: asks.length, linkedin: linked.length - waiting, campus: campuses.length };
  /** The head of a section: its name, then what sits beside it (a search, the forms that add to it). */
  const top = (beside?: ReactNode) => <div className="cs-adm-top"><h1>{TABS[tab]}</h1>{beside}</div>;

  function events() {
    return <section>{top(<>
        <form className="find"><input type="hidden" name="campus" value={campus.slug} /><input type="hidden" name="tab" value="events" /><input name="q" type="search" aria-label="Find by title or host" placeholder="Find by title or host" defaultValue={q} /></form>
        <details><summary>Add event</summary><form action={addEventAction} className="cs-adm-form">{keep}
          <label>Title<input name="title" required maxLength={200} /></label>
          <div className="three"><label>Starts <small>{tz}</small><input name="starts" type="datetime-local" required /></label><label>Ends <small>optional</small><input name="ends" type="datetime-local" /></label><label>Host <small>optional</small><input name="host" maxLength={200} /></label></div>
          <label>Place <small>optional</small><input name="place" maxLength={300} /></label><label>About <small>optional</small><input name="about" maxLength={1000} /></label>
          <button className="cs-btn sm go">Add event</button></form></details></>)}
      {found.rows.length < found.total && <p className="cs-adm-lede">The next {found.rows.length} of {found.total}. Search to narrow.</p>}
      <table className="cs-adm-table"><thead><tr><th>When</th><th>Event</th><th>Words a search finds</th><th>Shown</th></tr></thead>
        <tbody>{found.rows.map(event => <tr key={event.id} className={event.hidden ? 'off' : ''}><td>{when(event.startsAt)}</td>
          <td><b>{event.title}</b><small>{event.origin === 'feed' ? event.source : event.origin === 'member' ? 'Posted plan' : 'Entered by hand'}{event.host ? ` · ${event.host}` : ''}{event.placeText ? ` · ${event.placeText}${event.matched ? ' (on the map)' : ''}` : ''}</small></td>
          <td><form action={setWordsAction} className="words">{keep}<input type="hidden" name="listing" value={event.id} /><input name="words" aria-label={`Good-for words of ${event.title}`} defaultValue={event.words.join(' ')} placeholder="up to twelve words" /><button className="b">Save</button></form></td>
          <td><form action={setHiddenAction}>{keep}<input type="hidden" name="listing" value={event.id} /><input type="hidden" name="hidden" value={String(!event.hidden)} /><button className={`cs-adm-sw ${event.hidden ? '' : 'on'}`} aria-pressed={!event.hidden} aria-label={`${event.title} is shown`} /></form></td></tr>)}</tbody></table>
    </section>;
  }

  function rewards() {
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
    return <section>{top(<><details><summary>Group reward</summary>{form('group')}</details><details><summary>Building reward</summary>{form('building')}</details></>)}
      <ul className="cs-adm-rows">{allRewards.map(reward => <li key={reward.id} className={reward.hidden ? 'off' : ''}><details><summary><div><b>{reward.giver}: {reward.texts.find(Boolean)}</b><span>{rides(reward)}</span></div><i className="b">Edit</i></summary>{form(reward.kind, reward)}</details>
          <form action={setRewardHiddenAction}>{keep}<input type="hidden" name="reward" value={reward.id} /><input type="hidden" name="hidden" value={String(!reward.hidden)} /><button className={`cs-adm-sw ${reward.hidden ? '' : 'on'}`} aria-pressed={!reward.hidden} aria-label={`${reward.giver} reward is shown`} /></form></li>)}
        {!allRewards.length && <li className="off"><span>No rewards yet.</span></li>}</ul>
    </section>;
  }

  function feeds() {
    return <section>{top(<details><summary>Add feed</summary><form action={addFeedAction} className="cs-adm-form">{keep}
        <label>Source <small>shown on its events, such as CampusGroups or Luma</small><input name="source" required maxLength={60} defaultValue={campus.listSource} /></label>
        <label>Calendar address <small>https, ending in .ics or a Luma calendar link</small><input name="url" type="url" required placeholder="https://" /></label>
        <button className="cs-btn sm go">Add feed</button></form></details>)}
      <ul className="cs-adm-rows">{allFeeds.map(feed => <li key={feed.id} className={feed.on ? '' : 'off'}><div><b>{feed.source}</b><span>{feed.url}</span><span className={feed.lastOk === false ? 'warn' : ''}>{feed.lastReadAt ? `${feed.lastOk ? '' : 'Failed: '}${feed.lastResult ?? ''} · ${when(feed.lastReadAt)}` : 'Not read yet'}</span></div>
          <form action={readFeedAction}>{keep}<input type="hidden" name="feed" value={feed.id} /><button className="b">Read now</button></form>
          <form action={setFeedOnAction}>{keep}<input type="hidden" name="feed" value={feed.id} /><input type="hidden" name="on" value={String(!feed.on)} /><button className={`cs-adm-sw ${feed.on ? 'on' : ''}`} aria-pressed={feed.on} aria-label={`${feed.source} is on`} /></form></li>)}
        {!allFeeds.length && <li className="off"><span>No feeds yet. They are read every hour.</span></li>}</ul>
    </section>;
  }

  function places() {
    return <section>{top(<details><summary>Add place</summary><form action={savePlaceAction} className="cs-adm-form">{keep}<div className="three">
        <label>Name<input name="name" required placeholder="Willard Straight Hall" /></label><label>Latitude<input name="lat" required inputMode="decimal" placeholder="42.4466" /></label><label>Longitude<input name="lon" required inputMode="decimal" placeholder="-76.4857" /></label></div>
        <label>Other names <small>separated by commas</small><input name="otherNames" placeholder="The Straight, WSH" /></label><button className="cs-btn sm go">Add place</button></form></details>)}
      <ul className="cs-adm-rows">{allPlaces.map(place => <li key={place.id}><details><summary><div><b>{place.name}</b><span>{place.lat}, {place.lon}{place.otherNames.length ? ` · also ${place.otherNames.join(', ')}` : ''}</span></div><i className="b">Edit</i></summary>
          <form action={savePlaceAction} className="cs-adm-form">{keep}<input type="hidden" name="place" value={place.id} /><div className="three">
            <label>Name<input name="name" required defaultValue={place.name} /></label><label>Latitude<input name="lat" required inputMode="decimal" defaultValue={place.lat} /></label><label>Longitude<input name="lon" required inputMode="decimal" defaultValue={place.lon} /></label></div>
            <label>Other names <small>separated by commas</small><input name="otherNames" defaultValue={place.otherNames.join(', ')} /></label><button className="cs-btn sm">Save</button></form></details></li>)}
        {!allPlaces.length && <li className="off"><span>No places yet. An event whose place text names one gets a map.</span></li>}</ul>
    </section>;
  }

  /** Tags, group by group (openspec loop-campus-tags, design D6): the lead, then the tags counted with it. */
  function tags() {
    const leads = allTags.filter(tag => !tag.lead), led = (slug: string) => allTags.filter(tag => tag.lead === slug).length;
    const about = (tag: typeof allTags[number]) => `${tag.lead ? `Counted with @${tag.lead}` : led(tag.slug) ? `The word most people use, of ${led(tag.slug) + 1}` : 'On its own'}${tag.byHand ? ' · set by hand' : ''}`;
    return <section>{top()}
      <p className="cs-adm-lede">Tags that mean the same thing are counted as one, under the word most people use. Loopd sorts them by itself. What you set here it never changes again.</p>
      <table className="cs-adm-table"><thead><tr><th>People</th><th>Tag</th><th>Kind</th><th>Counted with</th></tr></thead>
        <tbody>{allTags.map(tag => <tr key={tag.id}><td>{tag.people}</td>
          <td><b>@{tag.slug}</b><small>{about(tag)}</small></td>
          <td><form action={setTagKindAction} className="tagf">{keep}<input type="hidden" name="tag" value={tag.id} /><select name="kind" aria-label={`Kind of @${tag.slug}`} defaultValue={tag.kind ?? ''} required>{!tag.kind && <option value="" disabled>Not sorted yet</option>}{KINDS.map(kind => <option key={kind} value={kind}>{kind[0].toUpperCase() + kind.slice(1)}</option>)}</select><button className="b">Save</button></form></td>
          <td>{tag.lead ? <form action={splitTagAction} className="tagf">{keep}<input type="hidden" name="tag" value={tag.id} /><button className="b" aria-label={`Split @${tag.slug} out of @${tag.lead}`}>Split out</button></form>
            : <form action={joinTagAction} className="tagf">{keep}<input type="hidden" name="tag" value={tag.id} /><select name="into" aria-label={`Join @${tag.slug} to`} defaultValue="" required><option value="" disabled>Join to…</option>{leads.filter(lead => lead.id !== tag.id).map(lead => <option key={lead.id} value={lead.id}>@{lead.slug}</option>)}</select><button className="b">Join</button></form>}</td></tr>)}</tbody></table>
      {!allTags.length && <p className="cs-adm-lede">No tags yet. One is made the first time a plan is posted with an @.</p>}
    </section>;
  }

  function animals() {
    type Pet = { key: string; src: string; name: string; named: string; words: string[]; now: keyof typeof TIER; field: 'face' | 'picture'; value: string };
    const pets: Pet[] = [...all.built.map((one): Pet => ({ key: String(one.face), src: one.src, name: one.name, named: one.name, words: one.words, now: one.tier, field: 'face', value: String(one.face) })),
      ...all.made.map((one): Pet => ({ key: one.token, src: one.src, name: one.name ?? (one.email ? `Made by ${one.email}` : 'Made animal'), named: one.name ?? '', words: one.words, now: one.tier ?? 'own', field: 'picture', value: one.token }))];
    const within = (which: Show) => pets.filter(pet => which === 'all' || pet.now === which || (which === 'off' && pet.now === 'own'));
    /* eslint-disable @next/next/no-img-element -- icons from public/animals, and pictures Loopd made, served from the database */
    return <section>{top()}
      <nav className="cs-adm-seg" aria-label="Show">{SHOW.map(each => <Link key={each} href={`${at('animals')}&show=${each}`} aria-current={each === show ? 'true' : undefined}>{each === 'all' ? 'All' : TIER[each]} {within(each).length}</Link>)}</nav>
      {/* Pick any number, then move them together. The bar counts what is picked, and shows only then. With one picked, its card shows beside the grid: its name, and the words the picker finds it by. */}
      <form action={setTierAction} className="cs-adm-pick">{keep}<input type="hidden" name="show" value={show} /><PickCount />
        <ul className="cs-adm-grid">{within(show).map(pet => <li key={pet.key}><label className={pet.now} title={pet.name}><input type="checkbox" name={pet.field} value={pet.value} aria-label={pet.name} /><img src={pet.src} alt="" /><span>{TIER[pet.now]}</span></label>
          <div className="cs-adm-card"><p><img src={pet.src} alt="" /><i>{TIER[pet.now]}</i></p>
            <span className="cs-adm-fld"><b>Name</b><input name={`name-${pet.value}`} defaultValue={pet.named} placeholder="Made animal" maxLength={40} aria-label={`Name of ${pet.name}`} /></span>
            <span className="cs-adm-fld"><b>Search words</b><WordsField name={`words-${pet.value}`} words={pet.words} /></span>
            <button className="cs-btn go" formAction={setAnimalNameAction}>Save</button>
            {/* Where it is offered, under the words, with where it is now pressed. School makes it the own animal of this campus's school. */}
            <span className="cs-adm-fld cs-adm-moves"><b>Move to</b><span>{MOVES.map(tier => <button key={tier} name="tier" value={tier} aria-pressed={tier === pet.now || (tier === 'off' && pet.now === 'own')}>{TIER[tier]}</button>)}
              {pet.field === 'picture' && <details><summary>Delete</summary><button formAction={deletePictureAction}>Delete for good</button></details>}</span></span></div></li>)}</ul>
        <p className="cs-adm-lede">Tap animals to pick them, then move them together. Whoever already has one keeps it. Tap one alone to name it and set the words it is found by.</p>
        <div className="cs-adm-tray"><span>picked · move to</span><button name="tier" value="core">Core</button><button name="tier" value="premium">Premium</button><button name="tier" value="school">School</button><button name="tier" value="off">Off</button>
          <details><summary>Delete</summary><button formAction={deletePictureAction}>Delete for good</button></details><button type="reset" className="x">Clear</button></div></form>
    </section>;
    /* eslint-enable @next/next/no-img-element */
  }

  function premium() {
    return <section>{top()}
      <p className="cs-adm-lede">{asks.length ? `Asked to subscribe, across every campus. Nobody is charged, and each got one animal free.` : 'Nobody has asked to subscribe yet.'}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- pictures Loopd made, served from the database at their own address */}
      <ul className="cs-adm-rows">{asks.map(ask => <li key={ask.email + ask.asked}><div><b>{ask.email}</b><span>{ask.asked}</span></div><span className="made">{ask.pictures.map(token => <img key={token} src={customFace(token)} alt="" />)}</span></li>)}</ul>
      {/* Who said when a 15-minute call would suit them, after signing up on the Ink page (lib/campus/call-ask.ts). Nothing is booked: write back to set one up. */}
      <p className="cs-adm-lede">{calls.length ? 'Asked for a 15-minute call, newest first. Their days and times are their own local time. Write back to set one up.' : 'Nobody has asked for a call yet.'}</p>
      <ul className="cs-adm-rows">{calls.map((ask, at) => <li key={at}><div><b>{ask.email}</b><span>{ask.role === 'organizer' ? 'Organizer' : 'Student'} · sent {ask.asked}</span></div><div><span>{ask.times.map(time => time.replace('T', ' ')).join(' · ') || 'No time given'}</span>{ask.note && <span>{ask.note}</span>}</div></li>)}</ul>
      {/* Every press that signed someone up (lib/campus/ink.ts): who, which plan, where (the feature, then the button) and when. */}
      <p className="cs-adm-lede">{signUps.length ? 'Every sign-up, newest first, with where it was pressed. Nobody is charged.' : 'Nobody has signed up yet.'}</p>
      <ul className="cs-adm-rows">{signUps.map((ask, at) => <li key={at}><div><b>{ask.email}</b><span>{ask.plan === 'ink_plus' ? 'Ink+' : 'Ink'} · {ask.place} · {ask.asked}</span></div></li>)}</ul>
      {outs.length > 0 && <p className="cs-adm-lede">Signed up on the Ink page without an account, newest first. Each gets the plan when they sign in with that email.</p>}
      <ul className="cs-adm-rows">{outs.map((ask, at) => <li key={at}><div><b>{ask.email}</b><span>{ask.plan === 'ink_plus' ? 'Ink+' : 'Ink'} · {ask.place} · {ask.asked} · {ask.claimed ? 'signed in since' : 'not signed in yet'}</span></div></li>)}</ul>
      {/* Claims from the organizers page (lib/campus/imprint.ts): a field test, so no club is made and nobody is charged. */}
      <p className="cs-adm-lede">{clubs.length ? 'Clubs claimed on the organizers page, across every campus. Nothing is made or charged yet.' : 'Nobody has claimed a club yet.'}</p>
      <ul className="cs-adm-rows">{clubs.map((ask, at) => <li key={at}><div><b>{ask.club}</b><span>{ask.email} · {ask.plan === 'imprint' ? 'Imprint' : 'Free'} · {ask.asked}</span></div></li>)}</ul>
    </section>;
  }

  const named = (slug: string) => campuses.find(each => each.slug === slug)?.name ?? slug;
  const proof = ({ owner, profile }: LinkedinPerson) => owner ? <span>Signed in with LinkedIn as {owner}</span> : profile ? <span className="warn">Pasted an address only: the LinkedIn account is not proven theirs</span> : <span>Signed in with LinkedIn</span>;
  // The profile to look at. Someone who signed in with LinkedIn gave no address, so they are looked up by name and school.
  const look = (each: LinkedinPerson) => each.profile ? <a className="cs-btn sm" href={each.profile} target="_blank" rel="noreferrer">Open profile</a>
    : <a className="cs-btn sm" href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent([each.owner ?? each.name, ...each.schools.slice(0, 1).map(named)].join(' '))}`} target="_blank" rel="noreferrer">Find on LinkedIn</a>;
  /** The queue: people with no school email, waiting for their school to be checked. Approving or turning one down takes them off it. */
  function review() {
    return <section>{top()}
      <p className="cs-adm-lede">{waiting ? 'People with no school email, waiting for you to check their school. The longest wait first.' : 'Nobody is waiting for you.'}</p>
      <ul className="cs-adm-rows">{queue.map(each => <li key={each.personId}><div><b>{each.name}</b><span>{[each.email, `wants ${each.schools.map(named).join(', ')}`, each.days < 1 ? 'waiting since today' : `waiting ${each.days} ${each.days === 1 ? 'day' : 'days'}`].filter(Boolean).join(' · ')}</span>{proof(each)}</div>
        {look(each)}
        <form action={approveLinkedinAction}>{keep}<input type="hidden" name="person" value={each.personId} /><button className="cs-btn sm go">Approve</button></form>
        <form action={removeLinkedinAction}>{keep}<input type="hidden" name="person" value={each.personId} /><button className="cs-btn sm">Turn down</button></form></li>)}</ul>
    </section>;
  }
  /** Claims to run a club (lib/campus/club-claim.ts). Those waiting come first. One Loopd approved by itself, from the club's officer list, is marked so, and can be taken back. */
  function clubsClaimed() {
    const decide = (claim: AdminClaim, to: 'approved' | 'refused', word: string, go = false) => <form action={decideClubClaimAction}>{keep}<input type="hidden" name="claim" value={claim.id} /><input type="hidden" name="to" value={to} /><button className={go ? 'cs-btn sm go' : 'cs-btn sm'}>{word}</button></form>;
    return <section>{top()}
      <p className="cs-adm-lede">{claims.length ? 'People who say they run a club, across every campus. Someone whose name is on the club’s CampusGroups officer list is approved without you; anyone else waits here. You can take any of them back.' : 'Nobody has claimed a club yet.'}</p>
      <ul className="cs-adm-rows">{claims.map(claim => <li key={claim.id}><div><b>{claim.club}</b>
          <span>{[claim.person, claim.email, claim.role, 'asked ' + claim.asked].filter(Boolean).join(' · ')}</span>
          {claim.state === 'waiting' ? <span className="warn">Waiting for you{claim.note ? ': ' + claim.note : ''}</span> : <span>{claim.state === 'approved' ? 'Approved' : 'Turned down'} {claim.how === 'officer list' ? 'by Loopd, from the officer list' : 'by you'}</span>}
          {claim.seen && <span>Officers listed: {claim.seen}</span>}</div>
        <a className="cs-btn sm" href={claim.page + 'officers/'} target="_blank" rel="noreferrer">Open the list</a>
        {claim.state !== 'approved' && decide(claim, 'approved', 'Approve', true)}
        {claim.state !== 'refused' && decide(claim, 'refused', claim.state === 'approved' ? 'Take back' : 'Turn down')}</li>)}</ul>
    </section>;
  }
  /** Schools Loopd is not at that people signed up, the most asked first. A row opens to show who asked. One typed in as "Other" is marked, and can be taken off. */
  function askedFor() {
    const most = wanted_[0]?.people ?? 1, people = wanted_.reduce((sum, each) => sum + each.people, 0);
    return <section>{top()}
      <p className="cs-adm-lede">{wanted_.length ? `Schools people signed up that Loopd is not at yet, the most asked first. ${people} ${people === 1 ? 'person' : 'people'}, ${wanted_.length} ${wanted_.length === 1 ? 'school' : 'schools'}. Open a row to see who asked.` : 'Nobody has signed up a school yet.'}</p>
      <ol className="cs-adm-rows cs-adm-asked">{wanted_.map((each, at) => <li key={each.key}><details><summary><i>{at + 1}</i><div><b>{each.school}</b>{each.where ? <span>{each.where} · last asked {each.last}</span> : <span className="warn">Typed in, not on the list · last asked {each.last}</span>}</div>
        <span className="bar" aria-hidden="true"><i style={{ width: `${Math.round(each.people / most * 100)}%` }} /></span><span className="n">{each.people} {each.people === 1 ? 'person' : 'people'}</span>
        <form action={removeSchoolAskAction} style={each.where ? { visibility: 'hidden' } : undefined}>{keep}<input type="hidden" name="school" value={each.key} /><button className="cs-btn sm" disabled={!!each.where} aria-label={`Remove ${each.school}`}>Remove</button></form></summary>
        <p>{each.emails.length ? each.emails.join(' · ') : 'No email was kept for them.'}</p></details></li>)}</ol>
    </section>;
  }
  /** Everyone let in or given more schools by a LinkedIn profile, across every campus: the profile to look at, and a way to take it back. */
  function linkedin() {
    const inside = linked.filter(each => !each.waiting);
    return <section>{top()}
      <p className="cs-adm-lede">{inside.length ? 'People a LinkedIn profile unlocked schools for, across every campus. Someone still waiting for a check is under Review. Removing one closes what it unlocked.' : 'Nobody has unlocked a school with LinkedIn yet.'}</p>
      <ul className="cs-adm-rows">{inside.map(each => <li key={each.personId}><div><b>{each.name}</b><span>{[each.email, each.schools.map(named).join(', '), each.added].filter(Boolean).join(' · ')}</span>{proof(each)}</div>
        {look(each)}
        <form action={removeLinkedinAction}>{keep}<input type="hidden" name="person" value={each.personId} /><button className="cs-btn sm">Remove</button></form></li>)}</ul>
    </section>;
  }

  function school() {
    return <section>{top(<details><summary>Add campus</summary><form action={addCampusAction} className="cs-adm-form">{keep}<div className="three">
        <label>Name<input name="name" required maxLength={80} placeholder="Barnard" /></label>
        <label>Address <small>/c/…</small><input name="slug" required pattern="[a-z0-9][a-z0-9-]{1,39}" placeholder="barnard" /></label>
        <label>Timezone<input name="tz" required defaultValue="America/New_York" /></label>
        <label>Email domains<input name="domains" required placeholder="barnard.edu" /></label>
        <label>The complete list is called<input name="listSource" defaultValue="CampusGroups" /></label></div>
        <button className="cs-btn sm go">Add campus</button></form></details>)}
      <p className="cs-adm-lede">People are placed at {campus.name} when their verified email ends in one of its domains. A subdomain counts.</p>
      <form action={setCampusAction} className="cs-adm-form">{keep}<div className="three">
        <label>Email domains<input name="domains" required defaultValue={campus.domains.join(', ')} /></label>
        <label>The complete list is called<input name="listSource" required maxLength={60} defaultValue={campus.listSource} /></label>
        <label>Timezone<input value={campus.tz} readOnly /></label></div>
        <button className="cs-btn sm">Save</button></form>
    </section>;
  }

  const { bar, foot } = await siteBar({ campus, viewer, back: '/c/admin' });
  // Activity and People read the sign-in provider, so they are asked only when their section is open.
  const span: Span = days && days in SPANS ? days as Span : '30', signsIn: Way | null = way && way in WAYS ? way as Way : null, lines = Math.min(Math.max(Number(n) || 50, 50), 2000);
  const activity = () => <Activity tz={tz} span={span} top={top} href={to => `${at('activity')}&days=${to}`} />;
  const people = () => <People tz={tz} way={signsIn} shown={lines} top={top} href={(to, shown) => `${at('people')}${to ? `&way=${to}` : ''}${shown ? `&n=${shown}` : ''}`} />;
  const body = { activity, people, review, clubs: clubsClaimed, schools: askedFor, events, rewards, feeds, places, tags, animals, premium, linkedin, campus: school }[tab]();
  return <div className="cs">
    {bar}
    <main className="cs-adm">
      <aside className="cs-adm-rail">
        <details className="school"><summary>{campus.name}</summary><nav aria-label="Campus">{campuses.filter(each => each.id !== campus.id).map(each => <Link key={each.id} href={at(tab, each.slug)}>{each.name}</Link>)}</nav></details>
        <nav aria-label="Sections">{(Object.keys(TABS) as Tab[]).map(each => <Link key={each} href={at(each)} aria-current={each === tab ? 'page' : undefined}>{TABS[each]}{each === 'feeds' && failed ? <small className="warn">{failed} failed</small> : each === 'review' && waiting ? <small className="warn">{waiting} waiting</small> : each === 'clubs' && claimsWaiting ? <small className="warn">{claimsWaiting} waiting</small> : counts[each] !== undefined && <small>{counts[each]}</small>}</Link>)}</nav>
        <p>Only you see this page.{frontIsCampus() ? ' Everyone else gets This week and nothing more.' : ' The groups site is open to its members again: LOOP_FRONT is set to groups.'}</p>
      </aside>
      <div className="cs-adm-main">
        {said && <p className="cs-adm-said" role="status">{said}</p>}
        {body}
      </div>
    </main>
    {foot}
  </div>;
}

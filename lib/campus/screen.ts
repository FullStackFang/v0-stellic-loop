import 'server-only';
import type { Db } from '../db';
import { knownTo } from './knows';
import { LEVELS, levelOf, textFor } from './levels';
import { addedSchools } from './linkedin';
import { findListing, listCampuses, weekListings, type Campus, type Listing } from './listings';
import { schoolOf } from './schools';
import { inviteChoices, outingsOn, pickOuting, type Outing } from './outings';
import { animal, animalOf, CUSTOM, customFace, PHOTO } from './animals';
import { picks as offered, schoolOfPerson, schoolsAt } from './animal-tiers';
import { customFaces, type CustomFace } from './custom-face';
import { plansOf, type Plan } from './ink';
import { accountPhotos, firstNames, pickedFaces, type Photos } from './people';
import { campusRewards, countedOutings, countsToward, groupRewardFor, progress, unitOf, type Counted, type Reward } from './rewards';
import { nearTags } from './tags';
import { checkInOpen, dayLabel, endOf, localParts, timeLabel } from './time';
import type { Coupon, Face, Live, Screen, Seat, Stub, Ticket, Viewer } from './view';

// Everything the campus screen shows one viewer (design D16, D19). What a person may see of others is decided here and
// nowhere else: first names and photos of people they know and of the people in their own outing, a count for the rest,
// and nothing but counts for a signed-out visitor.

export type ScreenViewer = { personId: string; admin: boolean; groups?: { name: string; href: string }[] };
export type ShareLink = { token: string; outingId: string; listingId: string };

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const list = (names: string[]) => names.join(', ').replace(/, ([^,]*)$/, ' and $1');

/** Words a search can use that come from when the event is, not what it is. */
function timeWords(tz: string, startsAt: string, now: Date): string[] {
  const at = localParts(tz, new Date(startsAt)), today = at.date === localParts(tz, now).date;
  const day = { Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday', Thu: 'thursday', Fri: 'friday', Sat: 'saturday', Sun: 'sunday' }[at.weekday] ?? '';
  return [day, ...(day === 'saturday' || day === 'sunday' ? ['weekend'] : []), ...(today ? ['today'] : []), ...(today && at.hour >= 17 ? ['tonight'] : []),
    at.hour < 12 ? 'morning' : at.hour < 17 ? 'afternoon' : 'evening', ...(at.hour >= 17 ? ['night'] : [])];
}

export async function campusScreen(db: Db, campus: Campus, viewer: ScreenViewer | null, options: { now?: Date; photos?: Photos; link?: ShareLink } = {}): Promise<Screen> {
  const now = options.now ?? new Date(), tz = campus.tz, me = viewer?.personId ?? null, link = options.link;
  let listings: Listing[] = await weekListings(db, campus, now);
  // A share link can point at a plan beyond this week; it is shown with the week.
  if (link && !listings.some(listing => listing.id === link.listingId)) {
    const extra = await findListing(db, link.listingId);
    if (extra?.live && extra.campusId === campus.id && endOf(extra.startsAt, extra.endsAt) > now.getTime()) listings = [...listings, extra].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }
  const [counted, allRewards] = await Promise.all([me ? countedOutings(db, me) : [], campusRewards(db, campus.id, true)]);
  const level = levelOf(counted.length), rewards = allRewards.filter(reward => !reward.hidden);
  if (me) {
    // Two kinds of event outside the week are still the viewer's own business. What they posted or are in for further
    // ahead, so a plan ten days out can be seen and changed by its poster. And what they checked in on that ended in
    // the last day, while it carries a group reward: a reward unlocked at the end of an event must still be usable.
    const { rows } = await db.query<{ id: string; past: boolean }>(`select l.id,coalesce(l.ends_at,l.starts_at+interval '2 hours')<=$3::timestamptz as past from campus_listing l
      where l.campus_id=$1 and ((l.hidden_at is null and l.cancelled_at is null and l.left_feed_at is null
          and l.starts_at>=((($3::timestamptz at time zone $4)::date+7)::timestamp at time zone $4)
          and (l.posted_by=$2 or exists(select 1 from campus_outing_member m where m.listing_id=l.id and m.person_id=$2)))
        or (coalesce(l.ends_at,l.starts_at+interval '2 hours')<=$3::timestamptz and coalesce(l.ends_at,l.starts_at+interval '2 hours')>$3::timestamptz-interval '24 hours'
          and exists(select 1 from campus_outing_member m where m.listing_id=l.id and m.person_id=$2 and m.checked_in_at is not null)))`, [campus.id, me, now.toISOString(), tz]);
    for (const row of rows) {
      if (listings.some(listing => listing.id === row.id)) continue;
      const extra = await findListing(db, row.id);
      if (extra && (!row.past || groupRewardFor(rewards, extra, level))) listings.push(extra);
    }
    listings.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }
  const outings = await outingsOn(db, listings.map(listing => listing.id)), outingIds = outings.map(outing => outing.id);
  const on = new Map<string, Outing[]>();
  for (const outing of outings) on.set(outing.listingId, [...(on.get(outing.listingId) ?? []), outing]);

  const [known, invited, groupUses, used] = await Promise.all([
    me ? knownTo(db, me) : new Map<string, string>(),
    me && outingIds.length ? db.query<{ id: string }>('select outing_id as id from campus_invite where invitee_id=$1 and outing_id=any($2::uuid[])', [me, outingIds]).then(result => new Set(result.rows.map(row => row.id))) : new Set<string>(),
    outingIds.length ? db.query<{ rewardId: string; outingId: string; usedAt: string }>('select reward_id as "rewardId",outing_id as "outingId",used_at as "usedAt" from campus_reward_use where outing_id=any($1::uuid[])', [outingIds]).then(result => result.rows) : [],
    me ? db.query<{ id: string; usedAt: string }>('select reward_id as id,used_at as "usedAt" from campus_reward_use where person_id=$1 and outing_id is null', [me]).then(result => new Map(result.rows.map(row => [row.id, row.usedAt]))) : new Map<string, string>(),
  ]);

  const mineOn = new Map<string, Outing>();
  if (me) for (const outing of outings) if (outing.members.some(member => member.personId === me)) mineOn.set(outing.listingId, outing);
  const choices = new Map<string, Awaited<ReturnType<typeof inviteChoices>>>();
  for (const outing of mineOn.values()) choices.set(outing.id, await inviteChoices(db, me!, outing, known));

  // The only people whose names are read: the viewer, people they know, the people in their own outings, and who posted a plan.
  const shown = new Set<string>();
  if (me) {
    shown.add(me);
    for (const outing of outings) for (const member of outing.members) if (known.has(member.personId) || mineOn.get(outing.listingId) === outing) shown.add(member.personId);
    for (const listing of listings) if (listing.origin === 'member' && listing.postedBy) shown.add(listing.postedBy);
    for (const some of choices.values()) for (const choice of some) shown.add(choice.personId);
  }
  const [names, picks, schoolAt] = await Promise.all([firstNames(db, [...shown]), pickedFaces(db, [...shown]), schoolsAt(db, [...shown])]);
  // Everyone has an animal: the one they picked, else the one their id works out to. A photo is read only for a person
  // who picked theirs, and for the viewer, who is offered it in the account card.
  const wanted = [...shown].filter(id => id === me || picks.get(id) === PHOTO);
  const photos = wanted.length ? await (options.photos ?? accountPhotos)(db, wanted) : {};
  // The animal a person had made is used for those who picked it, and for the viewer, who is offered theirs in the account card.
  // The same rows say who has Ink, which every face shows, so they are read for everyone shown.
  const made = await customFaces(db, [...shown]), plans = await plansOf(db, [...new Set([...shown, ...(viewer ? [viewer.personId] : [])])]);
  const planOf = (id: string) => plans.get(id) ?? 'free';
  const { picture } = facesOf({ picks, photos, made });
  const face = (id: string, more: Partial<Face> = {}): Face => ({ first: names.get(id)?.first ?? 'Someone', photo: picture(id), plan: planOf(id), school: schoolAt.get(id) ?? null, ...more });

  let live: Live | null = null;
  const tickets = listings.map((listing): Ticket => {
    const here = on.get(listing.id) ?? [], feed = listing.origin === 'feed', open = checkInOpen(listing.startsAt, listing.endsAt, now);
    const picked = pickOuting(here, me, known, invited), mine = picked.mine ? picked.outing! : null;
    const linked = link?.listingId === listing.id ? here.find(outing => outing.id === link.outingId) : undefined;
    const joinToken = linked && linked !== mine ? link!.token : null;
    // The outing whose seats the ticket shows: the viewer's, else the link's, else the one "I'm in" would join.
    // A signed-out visitor is shown the plan's own outing, or the fullest one, as taken seats with no faces.
    const target = mine ?? linked ?? picked.outing ?? (me ? null : here.find(outing => outing.open) ?? [...here].sort((a, b) => b.members.length - a.members.length)[0] ?? null);
    const inMine = !!mine && target === mine, self = mine?.members.find(member => member.personId === me), iAmHere = !!self?.here;
    const knownGoing = [...new Map(here.flatMap(outing => outing.members).filter(member => member.personId !== me && known.has(member.personId)).map(member => [member.personId, member])).values()];
    const faces = (inMine ? mine!.members.filter(member => member.personId !== me) : knownGoing).map(member => face(member.personId, { here: member.here }));

    let found: { reward: Reward; text: string } | null = groupRewardFor(rewards, listing, level);
    // A reward that was used and then hidden still shows, to the outing that used it, what it used: in the words of
    // the viewer's own level, and not at all when it has none for them.
    const usedHere = mine ? groupUses.find(use => use.outingId === mine.id) : undefined;
    if (usedHere && !found) {
      const reward = allRewards.find(candidate => candidate.id === usedHere.rewardId), text = reward && textFor(reward.texts, level);
      if (reward && text) found = { reward, text };
    }
    // An outing uses its reward once, whichever member marked it.
    const usedAt = found && target ? groupUses.find(use => use.outingId === target.id)?.usedAt ?? null : null;

    let stub: Stub, how: string | null = null, got = false;
    if (found) {
      const need = found.reward.headCount!, members = target?.members ?? [], row = members.slice(0, need);
      if (inMine && !row.some(member => member.personId === me)) row[need - 1] = self!;
      const seats: Seat[] = row.map(member => ({ taken: true, here: member.here, yours: false,
        face: member.personId === me ? face(member.personId, { me: true, here: member.here }) : inMine || known.has(member.personId) ? face(member.personId, { here: member.here }) : null }));
      for (let empty = 0; seats.length < need; empty++) seats.push({ taken: false, face: null, here: false, yours: empty === 0 && !inMine });
      const checkedIn = members.filter(member => member.here).length, left = Math.max(0, need - members.length), unlocked = checkedIn >= need;
      got = unlocked && iAmHere && inMine;
      const say = usedAt ? `Used at ${timeLabel(tz, usedAt)}` : got ? 'Unlocked for your group' : unlocked && inMine ? 'Unlocked. Check in to get it'
        : left === 0 ? (open ? `${checkedIn} of ${need} checked in` : `Enough are in. Unlocks when ${need} check in`)
        : left === 1 ? (inMine ? 'One more unlocks it' : 'You would unlock it') : `${left} more to unlock`;
      stub = { kind: 'group', giver: found.reward.giver, text: found.text, need, seats, say, state: got || usedAt ? 'met' : left === 1 ? 'near' : 'open' };
      how = `Once ${need} of you check in together, the whole group gets it.${level > 0 && textFor(found.reward.texts, 0) && found.text !== textFor(found.reward.texts, 0) ? ` Your ${LEVELS[level].name} level makes it better than the standard reward.` : ''}`;
      // The bar holds one: a reward still to be used before one already used.
      if (got && (!live || (live.usedAt && !usedAt))) live = { listingId: listing.id, giver: found.reward.giver, text: found.text, usedAt };
    } else {
      const event = { words: listing.words, host: listing.host, placeText: listing.placeText, placeName: listing.place?.name };
      // "Any outings" rewards count everywhere, so they live on the shelf and not on every ticket.
      const building = rewards.map(reward => ({ reward, text: textFor(reward.texts, level), made: progress(reward, counted, tz, now) }))
        .find(({ reward, text, made }) => reward.kind === 'building' && reward.rule !== 'outings' && !!text && !made.earned && !used.has(reward.id) && countsToward(reward, event));
      if (building) {
        const { need, done } = building.made, unit = unitOf(building.reward);
        stub = { kind: 'building', giver: building.reward.giver, text: building.text!, need, done, faces,
          say: me ? `${mine ? 'Counts as' : 'Would be'} your ${ordinal(done + 1)} of ${need} ${unit}` : `For ${need} ${unit}` };
        how = me ? `After ${need} ${unit}. This one would be your ${ordinal(done + 1)}.` : `After ${need} ${unit}.`;
      } else {
        const others = faces.map(each => each.first);
        stub = { kind: 'none', faces, say: !me ? (listing.going ? `${listing.going} going` : 'Nobody is in yet')
          : others.length ? `${list(others)} ${others.length > 1 ? 'are' : 'is'} going`
          : `${mine ? 'You are in. ' : listing.going ? `${listing.going} going. ` : ''}Nobody you know is going yet` };
      }
    }

    let action: Ticket['action'] = null, status: string | null = null;
    if (!mine) action = joinToken ? 'join' : feed ? 'register' : 'in';
    else if (usedAt) status = `Used ${timeLabel(tz, usedAt)}`;
    else if (open && !iAmHere) action = 'checkin';
    else if (got) action = 'use';
    else status = iAmHere ? 'Checked in' : feed ? 'Registered' : "You're in";

    const at = localParts(tz, new Date(listing.startsAt)), today = at.date === localParts(tz, now).date;
    const short = stub.kind === 'group' && stub.state === 'near';
    const later = new Date(Math.max(Date.parse(listing.startsAt), now.getTime())), mapAt = localParts(tz, later);
    const beyond = Date.parse(`${mapAt.date}T00:00:00Z`) - Date.parse(`${localParts(tz, now).date}T00:00:00Z`) > 6 * 86400000;
    return {
      id: listing.id, title: listing.title, day: dayLabel(tz, listing.startsAt, now), time: timeLabel(tz, listing.startsAt), when: listing.startsAt,
      mapDate: mapAt.date, mapDay: beyond ? `${mapAt.weekday} ${Number(mapAt.date.slice(8))}` : dayLabel(tz, later, now),
      ends: listing.endsAt ? `until ${timeLabel(tz, listing.endsAt)}` : null, source: listing.source,
      // Who posted a plan is for signed-in people only.
      by: listing.origin === 'member' ? (me && listing.postedBy ? `Posted by ${names.get(listing.postedBy)?.first ?? 'Someone'}` : null) : listing.host,
      place: listing.placeText ?? listing.place?.name ?? null, about: listing.about, link: listing.link, tags: listing.tags, map: listing.place,
      words: [...listing.words, ...timeWords(tz, listing.startsAt, now), ...listing.tags],
      pull: (mine || picked.outing && invited.has(picked.outing.id) ? 4 : 0) + Math.min(knownGoing.length, 2) + (stub.kind === 'none' ? 0 : 2) + (short ? 2 : 0) + (today ? 1 : 0),
      going: listing.going, stub, how,
      known: knownGoing.map(member => ({ ...face(member.personId, { here: member.here }), why: known.get(member.personId)! })),
      mine: mine && self ? {
        token: mine.token, registered: self.registered, here: iAmHere, canLeave: !iAmHere,
        canEdit: listing.origin === 'member' && listing.postedBy === me && Date.parse(listing.startsAt) > now.getTime(),
        members: mine.members.map(member => face(member.personId, { here: member.here, me: member.personId === me })),
        choices: (choices.get(mine.id) ?? []).map(choice => ({ ...choice, first: names.get(choice.personId)?.first ?? 'Someone', photo: picture(choice.personId), plan: planOf(choice.personId), school: schoolAt.get(choice.personId) ?? null })),
      } : null,
      action, status, joinToken,
    };
  });

  // Rewards the person is earning or has earned (design D16, "Under the row"). One they used stays for a week, saying when.
  const earning: Coupon[] = !me ? [] : rewards.filter(reward => reward.kind === 'building').flatMap(reward => {
    const text = textFor(reward.texts, level), made = progress(reward, counted, tz, now), usedAt = used.get(reward.id) ?? null;
    if (!text || (usedAt && Date.parse(usedAt) < now.getTime() - 7 * 86400000)) return [];
    if (usedAt) return [{ id: reward.id, giver: reward.giver, text, ...made, usedAt, progress: `Used ${dayLabel(tz, usedAt, now)}, ${timeLabel(tz, usedAt)}` }];
    return made.done > 0 || made.earned ? [{ id: reward.id, giver: reward.giver, text, ...made, usedAt, progress: made.earned ? 'Earned' : `${made.done} of ${made.need} ${unitOf(reward)}` }] : [];
  });

  return {
    campus: { slug: campus.slug, name: campus.name, tz, listSource: campus.listSource },
    viewer: viewer && await accountViewer(db, viewer, { read: { names, picks, photos, made, plans, counted } }),
    tickets, earning, live, places: me ? await nearTags(db, campus.id, known, now) : [],
  };
}

/** What is read of people to draw their faces: names, picked animals, photos, made animals and plans, by person. */
type People = { names: Map<string, { first: string; name: string }>; picks: Map<string, number>; photos: Record<string, string>; made: Map<string, CustomFace>; plans: Map<string, Plan> };
/** A person's face: the animal they picked, their photo or the animal they had made, else the animal their id works out to. */
function facesOf({ picks, photos, made }: Pick<People, 'picks' | 'photos' | 'made'>) {
  const faceOf = (id: string) => { const pick = picks.get(id); return pick === PHOTO && photos[id] ? PHOTO : pick === CUSTOM && made.get(id)?.token ? CUSTOM : pick === undefined || pick < 0 ? animalOf(id) : pick; };
  const picture = (id: string) => { const pick = faceOf(id); return pick === PHOTO ? photos[id] : pick === CUSTOM ? customFace(made.get(id)!.token!) : animal(pick); };
  return { faceOf, picture };
}

/**
 * What the account card shows (components/campus/screen.tsx, Account): face, picks, schools, plan, level, colours and
 * links. The campus screen passes what it has already read of people (`read`); a bar that draws no week reads only this,
 * in two waves, and none of the week's events, places or other people's pictures.
 */
export async function accountViewer(db: Db, viewer: ScreenViewer, options: { photos?: Photos; read?: People & { counted: Counted[] } } = {}): Promise<Viewer> {
  const me = viewer.personId;
  const [read, home, linked, campuses] = await Promise.all([
    options.read ?? Promise.all([firstNames(db, [me]), pickedFaces(db, [me]), (options.photos ?? accountPhotos)(db, [me]), customFaces(db, [me]), plansOf(db, [me]), countedOutings(db, me)])
      .then(([names, picks, photos, made, plans, counted]) => ({ names, picks, photos, made, plans, counted })),
    schoolOfPerson(db, me), addedSchools(db, me), listCampuses(db)]);
  const shown = await offered(db, viewer.admin ? 'all' : [...(home ? [home] : []), ...linked.added]);
  const { faceOf, picture } = facesOf(read), self = read.names.get(me), mine = read.made.get(me), plan = read.plans.get(me) ?? 'free';
  return { first: self?.first ?? 'You', name: self?.name ?? 'You', photo: picture(me), face: faceOf(me), ownPhoto: read.photos[me] ?? null,
    own: mine?.token ? customFace(mine.token) : null, owns: (mine?.all ?? []).map(customFace), picks: shown,
    schools: { profile: linked.profile, added: linked.added, home, all: campuses.filter(each => schoolOf(each.slug) === each.slug).map(each => ({ slug: each.slug, name: each.name })) },
    asked: plan !== 'free', makesLeft: viewer.admin || plan === 'plus' ? null : mine?.left ?? 0, plan, anyKit: viewer.admin || plan === 'plus',
    level: levelOf(read.counted.length), outings: read.counted.length, admin: viewer.admin, groups: viewer.groups ?? [] };
}

/** The screen a bar that draws no week is given: its campus and the account card, with the week's lists left empty. */
export async function barScreen(db: Db, campus: Campus, viewer: ScreenViewer | null): Promise<Screen> {
  return { campus: { slug: campus.slug, name: campus.name, tz: campus.tz, listSource: campus.listSource },
    viewer: viewer && await accountViewer(db, viewer), tickets: [], earning: [], live: null, places: [] };
}

import 'server-only';
import type { Db, Q } from '../db';
import { CampusError } from './errors';
import { levelOf, textFor } from './levels';
import { weekOf } from './time';

// Rewards ride on events (design D8). A group reward unlocks when enough people of one outing have checked in.
// A building reward is earned by a person's outings over time. The admin enters every reward by hand.

export type Reward = {
  id: string; campusId: string; giver: string; kind: 'group' | 'building';
  /** The reward's text for Member, Regular and Insider. */
  texts: [string | null, string | null, string | null];
  listingId: string | null; hostName: string | null; headCount: number | null;
  rule: 'outings' | 'word' | 'weeks' | null; ruleCount: number | null; ruleWord: string | null;
  hidden: boolean;
};
type Row = Omit<Reward, 'texts'> & { t0: string | null; t1: string | null; t2: string | null };
const REWARD = `id,campus_id as "campusId",giver,kind,text_member as t0,text_regular as t1,text_insider as t2,listing_id as "listingId",host_name as "hostName",
  head_count as "headCount",rule,rule_count as "ruleCount",rule_word as "ruleWord",hidden_at is not null as hidden`;
const shape = ({ t0, t1, t2, ...row }: Row): Reward => ({ ...row, texts: [t0, t1, t2] });

/** A campus's rewards, newest first. Hidden ones only when asked for (the admin page, and what was already used). */
export async function campusRewards(q: Q, campusId: string, withHidden = false): Promise<Reward[]> {
  return (await q.query<Row>(`select ${REWARD} from campus_reward where campus_id=$1 ${withHidden ? '' : 'and hidden_at is null'} order by created_at desc,id`, [campusId])).rows.map(shape);
}

export type RewardInput = {
  campusId: string; id?: string; giver: string; kind: 'group' | 'building'; texts: (string | null | undefined)[];
  listingId?: string | null; hostName?: string | null; headCount?: number | null;
  rule?: string | null; ruleCount?: number | null; ruleWord?: string | null;
};
const clean = (value: string | null | undefined) => value?.trim() || null;

/** Adds a reward, or changes the one with `id`. */
export async function saveReward(q: Q, input: RewardInput): Promise<{ id: string }> {
  const texts = [0, 1, 2].map(level => clean(input.texts[level])), giver = input.giver.trim();
  if (!giver) throw new CampusError('Say who gives the reward.');
  if (!texts.some(Boolean)) throw new CampusError('Say what the reward is, for at least one level.');
  let values: unknown[];
  if (input.kind === 'group') {
    const listingId = clean(input.listingId), hostName = clean(input.hostName);
    if (!Number.isInteger(input.headCount) || input.headCount! < 2) throw new CampusError('A group reward needs a group of two or more.');
    if (!listingId === !hostName) throw new CampusError('A group reward rides on one event, or on every event of one host: pick one.');
    if (listingId && !(await q.query('select 1 from campus_listing where id=$1 and campus_id=$2', [listingId, input.campusId])).rows.length) throw new CampusError('That event is not on this campus.');
    values = [listingId, hostName, input.headCount, null, null, null];
  } else if (input.kind === 'building') {
    const rule = input.rule, word = clean(input.ruleWord)?.toLowerCase() ?? null;
    if (rule !== 'outings' && rule !== 'word' && rule !== 'weeks') throw new CampusError('Pick one of the three rules.');
    if (!Number.isInteger(input.ruleCount) || input.ruleCount! < 1 || input.ruleCount! > 100) throw new CampusError('Say how many, from 1 to 100.');
    if (rule === 'word' && !/^[a-z0-9]{1,30}$/.test(word ?? '')) throw new CampusError('Give the one word the events must carry.');
    values = [null, null, null, rule, input.ruleCount, rule === 'word' ? word : null];
  } else throw new CampusError('A reward is a group reward or a building reward.');
  const all = [input.campusId, giver, input.kind, ...texts, ...values];
  const { rows: [row] } = input.id
    ? await q.query<{ id: string }>(`update campus_reward set giver=$2,kind=$3,text_member=$4,text_regular=$5,text_insider=$6,listing_id=$7,host_name=$8,head_count=$9,rule=$10,rule_count=$11,rule_word=$12
        where campus_id=$1 and id=$13 returning id`, [...all, input.id])
    : await q.query<{ id: string }>(`insert into campus_reward(campus_id,giver,kind,text_member,text_regular,text_insider,listing_id,host_name,head_count,rule,rule_count,rule_word)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`, all);
  if (!row) throw new CampusError('No such reward.');
  return row;
}
export async function setRewardHidden(q: Q, rewardId: string, hidden: boolean) {
  await q.query('update campus_reward set hidden_at=case when $2 then coalesce(hidden_at,now()) end where id=$1', [rewardId, hidden]);
}

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The group reward on an event for a person at a level: the one set on the event itself, else the newest one on the
 * name of its host or of the place it is at. A reward with no text at or below the level is passed over, as if it were not there.
 */
export function groupRewardFor(rewards: readonly Reward[], listing: { id: string; host: string | null; place?: { name: string } | null }, level: number): { reward: Reward; text: string } | null {
  const fits = rewards.filter(reward => reward.kind === 'group' && (reward.listingId === listing.id || same(reward.hostName, listing.host) || same(reward.hostName, listing.place?.name)))
    .sort((a, b) => Number(b.listingId === listing.id) - Number(a.listingId === listing.id));
  for (const reward of fits) { const text = textFor(reward.texts, level); if (text) return { reward, text }; }
  return null;
}

/** An outing that counts for a person (design D8): they checked in, and so did at least one other person of the same outing. */
export type Counted = { outingId: string; startsAt: string; words: string[]; host: string | null; placeText: string | null; placeName: string | null; others: string[] };

export async function countedOutings(q: Q, personId: string): Promise<Counted[]> {
  const { rows } = await q.query<Counted>(`select m.outing_id as "outingId",l.starts_at as "startsAt",l.words,l.host_name as host,l.place_text as "placeText",p.name as "placeName",
      array(select o.person_id::text from campus_outing_member o where o.outing_id=m.outing_id and o.person_id<>m.person_id and o.checked_in_at is not null order by 1) as others
    from campus_outing_member m join campus_listing l on l.id=m.listing_id left join campus_place p on p.id=l.place_id
    where m.person_id=$1 and m.checked_in_at is not null order by l.starts_at`, [personId]);
  return rows.filter(row => row.others.length > 0);
}

/** Whether an event is the giver's: the giver hosts it, or it is at the giver's place. */
export function isGivers(giver: string, event: { host: string | null; placeText: string | null; placeName?: string | null }): boolean {
  return same(giver, event.host) || same(giver, event.placeName) || (!!event.placeText && ` ${event.placeText.toLowerCase()} `.includes(` ${giver.trim().toLowerCase()} `));
}
/** Whether an outing on this event would count toward a building reward. */
export function countsToward(reward: Reward, event: { words: string[]; host: string | null; placeText: string | null; placeName?: string | null }): boolean {
  return reward.rule === 'outings' || (reward.rule === 'word' && event.words.includes(reward.ruleWord!)) || (reward.rule === 'weeks' && isGivers(reward.giver, event));
}

const WEEK = 7 * 86400000;
/**
 * How far a person is toward a building reward. For the weeks rule: the same other person, at the giver's events, in
 * each of a number of weeks in a row. Earned once such a run has happened; until then, the run that is still alive
 * (it reaches this week or last week) is the progress, so a missed week starts it again.
 */
export function progress(reward: Reward, counted: readonly Counted[], tz: string, now: Date): { done: number; need: number; earned: boolean } {
  const need = reward.ruleCount ?? 1;
  if (reward.rule !== 'weeks') {
    const done = counted.filter(outing => countsToward(reward, outing)).length;
    return { done: Math.min(done, need), need, earned: done >= need };
  }
  const weeks = new Map<string, Set<number>>();
  for (const outing of counted) if (isGivers(reward.giver, outing)) for (const other of outing.others) {
    if (!weeks.has(other)) weeks.set(other, new Set());
    weeks.get(other)!.add(Date.parse(`${weekOf(tz, outing.startsAt)}T00:00:00Z`));
  }
  const thisWeek = Date.parse(`${weekOf(tz, now)}T00:00:00Z`);
  let longest = 0, alive = 0;
  for (const set of weeks.values()) for (const week of set) {
    if (set.has(week - WEEK)) continue;
    let run = 1; while (set.has(week + run * WEEK)) run++;
    longest = Math.max(longest, run);
    if (week + (run - 1) * WEEK >= thisWeek - WEEK) alive = Math.max(alive, run);
  }
  return longest >= need ? { done: need, need, earned: true } : { done: alive, need, earned: false };
}

/** What a building reward counts, in words: "group runs" is "run outings" here. */
export function unitOf(reward: Reward): string {
  return reward.rule === 'word' ? `${reward.ruleWord} outings` : reward.rule === 'weeks' ? 'weeks with the same group' : 'outings';
}

/** A person's level, from the outings that count for them. */
export async function levelFor(q: Q, personId: string): Promise<{ level: number; outings: number }> {
  const outings = (await countedOutings(q, personId)).length;
  return { level: levelOf(outings), outings };
}

/**
 * Marks the group reward of the person's outing on this event as used. Any checked-in member may, once: a second
 * mark, or two at the same moment, leave the first time in place. Returns that time.
 */
export async function useGroupReward(db: Db, personId: string, listingId: string): Promise<{ usedAt: string }> {
  return db.tx(async q => {
    const { rows: [mine] } = await q.query<{ outingId: string; here: boolean; campusId: string; host: string | null; placeName: string | null; count: number }>(`select m.outing_id as "outingId",m.checked_in_at is not null as here,l.campus_id as "campusId",l.host_name as host,
        (select p.name from campus_place p where p.id=l.place_id) as "placeName",
        (select count(*)::int from campus_outing_member o where o.outing_id=m.outing_id and o.checked_in_at is not null) as count
      from campus_outing_member m join campus_listing l on l.id=m.listing_id where m.listing_id=$1 and m.person_id=$2`, [listingId, personId]);
    if (!mine?.here) throw new CampusError('Check in first: the reward is for the people who checked in.');
    // One use per outing, whichever member marks it and whatever their level: held so two marks go one after the other.
    await q.query('select id from campus_outing where id=$1 for update', [mine.outingId]);
    const { rows: [already] } = await q.query<{ usedAt: string }>('select used_at as "usedAt" from campus_reward_use where outing_id=$1 order by used_at limit 1', [mine.outingId]);
    if (already) return already;
    const found = groupRewardFor(await campusRewards(q, mine.campusId), { id: listingId, host: mine.host, place: mine.placeName ? { name: mine.placeName } : null }, (await levelFor(q, personId)).level);
    if (!found) throw new CampusError('There is no reward on this event.');
    if (mine.count < found.reward.headCount!) throw new CampusError(`It unlocks when ${found.reward.headCount} of your group have checked in.`);
    await q.query('insert into campus_reward_use(reward_id,person_id,outing_id) values($1,$2,$3) on conflict do nothing', [found.reward.id, personId, mine.outingId]);
    const { rows: [use] } = await q.query<{ usedAt: string }>('select used_at as "usedAt" from campus_reward_use where reward_id=$1 and outing_id=$2', [found.reward.id, mine.outingId]);
    return use;
  });
}

/** Marks a building reward the person has earned as used, once. */
export async function useBuildingReward(db: Db, personId: string, rewardId: string, campus: { id: string; tz: string }, now: Date = new Date()): Promise<{ usedAt: string }> {
  return db.tx(async q => {
    const { rows: [row] } = await q.query<Row>(`select ${REWARD} from campus_reward where id=$1 and campus_id=$2 and kind='building' and hidden_at is null`, [rewardId, campus.id]);
    const counted = await countedOutings(q, personId);
    if (!row || !textFor(shape(row).texts, levelOf(counted.length))) throw new CampusError('There is no such reward.');
    if (!progress(shape(row), counted, campus.tz, now).earned) throw new CampusError('This reward is not earned yet.');
    await q.query('insert into campus_reward_use(reward_id,person_id) values($1,$2) on conflict do nothing', [rewardId, personId]);
    const { rows: [use] } = await q.query<{ usedAt: string }>('select used_at as "usedAt" from campus_reward_use where reward_id=$1 and person_id=$2 and outing_id is null', [rewardId, personId]);
    return use;
  });
}

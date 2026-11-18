// "What do you feel like doing?" (design D10): a few best matches by meaning, done with words. Runs in the browser as the
// person types, on the week's events already on the screen. Nothing here is shown as a reason for a ranking: ranking is silent.

export type Findable = {
  id: string; title: string; host: string | null; place: string | null; source: string | null;
  /** The event's "good for" words, with the words its day and hour add ("today", "tonight", "morning"). */
  words: string[];
  /** What draws this viewer to it: they are in or invited, people they know are in, it has a reward, it is one short, it is today. */
  pull: number;
};
export type Picked = { best: string[]; rest: string[]; line: string; marker: string | null; nothing: boolean };

export const FILLER = new Set('a an the to of in on at for and or with some something anything want wanna would like i go do me my feel feeling up is it be'.split(' '));
const split = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
/** The words of what was typed that carry meaning. */
export const meant = (typed: string) => split(typed).filter(word => !FILLER.has(word));

// A typed word matches a word it begins. A good-for word may also be the shorter of the two, so "running" finds "run";
// the words of a title may not, or "theater" would find every title with "the" in it.
const hit = (words: readonly string[], typed: string, eitherWay = false) => words.some(word => word === typed || (word.length > 2 && typed.length > 2 && (word.startsWith(typed) || (eitherWay && typed.startsWith(word)))));

/** How well an event matches: 3 for each typed word found in its title, host or place, 2 for one found in its "good for" words. */
export function fit(item: Findable, typed: string): number {
  const head = split(`${item.title} ${item.host ?? ''} ${item.place ?? ''}`);
  return meant(typed).reduce((score, word) => score + (hit(head, word) ? 3 : hit(item.words, word, true) ? 2 : 0), 0);
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * What the row holds. `items` are the week's events in time order.
 * - Nothing typed: the five with the most pull are the best, in time order; the rest follow after a marker.
 * - Something typed: rank is twice the fit plus the pull; the best are those within 60% of the top, at most four; looser matches follow.
 * - The complete view of one source: every event of that source in time order, or every one that matches. No best, no marker.
 */
export function pick(items: readonly Findable[], typed: string, view: 'best' | 'all', listSource: string): Picked {
  const asked = meant(typed).length > 0, said = `“${typed.trim()}”`;
  const pool = view === 'all' ? items.filter(item => item.source === listSource) : items;
  if (view === 'all') {
    const rows = asked ? pool.filter(item => fit(item, typed) > 0) : pool;
    return { best: rows.map(item => item.id), rest: [], marker: null, nothing: rows.length === 0,
      line: asked ? `${rows.length} on ${listSource} for ${said}` : `All ${plural(pool.length, `${listSource} event`, `${listSource} events`)} this week` };
  }
  if (!asked) {
    const top = new Set([...pool].sort((a, b) => b.pull - a.pull).slice(0, 5).map(item => item.id));
    const best = pool.filter(item => top.has(item.id)).map(item => item.id), rest = pool.filter(item => !top.has(item.id)).map(item => item.id);
    return { best, rest, nothing: pool.length === 0, marker: rest.length ? `${rest.length} more this week` : null,
      line: !pool.length ? 'Nothing on this week yet' : rest.length ? `Your best ${best.length} of ${pool.length} this week` : `${plural(pool.length, 'event', 'events')} this week` };
  }
  const ranked = pool.map(item => ({ id: item.id, rank: fit(item, typed) * 2 + item.pull, fit: fit(item, typed) })).filter(row => row.fit > 0).sort((a, b) => b.rank - a.rank);
  if (!ranked.length) return { best: [], rest: [], marker: null, nothing: true, line: `Nothing for ${said}` };
  const best = ranked.filter(row => row.rank >= ranked[0].rank * 0.6).slice(0, 4), rest = ranked.slice(best.length);
  return { best: best.map(row => row.id), rest: rest.map(row => row.id), nothing: false, marker: rest.length ? plural(rest.length, 'looser match', 'looser matches') : null,
    line: `${plural(best.length, 'best match', 'best matches')} for ${said}` };
}

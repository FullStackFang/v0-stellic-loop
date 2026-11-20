import 'server-only';
import LIST from './us-colleges.json';

// The list "Sign up my school" searches: US colleges from the government's directory (scripts/us-colleges.cjs builds
// the file). It is read here and nowhere else, and never leaves the server whole.

/** A college on the list. `label` is what is kept and shown: its name, with the town where two schools share a name. */
export type College = { label: string; where: string; domain: string };
type Entry = College & { words: string[]; short: Set<string>; size: number };

/** The words of a name or of what someone typed, in small letters, without "the": "St. John's" is "st johns". */
const words = (text: string) => text.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(word => word && word !== 'the');

let all: Entry[] | null = null;
const named = new Map<string, Entry>();
function entries(): Entry[] {
  if (all) return all;
  const rows = LIST as unknown as [name: string, city: string, state: string, domain: string, size: number, short: string[]][];
  const times = new Map<string, number>();
  for (const [name] of rows) times.set(name, (times.get(name) ?? 0) + 1);
  all = rows.map(([name, city, state, domain, size, short]) => {
    const where = `${city}, ${state}`;
    return { label: times.get(name)! > 1 ? `${name} (${where})` : name, where, domain, size, words: words(name), short: new Set(short.map(each => words(each).join(' '))) };
  });
  for (const each of all) named.set(each.label.toLowerCase(), each);
  return all;
}
const college = ({ label, where, domain }: Entry): College => ({ label, where, domain });

/** The college with exactly this label, whatever the capitals; null for anything else. */
export function collegeNamed(text: string): College | null {
  entries();
  const hit = named.get(text.trim().replace(/\s+/g, ' ').toLowerCase());
  return hit ? college(hit) : null;
}

/**
 * The colleges that what was typed could mean, the likeliest first, and how many there are in all. A school matches
 * when what was typed is one of its short names ("umich"), or when every word typed starts a word of its name. Short
 * names come first, and the larger school before the smaller.
 */
export function findColleges(typed: string, limit = 5): { found: College[]; total: number } {
  const exact = collegeNamed(typed);
  if (exact) return { found: [exact], total: 1 };
  const want = words(typed), whole = want.join(' ');
  if (whole.length < 2) return { found: [], total: 0 };
  const hits: [Entry, number][] = [];
  for (const each of entries()) {
    if (each.short.has(whole)) hits.push([each, 0]);
    else if (want.every(word => each.words.some(part => part.startsWith(word)))) hits.push([each, 1]);
  }
  hits.sort(([a, first], [b, second]) => first - second || b.size - a.size || a.label.localeCompare(b.label));
  return { found: hits.slice(0, limit).map(([each]) => college(each)), total: hits.length };
}

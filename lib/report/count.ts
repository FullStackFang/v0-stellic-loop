// Counting for the venue report (scripts/venue-ai-report.ts): how many answers named the venue, by assistant,
// and who was named instead. Pure: the answers come in already read into place names.

export type Answer = { assistant: string; question: string; text: string; places: string[] };
export type Count = {
  venue: string;
  asked: number;
  named: number;
  byAssistant: { assistant: string; named: number; asked: number }[];
  instead: { name: string; count: number }[];
};

// A name without case, punctuation or a leading "the". Apostrophes join ("Blackwell's" = "blackwells").
const key = (name: string) => name.toLowerCase()
  .replace(/['’‘`]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .replace(/^the /, '');

export const sameName = (a: string, b: string) => key(a) === key(b);

export function countReport(venue: string, alsoNames: string[], answers: Answer[]): Count {
  const venueKeys = new Set([venue, ...alsoNames].map(key));
  const by = new Map<string, { named: number; asked: number }>();
  const instead = new Map<string, { name: string; count: number }>();
  let named = 0;
  for (const answer of answers) {
    const keys = new Map<string, string>();
    for (const place of answer.places) if (key(place) && !keys.has(key(place))) keys.set(key(place), place.trim());
    const hit = [...keys.keys()].some((k) => venueKeys.has(k));
    const row = by.get(answer.assistant) ?? { named: 0, asked: 0 };
    row.asked += 1;
    if (hit) { row.named += 1; named += 1; }
    by.set(answer.assistant, row);
    for (const [k, name] of keys) {
      if (venueKeys.has(k)) continue;
      const seen = instead.get(k) ?? { name, count: 0 };
      seen.count += 1;
      instead.set(k, seen);
    }
  }
  return {
    venue,
    asked: answers.length,
    named,
    byAssistant: [...by].map(([assistant, r]) => ({ assistant, ...r })),
    // Most named first; a tie keeps the order the places were first seen in (Array.sort is stable).
    instead: [...instead.values()].sort((x, y) => y.count - x.count).slice(0, 3),
  };
}

// Levels (design D15): earned by outings that count, never bought. The names and numbers are not yet confirmed by the founder.
// No 'server-only': the level card on the screen reads this list too.

export const LEVELS = [
  { name: 'Member', from: 0, gets: 'The standard group reward everywhere.' },
  { name: 'Regular', from: 5, gets: 'A better version of some rewards.' },
  { name: 'Insider', from: 15, gets: 'The best version of every reward, and a few extra ones.' },
] as const;

/** 0 for Member, 1 for Regular, 2 for Insider. */
export function levelOf(outings: number): number {
  return LEVELS.reduce((level, { from }, index) => outings >= from ? index : level, 0);
}

/**
 * The text of a reward for a level: its own, else the nearest lower level's. Null when there is none at or below the
 * level, and the reward is then not shown to that person at all.
 */
export function textFor(texts: readonly (string | null)[], level: number): string | null {
  for (let at = level; at >= 0; at--) if (texts[at]) return texts[at];
  return null;
}

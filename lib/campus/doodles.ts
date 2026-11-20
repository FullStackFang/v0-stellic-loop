// Doodles: the page that holds Loopd's games, things to play while a group is still gathering its people
// (openspec/changes/loop-doodles, public/demo/mockups-games-shelf.html).

export const DOODLES_PAGE = '/c/doodles';

export type Doodle = {
  slug: 'conga' | 'seats';
  name: string;
  line: string;
  /** Where it is played. */
  href: string;
  /** Out for everyone. One that is not is staged: the admin alone sees it on the page, greyed. */
  live: boolean;
  /** Out, and not finished: its ticket says "In the works". */
  works?: boolean;
  /** The name the game keeps the player's best under, in the browser. */
  bestKey?: string;
};

/** Every doodle, in the order of the page. To put a staged one out, set `live`. */
export const DOODLES: readonly Doodle[] = [
  { slug: 'conga', name: 'Conga', line: 'Walk your animal round campus and gather the longest line.', href: '/conga', live: true, bestKey: 'conga-best' },
  { slug: 'seats', name: 'Seats', line: 'Everyone gets kicked out. Put each one back in its own seat, fast.', href: '/seats', live: true, works: true, bestKey: 'seats-best' },
];

/** The doodles a person is shown: the ones that are out, and for the admin the staged ones after them. */
export const doodlesFor = (admin: boolean): Doodle[] => DOODLES.filter(each => each.live || admin);

// Doodles: the page that holds Loopd's games, things to play while a group is still gathering its people
// (openspec/changes/loop-doodles, public/demo/mockups-games-shelf.html).

export const DOODLES_PAGE = '/c/doodles';
/** Where Seats is played: a page of the app, under Doodles. */
export const SEATS_PAGE = '/c/doodles/seats';

export type Doodle = {
  slug: 'conga' | 'seats';
  name: string;
  /** What its picture shows, said for someone who cannot see it. */
  line: string;
  /** Where it is played. */
  href: string;
  /** Out for everyone. One that is not is staged: the admin alone sees it on the page, greyed. */
  live: boolean;
  /** Out, and not finished: its ticket says "In the works". */
  works?: boolean;
  /** How big its recording is, in pixels: public/doodles/<slug>.v1.mp4, with its first frame beside it as .webp. */
  shot: readonly [width: number, height: number];
};

/** Every doodle, in the order of the page. To put a staged one out, set `live`. */
export const DOODLES: readonly Doodle[] = [
  { slug: 'conga', name: 'Conga', line: 'Conga being played: an animal walks round campus with a long line of animals behind it.', href: '/conga', live: true, shot: [1280, 720] },
  { slug: 'seats', name: 'Seats', line: 'Seats being played: tiles are flipped and pairs of animals found, against the clock.', href: SEATS_PAGE, live: true, works: true, shot: [696, 1016] },
];

/** The campuses Conga has a map of (public/conga/maps.js). From one of them, Play goes to that map. */
export const MAPPED = new Set(['cornell', 'cornell-tech', 'columbia']);
/** Where Play leads, from the campus the page is drawn for. */
export const playAt = (doodle: Doodle, campus: { slug: string }) => doodle.slug === 'conga' && MAPPED.has(campus.slug) ? `${doodle.href}?map=${campus.slug}` : doodle.href;

/** The doodles a person is shown: the ones that are out, and for the admin the staged ones after them. */
export const doodlesFor = (admin: boolean): Doodle[] => DOODLES.filter(each => each.live || admin);

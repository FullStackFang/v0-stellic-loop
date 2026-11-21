// Doodles: the page that holds Loopd's games, things to play while a group is still gathering its people
// (openspec/changes/loop-doodles, public/demo/mockups-games-shelf.html).

export const DOODLES_PAGE = '/c/doodles';
/** Where Seats is played: a page of the app, under Doodles. */
export const SEATS_PAGE = '/c/doodles/seats';

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
  { slug: 'seats', name: 'Seats', line: 'Flip the tiles and find every pair of animals, against the clock.', href: SEATS_PAGE, live: true, works: true, bestKey: 'seats-best' },
];

/**
 * Each doodle as a course of the campus the page is drawn for (direction B of public/demo/mockups-doodles-campus.html):
 * a course code, the line, and three things you will learn. Conga walks the real grounds of the campuses it has a map of
 * (public/conga/maps.js), and is sent to that map; elsewhere its lines name no place.
 */
export type Course = { code: string; line: string; learn: readonly [string, string, string]; href: string; places: readonly string[] };
type Ground = { map: string; places: readonly [string, string, string]; learn: readonly [string, string] };
const GROUNDS: Record<string, Ground> = {
  cornell: { map: 'cornell', places: ['McGraw Tower', 'Libe Slope', 'Beebe Lake'], learn: ['Where McGraw Tower stands from Libe Slope', 'The quickest way round Beebe Lake'] },
  'cornell-tech': { map: 'cornell-tech', places: ['the Tram', 'the Bloomberg Center', 'Four Freedoms Park'], learn: ['Where the Tram lands from the Bloomberg Center', 'The walk down to Four Freedoms Park'] },
};
export function course(doodle: Doodle, campus: { slug: string; name: string }): Course {
  if (doodle.slug === 'seats') return { code: 'ANIMALS 1020', line: doodle.line, href: doodle.href, places: [],
    learn: ['The animals your classmates wear on Loopd', 'Where each pair hides, after one look', 'How fast you can clear the chart'] };
  const ground = GROUNDS[campus.slug];
  if (!ground) return { code: 'CAMPUS 1010', line: doodle.line, href: doodle.href, places: [], learn: ['Your way round a campus, by its real paths', 'How long a line you can keep behind you', 'Who else is out walking today'] };
  return { code: 'CAMPUS 1010', line: `Walk your animal round ${campus.name} and gather the longest line of classmates.`, href: `${doodle.href}?map=${ground.map}`, places: ground.places,
    learn: [...ground.learn, 'Who else is out walking today'] };
}
/** The term a date falls in, as a course catalogue names it: "Fall 2026". */
export const term = (on: Date) => `${on.getMonth() < 5 ? 'Spring' : on.getMonth() < 7 ? 'Summer' : 'Fall'} ${on.getFullYear()}`;

/** The doodles a person is shown: the ones that are out, and for the admin the staged ones after them. */
export const doodlesFor = (admin: boolean): Doodle[] => DOODLES.filter(each => each.live || admin);

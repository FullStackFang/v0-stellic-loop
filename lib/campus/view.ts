// What the campus screen is drawn from. Built on the server for one viewer (lib/campus/screen.ts) and handed to the
// screen's client parts, so it holds only what that viewer may see: a stranger's name is never in it.

import type { NearTag } from './tags';

/** `ink` is whether the person has Loopd Ink: their face wears its mark. */
export type Face = { first: string; photo: string | null; ink: boolean; here?: boolean; me?: boolean };
/** One seat of a group reward. A seat taken by someone the viewer does not know has no face. */
export type Seat = { taken: boolean; face: Face | null; here: boolean; yours: boolean };

export type Stub =
  | { kind: 'group'; giver: string; text: string; need: number; seats: Seat[]; say: string; state: 'open' | 'near' | 'met' }
  | { kind: 'building'; giver: string; text: string; need: number; done: number; say: string; faces: Face[] }
  | { kind: 'none'; say: string; faces: Face[] };

export type Choice = { personId: string; first: string; photo: string | null; ink: boolean; why: string; invited: boolean };

export type Ticket = {
  id: string; title: string; day: string; time: string; ends: string | null; when: string;
  /** The day the map shows it under: the local date, and its name. Something already running is under today. */
  mapDate: string; mapDay: string;
  source: string | null; by: string | null; place: string | null; about: string | null;
  /** The event page a posted plan was filled from. */
  link: string | null;
  /** The tags of a posted plan, in the order typed, without the @. */
  tags: string[];
  map: { name: string; lat: number; lon: number } | null;
  /** For search: "good for" words plus what the day and hour add. */
  words: string[]; pull: number; going: number;
  stub: Stub; how: string | null;
  /** People the viewer knows who are going, for the panel. */
  known: (Face & { why: string })[];
  mine: null | { token: string; registered: boolean; here: boolean; members: Face[]; choices: Choice[]; canLeave: boolean; canEdit: boolean };
  /** The one next step. `join` is the share link's. `register` opens the panel, where "Register me" is. */
  action: 'in' | 'register' | 'join' | 'checkin' | 'use' | null;
  status: string | null;
  /** The share link's token, when the screen was opened from one and the viewer is not in that outing. */
  joinToken: string | null;
};

/** One animal in the picker. `face` is its number, or null for an animal a person had made, which is picked by its address (`src`). */
/** `words` is what the picker's search finds it by, besides its name. */
export type Tile = { face: number | null; src: string; name: string; words: string };
export type Coupon = { id: string; giver: string; text: string; done: number; need: number; earned: boolean; usedAt: string | null; progress: string };
export type Live = { listingId: string; giver: string; text: string; usedAt: string | null };
/**
 * `face` is the animal's number, PHOTO or CUSTOM; `ownPhoto` is the sign-in account's photo, offered as a pick when there is one.
 * `own` is the animal they had made from a photo and are using, `owns` every one they made, `picks` what the picker offers (the admin decides which animals are core and which premium), `asked` whether they have asked to subscribe, `makesLeft` how many more they may make.
 */
/** The school a person is at (`home`), the ones their LinkedIn `profile` unlocked (`added`), and every school Loopd is at (`all`). */
export type Schools = { profile: string | null; home: string | null; added: string[]; all: { slug: string; name: string }[] };
export type Viewer = { first: string; name: string; photo: string | null; face: number; ownPhoto: string | null; own: string | null; owns: string[]; picks: { core: Tile[]; premium: Tile[]; school: Tile[] }; schools: Schools; asked: boolean; makesLeft: number; /** Whether they may wear every school's colours: an Ink+ perk, and the admin's. Without it, Loopd's and their schools' (`schools`). */ anyKit: boolean; level: number; outings: number; admin: boolean; groups: { name: string; href: string }[] };

export type Screen = {
  campus: { slug: string; name: string; tz: string; listSource: string };
  viewer: Viewer | null; tickets: Ticket[]; earning: Coupon[]; live: Live | null;
  /** The tags people on this campus are using, by group, the busiest first: what posting is guided by. Empty for a signed-out visitor. */
  places: NearTag[];
};

import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { db } from '../db';
import type { Principal } from '../emba/access';
import { getSignedInPrincipal } from '../emba/portal-session';
import { isAdmin } from './admin';
import { hasInk } from './ink';
import { findCampus, listCampuses, type Campus } from './listings';
import { addedSchools } from './linkedin';
import { campusOf } from './people';
import { AT_COOKIE, DEFAULT_CAMPUS, schoolOf } from './schools';
import type { Point } from './sections';

/**
 * `kit` is whose colours they see unless they pick others: their school's, or Loopd's own for an email at no school.
 * `visits` is the other campuses of their school, and the campuses of the schools their LinkedIn profile unlocked, by id:
 * places they may look at and join things without moving there.
 */
export type CampusViewer = { principal: Principal; personId: string; admin: boolean; campus: Campus | null; kit: string; /** The colours they may wear: Loopd's, and their schools'. */ kits: string[]; /** Whether they may wear every school's: an Ink perk (Ink+ holds it), and the admin's. */ anyKit: boolean; visits: string[] };

/**
 * Where the person seems to be: the host's own guess from the request (Vercel's location headers), not the browser's
 * location, so nobody is asked anything. It is used once, to place a new person at the nearer campus of their school,
 * and is not kept. Null with no guess: on a developer's machine, or outside a request.
 */
export async function seemsAt(): Promise<Point | null> {
  try {
    const seen = await headers(), lat = seen.get('x-vercel-ip-latitude'), lon = seen.get('x-vercel-ip-longitude');
    return whereFrom(lat, lon);
  } catch { return null; }
}
/** A point from the two header values, or null when either is missing or is not a place on the earth. */
export function whereFrom(lat: string | null, lon: string | null): Point | null {
  if (!lat || !lon) return null;
  const at: Point = [Number(lon), Number(lat)];
  return Number.isFinite(at[0]) && Number.isFinite(at[1]) && Math.abs(at[0]) <= 180 && Math.abs(at[1]) <= 90 ? at : null;
}

/**
 * Who is looking at the campus screen: the signed-in person, whether they are the admin, and the campus they belong
 * to (placed at their school the first time they are seen; someone whose email is at no school is not placed and has
 * no campus). Null when signed out. Checked once per page view; an
 * action is not a page view and checks afresh.
 */
export const campusViewer = cache(async (): Promise<CampusViewer | null> => {
  const principal = await getSignedInPrincipal().catch(() => null);
  if (!principal) return null;
  const school = await campusOf(db(), principal, await seemsAt());
  const admin = isAdmin(principal);
  // What follows waits only on the school: read together, not one after the other.
  const [added, campuses, start, inked] = await Promise.all([school ? addedSchools(db(), principal.personId) : null, school ? listCampuses(db()) : [], !school && admin ? findCampus(db(), DEFAULT_CAMPUS) : null, admin || hasInk(db(), principal.personId)]);
  const theirs = school ? [schoolOf(school.slug), ...added!.added] : [];
  const visits = school ? campuses.filter(each => each.id !== school.id && theirs.includes(schoolOf(each.slug))).map(each => each.id) : [];
  // Loopd is for people at a school: an email at none has no campus. The admin, who may open any, starts at the default one.
  return { principal, personId: principal.personId, admin, campus: school ?? start, kit: school ? schoolOf(school.slug) : 'loop', kits: ['loop', ...theirs], anyKit: inked, visits };
});

/** Whether this viewer may use a campus's screen: it is their own, or another campus of a school they have, or they are the admin, who may open any. */
export const mayUse = (viewer: CampusViewer, campus: { id: string }) => viewer.admin || viewer.campus?.id === campus.id || viewer.visits.includes(campus.id);

/**
 * The campus this browser was last looking at (AT_COOKIE), if the person may use it: for the pages that are not a
 * campus's own, so that "This week" leads back to where they were. A signed-out visitor may look at any. Null with no
 * word of one, or word of a campus that is not theirs to open.
 */
export async function lookingAt(): Promise<Campus | null> {
  let slug: string | undefined;
  try { slug = (await cookies()).get(AT_COOKIE)?.value; } catch { return null; }
  if (!slug || !/^[a-z0-9-]{1,64}$/.test(slug)) return null;
  const [viewer, campus] = [await campusViewer(), await findCampus(db(), slug)];
  return campus && (!viewer || mayUse(viewer, campus)) ? campus : null;
}

/** Where a signed-out visitor is sent to sign in, to come back to `back` afterwards. */
export const signInHref = (back: string) => `/sign-in?redirect_url=${encodeURIComponent(back)}`;

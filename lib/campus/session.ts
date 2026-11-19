import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { db } from '../db';
import type { Principal } from '../emba/access';
import { groupHref, treeOrder } from '../emba/group-path';
import { getPortalPrincipal, getSignedInPrincipal, portalGroupTree } from '../emba/portal-session';
import { isAdmin } from './admin';
import { findCampus, listCampuses, type Campus } from './listings';
import { campusOf } from './people';
import { DEFAULT_CAMPUS, schoolOf } from './schools';
import type { Point } from './sections';

/**
 * `kit` is whose colours they see unless they pick others: their school's, or Loop's own for an email at no school.
 * `visits` is the other campuses of their school, by id: places they may look at and join things without moving there.
 */
export type CampusViewer = { principal: Principal; personId: string; admin: boolean; campus: Campus | null; kit: string; visits: string[] };

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
  const visits = school ? (await listCampuses(db())).filter(each => each.id !== school.id && schoolOf(each.slug) === schoolOf(school.slug)).map(each => each.id) : [];
  const admin = isAdmin(principal);
  // Loop is for people at a school: an email at none has no campus. The admin, who may open any, starts at the default one.
  return { principal, personId: principal.personId, admin, campus: school ?? (admin ? await findCampus(db(), DEFAULT_CAMPUS) : null), kit: school ? schoolOf(school.slug) : 'loop', visits };
});

/** Whether this viewer may use a campus's screen: it is their own, or another campus of their school, or they are the admin, who may open any. */
export const mayUse = (viewer: CampusViewer, campus: { id: string }) => viewer.admin || viewer.campus?.id === campus.id || viewer.visits.includes(campus.id);

/**
 * The person's top-level groups by name, for the top bar: only for someone who can open them (the admin, or a member
 * of a group).
 */
export async function openableGroups(viewer: CampusViewer): Promise<{ name: string; href: string }[]> {
  if (!await getPortalPrincipal().catch(() => null)) return [];
  try {
    return treeOrder(await portalGroupTree(viewer.principal)).filter(group => group.depth === 0).map(group => ({ name: group.orgName, href: groupHref(group) }));
  } catch { return []; }
}

/** Where a signed-out visitor is sent to sign in, to come back to `back` afterwards. */
export const signInHref = (back: string) => `/sign-in?redirect_url=${encodeURIComponent(back)}`;

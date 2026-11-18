import 'server-only';
import { cache } from 'react';
import { db } from '../db';
import type { Principal } from '../emba/access';
import { groupHref, treeOrder } from '../emba/group-path';
import { getSignedInPrincipal, portalGroupTree } from '../emba/portal-session';
import { isAdmin } from './admin';
import { findCampus, type Campus } from './listings';
import { campusOf } from './people';
import { DEFAULT_CAMPUS, frontIsCampus } from './schools';

/** `kit` is whose colours they see unless they pick others: their school's, or Loop's own for an email at no school. */
export type CampusViewer = { principal: Principal; personId: string; admin: boolean; campus: Campus | null; kit: string };

/**
 * Who is looking at the campus screen: the signed-in person, whether they are the admin, and the campus they belong
 * to (placed at their school the first time they are seen; someone whose email is at no school is not placed and is
 * shown the default campus). Null when signed out. Checked once per page view; an
 * action is not a page view and checks afresh.
 */
export const campusViewer = cache(async (): Promise<CampusViewer | null> => {
  const principal = await getSignedInPrincipal().catch(() => null);
  if (!principal) return null;
  const school = await campusOf(db(), principal);
  return { principal, personId: principal.personId, admin: isAdmin(principal), campus: school ?? await findCampus(db(), DEFAULT_CAMPUS), kit: school?.slug ?? 'loop' };
});

/** Whether this viewer may use a campus's screen: it is their own school's, or they are the admin, who may open any. */
export const mayUse = (viewer: CampusViewer, campus: { id: string }) => viewer.admin || viewer.campus?.id === campus.id;

/**
 * The person's top-level groups by name, for the top bar: only for someone who can open them. With the campus screen
 * as the front door that is the admin alone (design D17).
 */
export async function openableGroups(viewer: CampusViewer): Promise<{ name: string; href: string }[]> {
  if (frontIsCampus() && !viewer.admin) return [];
  try {
    return treeOrder(await portalGroupTree(viewer.principal)).filter(group => group.depth === 0).map(group => ({ name: group.orgName, href: groupHref(group) }));
  } catch { return []; }
}

/** Where a signed-out visitor is sent to sign in, to come back to `back` afterwards. */
export const signInHref = (back: string) => `/sign-in?redirect_url=${encodeURIComponent(back)}`;

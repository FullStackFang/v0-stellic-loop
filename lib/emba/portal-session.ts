import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { Principal } from './access';
import {db} from '../db';
import {isAdmin} from '../campus/admin';
import {frontIsCampus} from '../campus/schools';
import {clerkPortalConfigured,getClerkPortalPrincipal} from './clerk-identity';
import {ROOT_SLUG,placeGroup,type GroupRoute} from './group-path';
import {listGroupTree} from './group-tree';
import {addressedScope} from './groups';

const fixture = new AsyncLocalStorage<Principal>();

// Never fall back to legacy cookies, request identities, or assistant tokens.
// One page view asks who is signed in from its layout and its page: within a render the session is checked once.
// An action is not a render, so every action checks afresh.
export const getSignedInPrincipal = cache(async (): Promise<Principal | null> => {
  if(process.env.NODE_ENV==='test') return fixture.getStore()??null;
  return clerkPortalConfigured()?getClerkPortalPrincipal(db()):null;
});

/**
 * Who is signed in, for the groups site: its pages, its layout and every one of its actions ask here. With
 * LOOP_FRONT=campus the groups site is open to the admin alone, so anyone else is no one to it, whatever page or
 * action they reached and however they reached it. The campus screen asks getSignedInPrincipal instead.
 */
export const getPortalPrincipal = cache(async (): Promise<Principal | null> => {
  const principal = await getSignedInPrincipal();
  return principal && frontIsCampus() && !isAdmin(principal) ? null : principal;
});

/** The signed-in person's groups, read once per page view however many of its parts (the side menu, the page) ask. */
export const portalGroupTree = cache((principal: Principal) => listGroupTree(db(), principal));

/**
 * A group page's group and its reads. The reads start as soon as the address says which group is meant, beside the
 * listing of the person's groups and not after it: the page waits for the slower of the two, not for their sum.
 * The listing still decides whether there is a page. Each read checks the person's access itself, so for a group
 * that is closed to them every read is refused, and what a read returned is dropped unless the listing holds the group.
 */
export async function openGroup<T>(principal: Principal, route: GroupRoute, reads: (scope: { orgId: string; loopId: string }) => Promise<T>) {
  const tree = portalGroupTree(principal);
  // Awaited below; a failure in the meantime must not count as unhandled.
  tree.catch(() => {});
  const scope = await addressedScope(db(), route.namespace, route.slug ?? ROOT_SLUG);
  if (!scope) {
    const group = placeGroup(await tree, route);
    return group ? { group, scope: { orgId: group.orgId, loopId: group.loopId }, data: await reads({ orgId: group.orgId, loopId: group.loopId }) } : null;
  }
  const [groups, data] = await Promise.all([tree, reads(scope)]);
  const group = placeGroup(groups, route);
  return group && group.orgId === scope.orgId && group.loopId === scope.loopId ? { group, scope, data } : null;
}

export function withPortalTestSession<T>(principal: Principal, run: () => T): T {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test sessions are disabled');
  return fixture.run(principal, run);
}

/**
 * For a groups page that shows something before sign-in (a share link, an emailed answer link). With LOOP_FRONT=campus
 * those are closed with the rest of the groups site: anyone but the admin is sent to the front door. The proxy does
 * this first; this is the same check where the page is rendered.
 */
export async function closedUnlessAdmin(): Promise<void> {
  if (await closedToCaller()) redirect('/');
}
/** The same question for an action that needs no sign-in (a link's own form): is the groups site closed to whoever is calling? */
export const closedToCaller = async (): Promise<boolean> => frontIsCampus() && !await getPortalPrincipal();

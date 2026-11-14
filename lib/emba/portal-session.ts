import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { cache } from 'react';
import type { Principal } from './access';
import {db} from '../db';
import {clerkPortalConfigured,getClerkPortalPrincipal} from './clerk-identity';
import {ROOT_SLUG,placeGroup,type GroupRoute} from './group-path';
import {listGroupTree} from './group-tree';
import {addressedScope} from './groups';

const fixture = new AsyncLocalStorage<Principal>();

// Never fall back to legacy cookies, request identities, or assistant tokens.
// One page view asks who is signed in from its layout and its page: within a render the session is checked once.
// An action is not a render, so every action checks afresh.
export const getPortalPrincipal = cache(async (): Promise<Principal | null> => {
  if(process.env.NODE_ENV==='test') return fixture.getStore()??null;
  return clerkPortalConfigured()?getClerkPortalPrincipal(db()):null;
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

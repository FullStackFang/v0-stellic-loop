import type { Principal } from '@/lib/emba/access';
import { groupHandle, treeOrder } from '@/lib/emba/group-path';
import { portalGroupTree } from '@/lib/emba/portal-session';

/** A group in the top bar, in tree order: `depth` is how many groups it sits inside that the person can open. */
export type BarGroup = { id: string; parent: string | null; namespace: string; slug: string; name: string; handle: string; depth: number };

/** The groups the top bar names for a signed-in person. A failure here must not take the page down: each page reports its own access. */
export async function barGroups(principal: Principal): Promise<BarGroup[]> {
  try {
    return treeOrder(await portalGroupTree(principal)).map(group => ({ id: group.loopId, parent: group.parentLoopId, namespace: group.namespace, slug: group.slug, name: group.orgName, handle: groupHandle(group), depth: group.depth }));
  } catch { return []; }
}

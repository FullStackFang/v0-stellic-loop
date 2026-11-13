// Where a group lives on the site. A top-level group is /groups/<namespace>; a group inside a group is
// /groups/<namespace>/in/<slug>, whatever its depth, because its handle is @namespace/slug whatever its depth.
type Addressed = { namespace: string; slug: string; loopPath?: string };

/** Every root's address slug. */
export const ROOT_SLUG = 'workspace';
export const groupPath = (namespace: string, slug?: string | null) => slug && slug !== ROOT_SLUG ? `/groups/${namespace}/in/${slug}` : `/groups/${namespace}`;
export const groupHref = (group: Addressed) => groupPath(group.namespace, group.slug);
/** The handle people write: @namespace for a top-level group, @namespace/slug for a group inside one. */
export const groupHandle = (group: Addressed) => group.slug === ROOT_SLUG ? `@${group.namespace}` : `@${group.namespace}/${group.slug}`;
/** Matches the group a page's route names. */
export const isGroup = (params: { namespace: string; slug?: string }) => (group: Addressed) => group.namespace === params.namespace && group.slug === (params.slug ?? ROOT_SLUG);
/** The route parameters of a group page: /groups/[namespace] or /groups/[namespace]/in/[slug]. */
export type GroupRoute = { namespace: string; slug?: string };

type Node = { loopId: string; parentLoopId: string | null; orgName: string };
/** Groups in tree order: each group followed by the groups inside it, with how deep it sits. */
export function treeOrder<T extends Node>(groups: T[]): (T & { depth: number })[] {
  const out: (T & { depth: number })[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const group of groups.filter(item => item.parentLoopId === parent).sort((a, b) => a.orgName.localeCompare(b.orgName, 'en', { numeric: true }))) {
      out.push({ ...group, depth });
      walk(group.loopId, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
/** From the highest group the person can open down to the group itself. */
export function pathTo<T extends Node>(groups: T[], loopId: string): T[] {
  const chain: T[] = [];
  for (let at = groups.find(item => item.loopId === loopId); at; at = groups.find(item => item.loopId === at!.parentLoopId)) chain.unshift(at);
  return chain;
}
/** The group a route names, with the way down to it (`trail`) and the groups directly inside it. Undefined when the person cannot open it. */
export function placeGroup<T extends Node & Addressed>(tree: T[], route: GroupRoute) {
  const group = tree.find(isGroup(route));
  return group && { ...group, trail: pathTo(tree, group.loopId), inside: treeOrder(tree.filter(item => item.parentLoopId === group.loopId).map(item => ({ ...item, parentLoopId: null }))) };
}

import Link from 'next/link';
import { db } from '@/lib/db';
import { groupHandle, treeOrder } from '@/lib/emba/group-path';
import { listGroupTree } from '@/lib/emba/group-tree';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { Crumbs } from '../group-nav';
import { StartForm } from './start-form';

export const dynamic = 'force-dynamic';

export default async function NewGroupPage({ searchParams }: { searchParams?: Promise<{ in?: string | string[] }> }) {
  const principal = await getPortalPrincipal();
  if (!principal) return <section className="lt-editor"><h1>Start a group</h1><Link href={`/groups/sign-in?redirect_url=${encodeURIComponent('/groups/new')}`}>Sign in</Link></section>;
  const tree = await listGroupTree(db(), principal).catch(() => null);
  if (!tree) return <section className="lt-editor"><h1>Start a group</h1><p role="alert">Your access may have changed. Reload to try again.</p></section>;
  // The same rule createWorkspace applies: a top-level group is for pilot owners with a verified email.
  const canTop = !!principal.verifiedEmail && (process.env.LOOP_PILOT_OWNER_SUBJECTS ?? '').split(',').some(subject => subject.trim() === principal.subject);
  if (!canTop && !tree.some(group => group.canStart)) return <>
    <Crumbs trail={[]} here="New group" />
    <section className="lt-editor"><h1>Start a group</h1><p>Groups are started by the people who run them. Ask an organizer of your group to start one inside it, or to make you an organizer.</p><Link href="/groups">Back to your groups</Link></section>
  </>;
  const asked = (await searchParams)?.in;
  const nodes = treeOrder(tree).map(group => ({ id: group.loopId, parent: group.parentLoopId, name: group.orgName, handle: groupHandle(group), namespace: group.namespace, canStart: group.canStart }));
  const initial = nodes.find(node => node.handle === asked && node.canStart)?.id ?? (canTop ? null : nodes.find(node => node.canStart)!.id);
  return <>
    <Crumbs trail={[]} here="New group" />
    <StartForm tree={nodes} canTop={canTop} initialParent={initial} />
  </>;
}

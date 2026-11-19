import Link from 'next/link';
import { db } from '@/lib/db';
import { groupPath, type GroupRoute } from '@/lib/emba/group-path';
import { Crumbs, GroupHead } from '@/app/groups/group-nav';
import { getPortalPrincipal, openGroup } from '@/lib/emba/portal-session';
import { joinLinkMode, listMembershipRequests } from '@/lib/emba/access-requests';
import { listScopedRoles } from '@/lib/emba/roles';
import { groupTile } from '@/lib/emba/group-picture';
import { addMember } from '../../actions';
import { replaceRequestLink, reviewRequest, setJoinLink } from '../../request-actions';
import { AddPerson, JoinLink, WaitingList, type Waiting } from '../members-panel';

export const dynamic = 'force-dynamic';
// Drawing a group's picture, from the card on the group's tile, can take a minute.
export const maxDuration = 120;

/** How people come into a group: added by an owner or organizer, through the join link, or by asking. For owners and organizers only. */
export default async function AddPeoplePage({ params }: { params: Promise<GroupRoute> }) {
  const principal = await getPortalPrincipal(), route = await params, base = groupPath(route.namespace, route.slug);
  if (!principal) return <section className="lt-editor"><h1>Group unavailable</h1><Link href={`/groups/sign-in?redirect_url=${encodeURIComponent(`${base}/add`)}`}>Sign in</Link></section>;
  const opened = await openGroup(principal, route, async scope => {
    // Listing the roles is refused to anyone who does not manage the group, and so is this page.
    const roles = await listScopedRoles(db(), principal, scope.orgId, scope.loopId);
    const [requests, joinMode] = await Promise.all([listMembershipRequests(db(), principal, scope), joinLinkMode(db(), principal, scope).catch(() => null)]);
    return { roles, requests, joinMode, tile: await groupTile(db(), principal, scope) };
  }).catch(() => null);
  if (!opened) return <section className="lt-editor"><h1>Group unavailable</h1><p role="alert">This page is for the owners and organizers of the group.</p><Link href={base}>Back to members</Link></section>;
  const { group, scope, data: { roles, requests, joinMode, tile } } = opened;
  const owner = roles.find(role => role.personId === principal.personId)?.effectiveRoles.includes('owner') ?? false;
  const waiting: Waiting[] = requests.map(request => ({ key: `r-${request.personId}`, personId: request.personId, name: request.name, at: new Date(request.requestedAt).toISOString() }));
  return <div className="gt gt-people">
    {group.trail.length > 1 && <Crumbs trail={group.trail} here="Add people" />}
    <GroupHead group={group} base={base} here="add" people={roles.length} canAdd asking={waiting.length} tile={tile} />
    <div className="lp-mb-add">
      <AddPerson scope={scope} isOwner={owner} actions={{ add: addMember }} />
      {owner && <JoinLink scope={scope} mode={joinMode ?? 'off'} actions={{ setLink: setJoinLink, replaceLink: replaceRequestLink }} />}
      <WaitingList scope={scope} waiting={waiting} actions={{ review: reviewRequest }} />
    </div>
  </div>;
}

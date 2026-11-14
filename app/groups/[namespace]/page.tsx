import Link from 'next/link';
import { db } from '@/lib/db';
import { ROOT_SLUG, groupHandle, groupPath, type GroupRoute } from '@/lib/emba/group-path';
import { Crumbs } from '@/app/groups/group-nav';
import { getPortalPrincipal, openGroup } from '@/lib/emba/portal-session';
import { listInvitations } from '@/lib/emba/invitations';
import { joinLinkMode, listMembershipRequests } from '@/lib/emba/access-requests';
import { listOrganizationMembers, listScopedRoles } from '@/lib/emba/roles';
import { Rings } from '@/components/LoopGlyphs';
import { grantScopedRole, removeOrgMembership, revokeScopedRole } from '@/app/emba/role-actions';
import { cancelInvite, inviteMember, saveTagHandle } from '../actions';
import { getMemberHandle, listMemberHandles } from '@/lib/emba/tags';
import { replaceRequestLink, reviewRequest, setJoinLink } from '../request-actions';
import { Invite, JoinLink, Roster, WaitingList, type RoleName, type RosterPerson, type Waiting } from './members-panel';

export const dynamic = 'force-dynamic';
const RANK: RoleName[] = ['owner', 'organizer', 'member', 'follower'];
async function loadGroup(principal: NonNullable<Awaited<ReturnType<typeof getPortalPrincipal>>>, route: GroupRoute) {
  const opened = await openGroup(principal, route, async scope => {
  // Reads that do not wait on each other start together. What only a manager sees waits for the roles, which say whether this person is one.
  const [roles, tagHandle] = await Promise.all([listScopedRoles(db(), principal, scope.orgId, scope.loopId).catch(() => null), getMemberHandle(db(), principal, scope.orgId)]);
  const owner = roles?.find(role => role.personId === principal.personId)?.effectiveRoles.includes('owner') ?? false;
  const [invitations, requests, joinMode, members, handles] = roles ? await Promise.all([
    listInvitations(db(), principal, scope.orgId, scope.loopId), listMembershipRequests(db(), principal, scope), joinLinkMode(db(), principal, scope).catch(() => null),
    // Removing a person from the whole group is done on the top-level group only: an inner group's owner is not shown its members.
    owner && (route.slug ?? ROOT_SLUG) === ROOT_SLUG ? listOrganizationMembers(db(), principal, scope.orgId, scope.loopId) : null,
    listMemberHandles(db(), principal, scope.orgId, scope.loopId).catch(() => ({} as Record<string, string>))]) : [null, null, null, null, null];
  return { roles, invitations, requests, joinMode, owner, members, tagHandle, handles };
  });
  return opened && { group: opened.group, scope: opened.scope, ...opened.data };
}

export default async function GroupPage({ params }: { params: Promise<GroupRoute> }) {
  const principal = await getPortalPrincipal();
  if (!principal) return <section className="lt-editor"><h1>Group unavailable</h1><Link href={`/groups/sign-in?redirect_url=${encodeURIComponent(`${groupPath((await params).namespace, (await params).slug)}`)}`}>Sign in</Link></section>;
  const route = await params, base = groupPath(route.namespace, route.slug);
  const data = await loadGroup(principal, route).catch(() => null);
  if (!data) return <section className="lt-editor"><h1>Group unavailable</h1><p role="alert">This private group is unavailable or your access changed.</p></section>;
  const { group, scope, roles, invitations, requests, joinMode, owner, members, tagHandle, handles } = data;
  const top = group.slug === ROOT_SLUG;
  const mayRemove = new Set(members?.map(member => member.personId));
  // A person who does not manage the group is shown their own row only: who else is in it stays with the owners and organizers.
  const people: RosterPerson[] = roles
    ? roles.map(role => {
        const shown = RANK.find(name => role.effectiveRoles.includes(name)) ?? 'member', isYou = role.personId === principal.personId;
        const high = shown === 'owner' || shown === 'organizer' || role.directRole === 'owner' || role.directRole === 'organizer';
        const canSetRole = owner || !high;
        return { personId: role.personId, name: role.name, role: shown, handle: isYou ? tagHandle : handles?.[role.personId] ?? null, isYou, canSetRole,
          remove: mayRemove.has(role.personId) ? 'group' as const : !top && role.directRole && canSetRole ? 'role' as const : null };
      }).sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.name.localeCompare(b.name))
    : [{ personId: principal.personId, name: 'You', role: 'member', handle: tagHandle, isYou: true, canSetRole: false, remove: null }];
  const waiting: Waiting[] = [
    ...(requests ?? []).map(request => ({ key: `r-${request.personId}`, kind: 'request' as const, personId: request.personId, name: request.name, at: new Date(request.requestedAt).toISOString() })),
    ...(invitations ?? []).filter(invite => !invite.accepted_at && !invite.revoked_at && new Date(invite.expires_at) > new Date())
      .map(invite => ({ key: `i-${invite.id}`, kind: 'invite' as const, id: invite.id, email: invite.recipient_email, role: invite.role, until: new Date(invite.expires_at).toISOString() }))];
  return <>
      <Crumbs trail={group.trail} here="Members" />
      <header className="lp-mb-head"><span className="lp-mb-tile"><Rings /></span>
        <div><h1>{group.orgName}</h1><p><span className="lp-handle">{groupHandle(group)}</span>{roles && <span>{roles.length} {roles.length === 1 ? 'person' : 'people'}</span>}</p></div>
        <nav className="lp-tabs" aria-label="Group sections"><Link href={`${base}/team`}>Team</Link><Link href={base} aria-current="page">Members</Link><Link href={`${base}/resources`}>Resources</Link><Link href="/groups/connections">Connections</Link></nav>
      </header>
      <div className="lp-mb-grid" data-solo={!roles || undefined}>
        <div>
          <Roster scope={scope} namespace={group.namespace} people={people} isOwner={owner} canLeave={top} actions={{ grant: grantScopedRole, revokeRole: revokeScopedRole, removeFromGroup: removeOrgMembership, saveTag: saveTagHandle }} />
          {!roles && <p className="lp-mb-note">Owners and organizers manage membership. A tag lets teammates mention you in their assistant; it notifies no one and grants no access.{!top && ' To leave this group, ask one of its owners or organizers to remove you.'}</p>}
        </div>
        {roles && <aside className="lp-mb-side">
          {owner && <JoinLink scope={scope} mode={joinMode ?? 'off'} actions={{ setLink: setJoinLink, replaceLink: replaceRequestLink }} />}
          <Invite scope={scope} actions={{ invite: inviteMember }} />
          <WaitingList scope={scope} waiting={waiting} actions={{ review: reviewRequest, cancelInvite }} />
        </aside>}
      </div>
  </>;
}

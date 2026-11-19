import Link from 'next/link';
import { db } from '@/lib/db';
import { ROOT_SLUG, groupPath, type GroupRoute } from '@/lib/emba/group-path';
import { Crumbs, GroupHead } from '@/app/groups/group-nav';
import { getPortalPrincipal, openGroup } from '@/lib/emba/portal-session';
import { listInvitations } from '@/lib/emba/invitations';
import { listMembershipRequests } from '@/lib/emba/access-requests';
import { listOrganizationMembers, listScopedRoles } from '@/lib/emba/roles';
import { grantScopedRole, removeOrgMembership, revokeScopedRole } from '@/app/emba/role-actions';
import { cancelInvite, saveTagHandle } from '../actions';
import { getMemberHandle, listMemberHandles } from '@/lib/emba/tags';
import { clerkEmailsOf } from '@/lib/emba/clerk-identity';
import { CUSTOM, animal, animalOf, customFace } from '@/lib/campus/animals';
import { customFaces } from '@/lib/campus/custom-face';
import { pickedFaces } from '@/lib/campus/people';
import { Roster, type Invited, type RoleName, type RosterPerson } from './members-panel';

export const dynamic = 'force-dynamic';
const RANK: RoleName[] = ['owner', 'organizer', 'member', 'follower'];
async function loadGroup(principal: NonNullable<Awaited<ReturnType<typeof getPortalPrincipal>>>, route: GroupRoute) {
  const opened = await openGroup(principal, route, async scope => {
  // Reads that do not wait on each other start together. What only a manager sees waits for the roles, which say whether this person is one.
  const [roles, tagHandle] = await Promise.all([listScopedRoles(db(), principal, scope.orgId, scope.loopId).catch(() => null), getMemberHandle(db(), principal, scope.orgId)]);
  const owner = roles?.find(role => role.personId === principal.personId)?.effectiveRoles.includes('owner') ?? false;
  const [invitations, requests, members, handles, emails] = roles ? await Promise.all([
    listInvitations(db(), principal, scope.orgId, scope.loopId), listMembershipRequests(db(), principal, scope),
    // Removing a person from the whole group is done on the top-level group only: an inner group's owner is not shown its members.
    owner && (route.slug ?? ROOT_SLUG) === ROOT_SLUG ? listOrganizationMembers(db(), principal, scope.orgId, scope.loopId) : null,
    listMemberHandles(db(), principal, scope.orgId, scope.loopId).catch(() => ({} as Record<string, string>)),
    // Listing the roles succeeded, so this person is an owner or organizer here: they see each person's sign-in address, to tell people apart.
    clerkEmailsOf(db(), roles.map(role => role.personId)).catch(() => ({} as Record<string, string>))]) : [null, null, null, null, null];
  // Each person's face is the animal they picked on the campus screen, or the one their id gives them.
  const picks = await pickedFaces(db(), (roles ?? []).map(role => role.personId).concat(principal.personId)).catch(() => new Map<string, number>());
  const made = await customFaces(db(), [...picks].filter(([, pick]) => pick === CUSTOM).map(([id]) => id)).catch(() => new Map<string, { token: string | null }>());
  return { roles, invitations, requests, owner, members, tagHandle, handles, emails, picks, made };
  });
  return opened && { group: opened.group, scope: opened.scope, ...opened.data };
}

export default async function GroupPage({ params }: { params: Promise<GroupRoute> }) {
  const principal = await getPortalPrincipal();
  if (!principal) return <section className="lt-editor"><h1>Group unavailable</h1><Link href={`/groups/sign-in?redirect_url=${encodeURIComponent(`${groupPath((await params).namespace, (await params).slug)}`)}`}>Sign in</Link></section>;
  const route = await params, base = groupPath(route.namespace, route.slug);
  const data = await loadGroup(principal, route).catch(() => null);
  if (!data) return <section className="lt-editor"><h1>Group unavailable</h1><p role="alert">This private group is unavailable or your access changed.</p></section>;
  const { group, scope, roles, invitations, requests, owner, members, tagHandle, handles, emails, picks, made } = data;
  const faceOf = (id: string) => { const pick = picks.get(id), own = made.get(id)?.token; return pick === CUSTOM && own ? customFace(own) : animal(pick === undefined || pick < 0 ? animalOf(id) : pick); };
  const top = group.slug === ROOT_SLUG;
  const mayRemove = new Set(members?.map(member => member.personId));
  // A person who does not manage the group is shown their own row only: who else is in it stays with the owners and organizers.
  const people: RosterPerson[] = roles
    ? roles.map(role => {
        const shown = RANK.find(name => role.effectiveRoles.includes(name)) ?? 'member', isYou = role.personId === principal.personId;
        const high = shown === 'owner' || shown === 'organizer' || role.directRole === 'owner' || role.directRole === 'organizer';
        const canSetRole = owner || !high;
        return { personId: role.personId, face: faceOf(role.personId), name: role.name, email: emails?.[role.personId] ?? null, role: shown, handle: isYou ? tagHandle : handles?.[role.personId] ?? null, isYou, canSetRole,
          remove: mayRemove.has(role.personId) ? 'group' as const : !top && role.directRole && canSetRole ? 'role' as const : null };
      }).sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.name.localeCompare(b.name))
    : [{ personId: principal.personId, face: faceOf(principal.personId), name: 'You', email: null, role: 'member', handle: tagHandle, isYou: true, canSetRole: false, remove: null }];
  const invited: Invited[] = (invitations ?? []).filter(invite => !invite.accepted_at && !invite.revoked_at && new Date(invite.expires_at) > new Date())
    .map(invite => ({ id: invite.id, email: invite.recipient_email, name: invite.recipient_name, role: invite.role, until: new Date(invite.expires_at).toISOString() }))
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
  return <div className="gt gt-people">
      {group.trail.length > 1 && <Crumbs trail={group.trail} here="Members" />}
      <GroupHead group={group} base={base} here="members" people={roles ? roles.length : null} canAdd={Boolean(roles)} asking={requests?.length ?? 0} />
      {/* The list is the page. Adding people, the join link and the people asking to join are on Add people. */}
      <div className="lp-mb-grid" data-solo={!roles || undefined} data-wide={Boolean(roles) || undefined}>
        <div>
          <Roster scope={scope} namespace={group.namespace} people={people} invited={invited} isOwner={owner} canLeave={top} actions={{ grant: grantScopedRole, revokeRole: revokeScopedRole, removeFromGroup: removeOrgMembership, saveTag: saveTagHandle, cancelInvite }} />
          {!roles && <p className="lp-mb-note">Owners and organizers manage membership. A tag lets teammates mention you in their assistant; it notifies no one and grants no access.{!top && ' To leave this group, ask one of its owners or organizers to remove you.'}</p>}
        </div>
      </div>
  </div>;
}

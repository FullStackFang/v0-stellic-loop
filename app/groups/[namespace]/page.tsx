import Link from 'next/link';
import { db } from '@/lib/db';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { listPortalGroups } from '@/lib/emba/groups';
import { listInvitations } from '@/lib/emba/invitations';
import { joinLinkMode, listMembershipRequests } from '@/lib/emba/access-requests';
import { listDocuments } from '@/lib/emba/knowledge';
import { listOrganizationMembers, listScopedRoles } from '@/lib/emba/roles';
import { ActionForm, InvitationForm } from '@/components/emba/portal-forms';
import { RolesPanel } from '@/components/emba/RolesPanel';
import { grantScopedRole, removeOrgMembership, revokeScopedRole } from '@/app/emba/role-actions';
import { cancelInvite, inviteMember, saveTagHandle } from '../actions';
import { getMemberHandle } from '@/lib/emba/tags';
import { disableRequestLink, enableRequestLink, replaceRequestLink, reviewRequest, setRequestLinkMode } from '../request-actions';

export const dynamic = 'force-dynamic';
async function loadGroup(principal: NonNullable<Awaited<ReturnType<typeof getPortalPrincipal>>>, namespace: string) {
  const group = (await listPortalGroups(db(), principal)).find(item => item.namespace === namespace && item.slug === 'workspace');
  if (!group) return null;
  const scope = { orgId: group.orgId, loopId: group.loopId };
  const documents = await listDocuments(db(), principal, scope);
  const roles = await listScopedRoles(db(), principal, group.orgId, group.loopId).catch(() => null);
  const invitations = roles ? await listInvitations(db(), principal, group.orgId, group.loopId) : null;
  const requests = roles ? await listMembershipRequests(db(), principal, scope) : null;
  const joinMode = roles ? await joinLinkMode(db(), principal, scope).catch(() => null) : null;
  const owner = roles?.find(role => role.personId === principal.personId)?.effectiveRoles.includes('owner') ?? false;
  const members = owner ? await listOrganizationMembers(db(), principal, group.orgId, group.loopId) : null;
  const tagHandle = await getMemberHandle(db(), principal, group.orgId);
  return { group, scope, documents, roles, invitations, requests, joinMode, owner, members, tagHandle };
}

export default async function GroupPage({ params }: { params: Promise<{ namespace: string }> }) {
  const principal = await getPortalPrincipal();
  if (!principal) return <section className="lt-editor"><h1>Group unavailable</h1><Link href={`/groups/sign-in?redirect_url=${encodeURIComponent(`/groups/${(await params).namespace}`)}`}>Sign in</Link></section>;
  const { namespace } = await params;
  const data = await loadGroup(principal, namespace).catch(() => null);
  if (!data) return <section className="lt-editor"><h1>Group unavailable</h1><p role="alert">This private group is unavailable or your access changed.</p></section>;
  const { group, scope, documents, roles, invitations, requests, joinMode, owner, members, tagHandle } = data;
  return <>
      <p><Link href="/groups">Groups</Link> / {group.handle}</p><h1>{group.orgName}</h1><p>Private workspace resources are searchable text. Original uploaded files are not hosted here.</p>
      <nav aria-label="Group sections"><Link href={`/groups/${namespace}/team`}>Team</Link> · <a href="#resources">Resources</a> · <a href="#invitations">Invitations</a> · <a href="#roles">Members</a> · <Link href="/groups/connections">Connections</Link></nav>
      <section className="lt-editor" id="resources"><h2>Resources</h2>{documents.length ? <ul>{documents.map(doc => <li key={doc.id}><Link href={`/groups/${namespace}/resources/${doc.id}?version=${doc.version}`}>{doc.title}</Link> · {doc.state} · version {doc.version}{doc.failedStage && ` (${doc.failedStage} failed)`}</li>)}</ul> : <p>No resources yet.</p>}<p><Link href={`/groups/${namespace}/resources`}>Manage resources</Link></p></section>
      <section className="lt-editor" id="invitations"><h2>Invite members</h2>{roles ? <><InvitationForm action={inviteMember} {...scope} /><ul>{invitations?.map(invite => <li key={invite.id}>{invite.recipient_email} · {invite.role} · {invite.accepted_at ? 'Accepted' : invite.revoked_at ? 'Revoked' : 'Pending'}{!invite.accepted_at && !invite.revoked_at && <ActionForm action={cancelInvite} label="Revoke"><input type="hidden" name="id" value={invite.id}/></ActionForm>}</li>)}</ul></> : <p>Only owners and organizers can invite people.</p>}</section>
      {roles && <section className="lt-editor"><h2>Access requests</h2>{owner && <><p>Enable a separate unguessable link only when you want people to request membership. The link shows the name, description, and public label above; while it asks first, it never grants access by itself.</p><ActionForm action={enableRequestLink} label="Enable or rotate link"><input type="hidden" name="orgId" value={group.orgId}/><input type="hidden" name="loopId" value={group.loopId}/><label>Public label<input name="publicLabel" maxLength={120}/></label></ActionForm><ActionForm action={disableRequestLink} label="Disable link"><input type="hidden" name="orgId" value={group.orgId}/><input type="hidden" name="loopId" value={group.loopId}/></ActionForm></>}{joinMode && <><p>{joinMode === 'admit' ? 'The link admits on sign-in: a signed-in person who opens it and confirms becomes a member at once, with no approval. Share it only where you would welcome everyone who sees it.' : 'The link asks first: each person who opens it sends a request, and you approve or decline it below.'}</p><ActionForm action={setRequestLinkMode} label={joinMode === 'admit' ? 'Ask first again' : 'Admit on sign-in'}><input type="hidden" name="orgId" value={group.orgId}/><input type="hidden" name="loopId" value={group.loopId}/><input type="hidden" name="mode" value={joinMode === 'admit' ? 'ask_first' : 'admit'}/></ActionForm><p>Replacing the link stops the old one at once. People already in the group stay.</p><ActionForm action={replaceRequestLink} label="Replace link"><input type="hidden" name="orgId" value={group.orgId}/><input type="hidden" name="loopId" value={group.loopId}/></ActionForm></>}{requests?.length ?<ul>{requests.map(request => <li key={request.personId}>{request.name} · requested {request.requestedAt}<ActionForm action={reviewRequest} label="Approve as member"><input type="hidden" name="orgId" value={group.orgId}/><input type="hidden" name="loopId" value={group.loopId}/><input type="hidden" name="personId" value={request.personId}/><input type="hidden" name="decision" value="approve"/></ActionForm><ActionForm action={reviewRequest} label="Decline"><input type="hidden" name="orgId" value={group.orgId}/><input type="hidden" name="loopId" value={group.loopId}/><input type="hidden" name="personId" value={request.personId}/><input type="hidden" name="decision" value="decline"/></ActionForm></li>)}</ul> : <p>No pending requests.</p>}</section>}
      <section className="lt-editor" id="tag"><h2>Your @ tag</h2><p>{tagHandle ? <>Teammates can tag you as <strong>@{group.namespace}/{tagHandle}</strong> in their assistant.</> : 'Choose a tag so teammates can mention you in their assistant. Until you do, you cannot be tagged.'} A tag notifies no one and grants no access. Leave it empty to remove it.</p><ActionForm action={saveTagHandle} label="Save tag"><input type="hidden" name="orgId" value={group.orgId}/><label>Tag<input name="handle" defaultValue={tagHandle ?? ''} maxLength={48} pattern="@?[A-Za-z0-9][A-Za-z0-9-]{1,47}" placeholder="maya"/></label></ActionForm></section>
      {roles && <RolesPanel{...scope} personId={principal.personId} roles={roles} organizationMembers={members} grantAction={grantScopedRole} revokeAction={revokeScopedRole} removeAction={removeOrgMembership}/>}
      {!roles && <section id="roles" className="lt-editor"><h2>Members</h2><p>Owners and organizers manage membership.</p><ActionForm action={removeOrgMembership} label="Leave group"><input type="hidden" name="orgId" value={group.orgId}/><input type="hidden" name="personId" value={principal.personId}/></ActionForm></section>}
  </>;
}

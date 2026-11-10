import type { OrganizationMember, ScopedRole } from '@/lib/emba/roles';
import { ActionForm } from './portal-forms';
import type { PortalAction } from './portal-types';

export function RolesPanel({ orgId, loopId, personId, roles, organizationMembers, grantAction, revokeAction, removeAction }: { orgId: string; loopId: string; personId: string; roles: ScopedRole[]; organizationMembers: OrganizationMember[] | null; grantAction: PortalAction; revokeAction: PortalAction; removeAction: PortalAction }) {
  const actor = roles.find(role => role.personId === personId);
  const owner = actor?.effectiveRoles.includes('owner') ?? false;
  const direct = roles.filter(role => role.directRole && (owner || (role.directRole !== 'owner' && role.directRole !== 'organizer')));
  const grantCandidates = roles.filter(role => owner || (role.directRole !== 'owner' && role.directRole !== 'organizer'));
  return <section className="lt-editor" id="roles"><h2>Membership administration</h2><p>Manage roles in this trip context. Parent roles continue to apply to child trips. Changes use current access and may affect activity commitments.</p>
    <ul>{roles.map(role => <li key={role.personId}>{role.name} — {role.effectiveRoles.join(', ')}{role.directRole ? ` (direct: ${role.directRole})` : ' (inherited)'}</li>)}</ul>
    {roles.length === 0 && <p>No current members in this context.</p>}
    {grantCandidates.length > 0 && <ActionForm action={grantAction} label="Set direct role"><input type="hidden" name="orgId" value={orgId}/><input type="hidden" name="loopId" value={loopId}/>
      <label>Member<select name="personId" required>{grantCandidates.map(role => <option key={role.personId} value={role.personId}>{role.name}</option>)}</select></label>
      <label>Role<select name="role"><option value="member">Member</option><option value="follower">Follower</option>{owner && <><option value="organizer">Organizer</option><option value="owner">Owner</option></>}</select></label>
    </ActionForm>}
    {direct.length > 0 && <ActionForm action={revokeAction} label="Revoke direct role"><input type="hidden" name="orgId" value={orgId}/><input type="hidden" name="loopId" value={loopId}/>
      <label>Direct role<select name="personId" required>{direct.map(role => <option key={role.personId} value={role.personId}>{role.name} — {role.directRole}</option>)}</select></label>
    </ActionForm>}
    {organizationMembers && organizationMembers.length > 0 && <ActionForm action={removeAction} label="Remove member from organization"><input type="hidden" name="orgId" value={orgId}/>
      <label>Member<select name="personId" required>{organizationMembers.map(member => <option key={member.personId} value={member.personId}>{member.name}</option>)}</select></label>
    </ActionForm>}
    <ActionForm action={removeAction} label="Leave organization"><input type="hidden" name="orgId" value={orgId}/><input type="hidden" name="personId" value={personId}/><p>Leaving removes your access to this organization. The last root owner cannot leave until another owner is assigned.</p></ActionForm>
  </section>;
}

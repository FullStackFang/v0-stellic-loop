import { ActionForm } from './portal-forms';
import type { PortalAction } from './portal-types';

export function InvitationAcceptance({action}:{action:PortalAction}) {
  return <ActionForm action={action} label="Accept invitation"><label>Private invitation token<input name="token" required autoComplete="off" /></label><p>Only the signed-in member with the verified recipient email can accept. Expired or revoked invitations cannot be used.</p></ActionForm>;
}

export function InvitationRevoke({action,id}:{action:PortalAction;id:string}) {
  return <ActionForm action={action} label="Revoke invitation"><input type="hidden" name="id" value={id} /></ActionForm>;
}

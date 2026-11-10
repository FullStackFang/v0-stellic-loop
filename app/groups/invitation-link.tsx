'use client';

import { ActionForm } from '@/components/emba/portal-forms';
import { acceptInvite } from './actions';
import { useFragmentToken } from './fragment-token';

export function InvitationLink() {
  const token = useFragmentToken('invite');
  return token && <ActionForm action={acceptInvite} label="Accept invitation"><input type="hidden" name="token" value={token}/><p>Only the recipient with the matching verified email can accept.</p></ActionForm>;
}

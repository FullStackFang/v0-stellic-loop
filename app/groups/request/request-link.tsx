'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ActionForm } from '@/components/emba/portal-forms';
import { ReachAtJoin } from '@/components/emba/reach-control';
import { previewAccessRequest, submitMembershipRequest } from '../request-actions';
import { useFragmentToken } from '../fragment-token';

type Preview = Awaited<ReturnType<typeof previewAccessRequest>>;
export function AccessRequestLink({ signedIn, signInAvailable, email }: { signedIn: boolean; signInAvailable: boolean; email: string | null }) {
  const token = useFragmentToken('token');
  const [preview, setPreview] = useState<Preview>(null);
  useEffect(() => {
    let current = true;
    if (token) void previewAccessRequest(token).then(value => { if (current) setPreview(value); });
    return () => { current = false; };
  }, [token]);
  if (!token || !preview) return <p role="status">This link is unavailable or has been disabled.</p>;
  return <><h2>{preview.groupName}</h2><p>{preview.description}</p><p>{preview.publicLabel}</p>{signedIn ? <ActionForm action={submitMembershipRequest} label={preview.joinMode === 'admit' ? 'Join group' : 'Request membership'}><input type="hidden" name="token" value={token}/><ReachAtJoin email={email} /></ActionForm> : signInAvailable ? <p>Sign in to submit a request. <Link href="/groups/sign-in">Sign in</Link>, then return to this link.</p> : <p>Sign-in is not configured for this deployment.</p>}</>;
}

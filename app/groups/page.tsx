import Link from 'next/link';
import { db } from '@/lib/db';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { listPortalGroups } from '@/lib/emba/groups';
import { listReceivedInvitations } from '@/lib/emba/invitations';
import { ActionForm } from '@/components/emba/portal-forms';
import { acceptInvite, createGroup, declineInvite } from './actions';
import { InvitationLink } from './invitation-link';

export const dynamic = 'force-dynamic';
export default async function GroupsPage() {
  const principal = await getPortalPrincipal();
  if (!principal) return <section className="lt-editor"><h1>Private groups</h1><p>Sign in to see your groups and invitations.</p>{clerkPortalConfigured() ? <Link className="lt-primary" href="/emba/sign-in">Sign in</Link> : <p role="status">Sign-in is not configured for this deployment.</p>}</section>;
  let groups, invitations;
  try {
    [groups, invitations] = await Promise.all([listPortalGroups(db(), principal), listReceivedInvitations(db(), principal)]);
  } catch {
    return <section className="lt-editor"><h1>Groups unavailable</h1><p role="alert">Your access may have changed. Reload to try again.</p></section>;
  }
  const ownerAllowed = !!principal.verifiedEmail && (process.env.LOOP_PILOT_OWNER_SUBJECTS ?? '').split(',').some(subject => subject.trim() === principal.subject);
  return <>
    <h1>Your groups</h1><p>Share resources with the people you invite. Each assistant needs its own group access grant.</p>
    <section className="lt-editor"><h2>Workspaces</h2>{groups.length ? <ul>{groups.map(group => <li key={group.loopId}><Link href={`/groups/${group.namespace}`}>{group.orgName}</Link> <span className="emba-meta">{group.handle}</span></li>)}</ul> : <p>You have no groups yet.</p>}
      {ownerAllowed && <details><summary>Create a private group</summary><ActionForm action={createGroup} label="Create group"><label>Name<input name="name" required maxLength={200} /></label><label>Stable handle<input name="namespace" required pattern="[a-z0-9][a-z0-9-]{1,47}" maxLength={48} /></label><label>Description<textarea name="description" maxLength={1000} /></label><p>Creation gives you ownership of a new private workspace. The handle does not claim institutional affiliation.</p></ActionForm></details>}
    </section>
    <section className="lt-editor"><h2>Invitations</h2>{invitations.length ? <ul>{invitations.map(invite => <li key={invite.id}><strong>{invite.groupName}</strong> · {invite.role} · Expires {invite.expiresAt}<ActionForm action={acceptInvite} label="Accept"><input type="hidden" name="id" value={invite.id}/></ActionForm><ActionForm action={declineInvite} label="Decline"><input type="hidden" name="id" value={invite.id}/></ActionForm></li>)}</ul> : <p>No pending invitations for your verified email.</p>}
      <InvitationLink />
    </section>
  </>;
}

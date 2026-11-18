import 'server-only';
import type { Db } from '../db';
import { authenticate, type Principal } from './access';
import { clerkAccountFor, clerkIssuer, clerkPortalConfigured, enrolClerkAccount } from './clerk-identity';
import { acceptInvitationById, issueInvitation, revokeInvitation } from './invitations';
import { cleanName } from './member-name';

export type AddMemberInput = { orgId: string; loopId: string; email: string; name?: string | null; role: 'owner' | 'organizer' | 'member' | 'follower' };

/**
 * Adds a person to a group at once, by their address: no invitation for them to find and accept. They are in the
 * group from this moment, named and tagged, and open it the first time they sign in with that address. Nothing is
 * sent to them.
 *
 * It is an invitation made and accepted in one step, so who may add whom, and with which role, is decided by the
 * same checks, and the invitation stays as the record of who added them. `accountFor` is the sign-in provider's
 * account for an address; tests pass their own.
 */
export async function addMemberNow(db: Db, principal: Principal | null, input: AddMemberInput, accountFor: (email: string, name: string | null) => Promise<string> = clerkAccountFor): Promise<void> {
  const issuer = clerkIssuer();
  if (!issuer || !clerkPortalConfigured()) throw new Error('Sign-in is not configured.');
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '', name = input?.name ? cleanName(input.name) : null;
  // Made first: a person who may not add people here is refused before the sign-in provider is asked for anything.
  const invitation = await issueInvitation(db, principal, { orgId: input.orgId, loopId: input.loopId, recipientEmail: email, recipientName: name, role: input.role, expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
  try {
    const subject = await accountFor(email, name);
    const added = await db.tx(async q => await enrolClerkAccount(q, issuer, subject, name)
      ? authenticate(q, 'added-to-group', async () => ({ issuer, subject, expiresAt: Date.now() + 60_000, verifiedEmail: email })) : null);
    if (!added) throw new Error('That person cannot be added.');
    await acceptInvitationById(db, added, invitation.id);
  } catch (error) {
    await revokeInvitation(db, principal, invitation.id).catch(() => undefined);
    throw error;
  }
  // Earlier invitations to the same address are answered by this: the person is in.
  await db.query('update emba_invitation set revoked_at=clock_timestamp() where org_id=$1 and loop_id=$2 and recipient_email=$3 and accepted_at is null and revoked_at is null', [input.orgId, input.loopId, email]);
}

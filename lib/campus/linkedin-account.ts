import 'server-only';
import { clerkClient } from '@clerk/nextjs/server';
import type { Principal } from '../emba/access';
import { clerkIssuer, clerkPortalConfigured } from '../emba/clerk-identity';

export type LinkedinAccount = { name: string; photo: string | null };

/**
 * The LinkedIn account a person signed in with, or connected to the account they signed in with: its name and photo,
 * as the sign-in service has them. Null for someone with none, and whenever the sign-in service cannot be asked.
 * It says the LinkedIn account is theirs. It does not say which profile it is, or where they studied: LinkedIn gives
 * a sign-in a name, a photo and an email, and nothing else.
 */
export async function linkedinAccount(principal: Pick<Principal, 'issuer' | 'subject'>): Promise<LinkedinAccount | null> {
  if (!clerkPortalConfigured() || principal.issuer !== clerkIssuer()) return null;
  try {
    const user = await (await clerkClient()).users.getUser(principal.subject);
    const account = user.externalAccounts.find(each => /linkedin/i.test(each.provider) && each.verification?.status === 'verified');
    return account ? { name: [account.firstName, account.lastName].filter(Boolean).join(' ').trim() || 'A LinkedIn member', photo: account.imageUrl || null } : null;
  } catch { return null; }
}

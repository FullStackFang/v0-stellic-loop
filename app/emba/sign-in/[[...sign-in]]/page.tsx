import {SignIn} from '@clerk/nextjs';
import Link from 'next/link';
import {clerkPortalConfigured} from '@/lib/emba/clerk-identity';

export default function SignInPage() {
 if(!clerkPortalConfigured()) return <section><h1>Sign-in is not available yet</h1><p><Link href="/emba">Return to your member space</Link></p></section>;
 return <section><h1>Sign in to Loop</h1><p>Your account stays separate from group access. Join a group after signing in.</p><SignIn routing="path" path="/emba/sign-in" fallbackRedirectUrl="/groups" signUpFallbackRedirectUrl="/groups" /></section>;
}

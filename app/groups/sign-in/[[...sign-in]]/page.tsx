import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { Rings } from '@/components/LoopGlyphs';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';

// The Clerk form dressed in the Loop look (app/loop.css): Archivo, navy ink, lime pill, the panel corner.
const look = {
  variables: { colorPrimary: '#0f3b6c', colorText: '#0f3b6c', fontFamily: 'var(--font-archivo), system-ui, sans-serif', borderRadius: '12px' },
  elements: {
    rootBox: { width: '100%', maxWidth: '400px' },
    cardBox: { boxShadow: 'none', borderRadius: '24px 24px 24px 6px', width: '100%', maxWidth: '420px' },
    card: { boxShadow: 'none', borderRadius: 0 },
    header: { display: 'none' },
    formButtonPrimary: { background: 'var(--lime)', color: 'var(--navy)', borderRadius: '56px', height: '44px', fontSize: '15px', fontWeight: 600, boxShadow: 'none', '&:hover': { background: 'oklch(90% 0.2 120)' } },
    socialButtonsBlockButton: { borderRadius: '56px', height: '44px' },
    formFieldInput: { height: '42px' },
  },
};

/**
 * The front door: what Loop is and the sign-in form, on one screen. Every signed-out visit lands here.
 * Afterwards a person goes back to the page they asked for (Clerk reads ?redirect_url), else to their groups.
 */
export default function SignInPage() {
  return <section className="lp-signin" aria-labelledby="signin-title">
    <div>
      <div className="lp-signin-mark"><Rings inline /></div>
      <p className="lp-signin-kick">For the groups you’re already in</p>
      <h1 id="signin-title">Stay in the loop. <em>Without chasing it.</em></h1>
      <p>Loop connects the AI you already use to your team, club or trip, so anyone can ask it what the plan is.</p>
      <p className="lp-signin-aside">Here for the cohort trip? <Link href="/b/emba27">Open the trip board</Link></p>
    </div>
    <div>{clerkPortalConfigured() ? <SignIn routing="path" path="/groups/sign-in" fallbackRedirectUrl="/groups" signUpFallbackRedirectUrl="/groups" appearance={look} /> : <p role="status">Sign-in is not configured for this deployment.</p>}</div>
  </section>;
}

import { SignIn } from '@clerk/nextjs';
import { Rings } from '@/components/LoopGlyphs';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';

// The Clerk form with no card: its fields sit straight on the teal plate (app/loop.css).
// Clerk derives shades from these, so they are hex copies of the Loop tokens: teal, aqua, lime, navy, on-dark, surface.
const teal = '#1b4a50', aqua = '#8ff3ee', lime = '#ebff57', navy = '#0f3b6c', onDark = '#fbfdfe', surface = '#fcfdfe';
const soft = 'rgba(251,253,254,.78)', faint = 'rgba(251,253,254,.14)';
const look = {
  variables: { colorBackground: teal, colorForeground: onDark, colorMutedForeground: soft, colorNeutral: onDark, colorPrimary: aqua, colorPrimaryForeground: navy, colorInput: surface, colorInputForeground: navy, colorDanger: '#f6c9e6', fontFamily: 'var(--font-archivo), system-ui, sans-serif', borderRadius: '12px' },
  elements: {
    rootBox: { width: '100%', maxWidth: '400px' },
    // Clerk clips its card and pulls it out by a pixel; undone here so the pills keep their edges and the Google button its shadow.
    cardBox: { boxShadow: 'none', border: 0, borderRadius: 0, background: 'transparent', width: '100%', overflow: 'visible' },
    card: { boxShadow: 'none', border: 0, borderRadius: 0, background: 'transparent', padding: 0, margin: 0, width: '100%' },
    header: { display: 'none' },
    footer: { background: 'none', marginTop: '18px', '& > div': { background: 'none', boxShadow: 'none', border: 0 } },
    socialButtonsBlockButton: { height: '46px', borderRadius: '56px', color: onDark },
    socialButtonsBlockButtonText: { color: onDark, fontSize: '14px' },
    dividerLine: { background: faint },
    dividerText: { color: soft },
    formFieldLabel: { color: onDark },
    formFieldInput: { height: '46px', minHeight: '46px', paddingInline: '14px', fontSize: '14px', background: surface, color: navy, border: 0, boxShadow: 'none', '&::placeholder': { color: '#667085' } },
    otpCodeFieldInput: { background: surface, color: navy, border: 0 },
    formButtonPrimary: { height: '46px', borderRadius: '56px', background: lime, color: navy, fontSize: '15px', fontWeight: 600, border: 0, boxShadow: 'none', '&:hover': { background: '#dff04a' } },
  },
};
// Outlines of the fields, shown in the form's place until it arrives.
const hold = <div className="lp-signin-hold" aria-hidden="true"><i /><i /><i /><i /><i /></div>;

/**
 * The front door: what Loop is and the sign-in form, on one screen. Every signed-out visit lands here.
 * Afterwards a person goes back to the page they asked for (Clerk reads ?redirect_url), else to their groups.
 */
export default function SignInPage() {
  return <section className="lp-signin" aria-labelledby="signin-title">
    <div className="lp-signin-words">
      <Rings className="lp-signin-mark" inline />
      <p className="lp-signin-kick">For the groups you’re already in</p>
      <h1 id="signin-title">Stay in the loop. <em>Without chasing it.</em></h1>
      <p>Loop connects the AI you already use to your team, club or trip, so anyone can ask it what the plan is.</p>
    </div>
    <div className="lp-signin-side">
      {clerkPortalConfigured() ? <SignIn routing="path" path="/groups/sign-in" fallbackRedirectUrl="/groups" signUpFallbackRedirectUrl="/groups" appearance={look} fallback={hold} /> : <p role="status">Sign-in is not configured for this deployment.</p>}
    </div>
  </section>;
}

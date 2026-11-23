'use client';

import { useState } from 'react';
import { SignIn } from '@clerk/nextjs';
import { SeatsSmall } from '@/components/loading/seats';

// Clerk derives shades from these, so they are hex copies of the campus tokens: the ink the half is filled with, and paper.
const ink = '#0b2447', paper = '#fdfefb';

/**
 * The ways into Loopd on the poll's "Whose times are these?" card (public/demo/mockups-when-one-card-4.html): Google,
 * LinkedIn and Email on one line. Google and LinkedIn are the sign-in form's own buttons; Email is ours, and swaps
 * them for the form's email box, with Back to return. Signing in lands on `back`, the poll.
 */
export function Ways({ back, configured }: { back: string; configured: boolean }) {
  const [email, setEmail] = useState(false);
  if (!configured) return <p className="wn-note" role="status">Sign-in is not configured for this deployment.</p>;
  return <div className="wn-ways" data-email={email || undefined}>
    <SignIn routing="hash" forceRedirectUrl={back} signUpForceRedirectUrl={back} fallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" fallback={<span className="wn-ways-wait"><SeatsSmall size={22} /></span>}
      appearance={{
        options: { socialButtonsPlacement: 'top', socialButtonsVariant: 'blockButton' },
        variables: { colorBackground: ink, colorForeground: paper, colorMutedForeground: paper, colorPrimary: paper, colorPrimaryForeground: ink, colorInput: paper, colorInputForeground: ink, fontFamily: 'var(--font-archivo), system-ui, sans-serif', borderRadius: '8px' },
        elements: {
          rootBox: { width: '100%' }, cardBox: { boxShadow: 'none', border: 0, borderRadius: 0, background: 'transparent', width: '100%', overflow: 'visible' },
          card: { boxShadow: 'none', border: 0, borderRadius: 0, background: 'transparent', padding: 0, margin: 0, width: '100%', gap: '10px' },
          header: { display: 'none' }, dividerRow: { display: 'none' }, footer: { background: 'none', marginTop: '6px', '& > div': { background: 'none', boxShadow: 'none', border: 0 } },
          // Which of the form and the two buttons shows is the stylesheet's (app/when/when.css, .wn-ways), by data-email.
        },
      }} />
    <button type="button" className="cs-btn wn-way" aria-pressed={email} onClick={() => setEmail(now => !now)}>
      {email ? 'Back' : <><svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="14" height="10" rx="2" /><path d="M2.5 5.5 9 10l6.5-4.5" /></svg>Email</>}
    </button>
  </div>;
}

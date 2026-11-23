'use client';

import { useEffect, useRef, useState } from 'react';
import { SignIn } from '@clerk/nextjs';
import { Rings } from '@/components/LoopGlyphs';
import { schoolOfEmail } from '@/lib/campus/schools';
import { KITS, pickedKit, showKit } from './kit';
import { SeatsSmall } from '@/components/loading/seats';

export type School = { slug: string; name: string; domains: string[] };

// Clerk derives shades from these, so they are hex copies of the campus tokens: paper, mute, and each kit's ink.
const paper = '#fdfefb', mute = '#5d6570';

/**
 * The one sign-in card (design D21, public/demo/mockups-one-sign-in.html), on one line (direction A of
 * public/demo/mockups-sign-in-line.html): Google, LinkedIn once it is switched on at the sign-in service, and Email.
 * Google and LinkedIn are the sign-in form's own buttons; Email is ours, and swaps them for the form's email box and
 * Continue, with Back to return. Which of them shows is the stylesheet's (app/c/campus.css), by data-email. A school
 * email continues. Any other email, where there is a
 * LinkedIn button, takes away every way on but LinkedIn (`away`): that is the way in with no school email. As
 * an email is typed the card spots its school and the page takes on that school's colours. That decides nothing:
 * a person's school is the one their verified email ends in, worked out after sign-in.
 * On the front door the page's colours belong to the ticket: there `kit` is the school showing, and `onSpot` is told
 * which school the email is at (or none) in place of the card setting the colours itself.
 * On a page that someone signs in from without leaving it (a poll), `back` is that page: signing in lands there.
 */
export function DoorSignIn({ schools, routing, configured, kit, onSpot, back }: { schools: School[]; routing: 'hash' | 'path'; configured: boolean; kit?: string; onSpot?: (slug: string | null) => void; back?: string }) {
  const [slug, setSlug] = useState(''), [seen, setSeen] = useState(''), card = useRef<HTMLDivElement>(null), last = useRef('');
  // Whether the sign-in form has a LinkedIn button: it does once LinkedIn is switched on at the sign-in service.
  const [linkedin, setLinkedin] = useState(false), [away, setAway] = useState(false), [byEmail, setByEmail] = useState(false);
  const school = schools.find(each => each.slug === slug);
  const names = schools.map(each => each.name).join(', ').replace(/, ([^,]*)$/, ' or $1');
  // The email field belongs to the sign-in form. It is read as it is typed in, and looked at again now and then,
  // because a browser or the form itself can fill it in without a keystroke.
  const read = () => {
    const field = card.current?.querySelector<HTMLInputElement>('input[name=identifier], input[type=email]'), email = field?.value ?? '';
    const has = !!card.current?.querySelector('button[class*="linkedin"]');
    if (has !== linkedin) { setLinkedin(has); last.current = '\0'; }
    if (email === last.current) return;
    last.current = email;
    // An email that is there, typed or filled in by the browser, shows its box.
    if (email) setByEmail(true);
    const domain = (email.split('@')[1] ?? '').trim().toLowerCase(), hit = schoolOfEmail(schools, email);
    setSlug(hit?.slug ?? '');
    const other = !hit && domain.includes('.');
    setAway(has && other);
    setSeen(hit ? `${domain} is ${hit.name}.` : other ? (has ? `${domain} is not a school email. Use LinkedIn.` : `Not an email at ${names}. You can still sign in with it.`) : '');
    if (onSpot) onSpot(hit?.slug ?? null); else showKit(hit?.slug ?? pickedKit() ?? 'loop');
  };
  useEffect(() => { const again = setInterval(read, 500); return () => clearInterval(again); });
  const ink = (KITS.find(each => each.slug === (kit ?? slug)) ?? KITS[0]).ink;
  const label = { fontSize: 0, '&::before': { content: `"${school ? `${school.name} email` : 'Email'}"`, fontSize: '13px', fontWeight: 600 } };
  const shared = {
    fallbackRedirectUrl: '/', signUpFallbackRedirectUrl: '/', ...(back ? { forceRedirectUrl: back, signUpForceRedirectUrl: back } : {}), fallback: <span className="cs-door-wait"><SeatsSmall size={22} /></span>,
    appearance: {
      options: { socialButtonsPlacement: 'top' as const, socialButtonsVariant: 'blockButton' as const },
      variables: { colorBackground: paper, colorForeground: ink, colorMutedForeground: mute, colorPrimary: ink, colorPrimaryForeground: paper, colorInput: paper, colorInputForeground: ink, fontFamily: 'var(--font-archivo), system-ui, sans-serif', borderRadius: '8px' },
      elements: {
        rootBox: { width: '100%' }, cardBox: { boxShadow: 'none', border: 0, borderRadius: 0, background: 'transparent', width: '100%', overflow: 'visible' },
        card: { boxShadow: 'none', border: 0, borderRadius: 0, background: 'transparent', padding: 0, margin: 0, width: '100%', gap: '8px' },
        header: { display: 'none' }, dividerRow: { display: 'none' }, footer: { background: 'none', marginTop: 0, '& > div': { background: 'none', boxShadow: 'none', border: 0 } },
        formFieldLabel__identifier: label, formFieldLabel__emailAddress: label,
      },
    },
  };
  return <div className="cs-door-in" ref={card} onInput={read} data-away={away || undefined} data-email={byEmail || undefined}>
    <div className="cs-door-in-top"><h2>{school ? `Sign in at ${school.name}` : 'Sign in'}</h2>{/* A spotted school has the tab on the edge to say so. */}{!school && <p>{away ? 'LinkedIn gets you in.' : linkedin ? 'Your school email, or LinkedIn.' : 'Your school email opens your campus.'}</p>}<Rings /><span className="seen" aria-live="polite">{seen}</span></div>
    <div className="cs-door-in-body">
      {configured ? (routing === 'path' ? <SignIn routing="path" path="/sign-in" {...shared} /> : <SignIn routing="hash" {...shared} />)
        : <p role="status">Sign-in is not configured for this deployment.</p>}
      {configured && <button type="button" className="cs-btn cs-door-way" aria-pressed={byEmail} onClick={() => setByEmail(now => !now)}>
        {byEmail ? 'Back' : <><svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="14" height="10" rx="2" /><path d="M2.5 5.5 9 10l6.5-4.5" /></svg>Email</>}
      </button>}
    </div>
  </div>;
}

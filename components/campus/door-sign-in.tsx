'use client';

import { useEffect, useRef, useState } from 'react';
import { SignIn } from '@clerk/nextjs';
import { Rings } from '@/components/LoopGlyphs';
import { schoolOfEmail } from '@/lib/campus/schools';
import { KITS, pickedKit, showKit } from './kit';

export type School = { slug: string; name: string; domains: string[] };

// Clerk derives shades from these, so they are hex copies of the campus tokens: paper, mute, and each kit's ink.
const paper = '#fdfefb', mute = '#5d6570';

/**
 * The one sign-in card (design D21): the sign-in the groups site uses (Google, or, email, Continue), drawn small. As
 * an email is typed the card spots its school and the page takes on that school's colours. That decides nothing:
 * a person's school is the one their verified email ends in, worked out after sign-in.
 * On the front door the page's colours belong to the ticket: there `kit` is the school showing, and `onSpot` is told
 * which school the email is at (or none) in place of the card setting the colours itself.
 */
export function DoorSignIn({ schools, routing, configured, kit, onSpot }: { schools: School[]; routing: 'hash' | 'path'; configured: boolean; kit?: string; onSpot?: (slug: string | null) => void }) {
  const [slug, setSlug] = useState(''), [seen, setSeen] = useState(''), card = useRef<HTMLDivElement>(null), last = useRef('');
  // Whether the sign-in form has a LinkedIn button: it does once LinkedIn is switched on at the sign-in service.
  const [linkedin, setLinkedin] = useState(false);
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
    const domain = (email.split('@')[1] ?? '').trim().toLowerCase(), hit = schoolOfEmail(schools, email);
    setSlug(hit?.slug ?? '');
    setSeen(hit ? `${domain} is ${hit.name}.` : domain.includes('.') ? (has ? 'Not a school email. Continue with LinkedIn, and we check your school.' : `Not an email at ${names}. You can still sign in with it.`) : '');
    if (onSpot) onSpot(hit?.slug ?? null); else showKit(hit?.slug ?? pickedKit() ?? 'loop');
  };
  useEffect(() => { const again = setInterval(read, 500); return () => clearInterval(again); });
  const ink = (KITS.find(each => each.slug === (kit ?? slug)) ?? KITS[0]).ink;
  const label = { fontSize: 0, '&::before': { content: `"${school ? `${school.name} email` : 'Email'}"`, fontSize: '13px', fontWeight: 600 } };
  const shared = {
    fallbackRedirectUrl: '/', signUpFallbackRedirectUrl: '/', fallback: <p className="cs-note" aria-hidden="true">Loading sign-in…</p>,
    appearance: {
      variables: { colorBackground: paper, colorForeground: ink, colorMutedForeground: mute, colorPrimary: ink, colorPrimaryForeground: paper, colorInput: paper, colorInputForeground: ink, fontFamily: 'var(--font-archivo), system-ui, sans-serif', borderRadius: '8px' },
      elements: {
        rootBox: { width: '100%' }, cardBox: { boxShadow: 'none', border: 0, borderRadius: 0, background: 'transparent', width: '100%', overflow: 'visible' },
        card: { boxShadow: 'none', border: 0, borderRadius: 0, background: 'transparent', padding: 0, margin: 0, width: '100%', gap: '14px' },
        header: { display: 'none' }, footer: { background: 'none', marginTop: '10px', '& > div': { background: 'none', boxShadow: 'none', border: 0 } },
        formFieldLabel__identifier: label, formFieldLabel__emailAddress: label,
      },
    },
  };
  return <div className="cs-door-in" ref={card} onInput={read}>
    <div className="cs-door-in-top"><h2>{school ? `Sign in at ${school.name}` : 'Sign in'}</h2><p>Your school email opens your campus.</p><Rings /></div>
    <div className="cs-door-in-body">
      {configured ? (routing === 'path' ? <SignIn routing="path" path="/sign-in" {...shared} /> : <SignIn routing="hash" {...shared} />)
        : <p role="status">Sign-in is not configured for this deployment.</p>}
      <p className="seen" aria-live="polite">{seen}</p>
      <p className="fine">{school ? `With your ${school.name} email you see ${school.name}.` : linkedin ? 'A school email opens your campus straight away. No school email? Continue with LinkedIn, and we check your school.' : 'Type your school email and Loop takes on your school\u2019s colours. Any other email signs in too.'}</p>
    </div>
  </div>;
}

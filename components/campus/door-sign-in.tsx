'use client';

import { useState, type FormEvent } from 'react';
import { SignIn } from '@clerk/nextjs';
import { schoolOfEmail } from '@/lib/campus/schools';

export type School = { slug: string; name: string; domains: string[] };

// Clerk derives shades from these, so they are hex copies of the campus tokens: ink (navy), paper, mute.
const ink = '#0d2747', paper = '#fdfefb', mute = '#5d6570';

/**
 * The one sign-in card (design D21): the sign-in the groups site uses (Google, or, email, Continue), drawn small, with
 * a school menu on top. The menu follows the email as it is typed and can be set by hand, but it decides nothing:
 * a person's school is the one their verified email ends in, worked out after sign-in.
 */
export function DoorSignIn({ schools, routing, configured }: { schools: School[]; routing: 'hash' | 'path'; configured: boolean }) {
  const [slug, setSlug] = useState(schools[0]?.slug ?? ''), [seen, setSeen] = useState('');
  const school = schools.find(each => each.slug === slug) ?? schools[0];
  const names = schools.map(each => each.name).join(', ').replace(/, ([^,]*)$/, ' or $1');
  // The email field belongs to the sign-in form; what is typed in it reaches this card as it bubbles up.
  const typed = (event: FormEvent<HTMLDivElement>) => {
    const field = event.target as HTMLInputElement;
    if (field.tagName !== 'INPUT' || (field.name !== 'identifier' && field.type !== 'email')) return;
    const domain = (field.value.split('@')[1] ?? '').trim().toLowerCase(), hit = schoolOfEmail(schools, field.value);
    if (hit) { setSlug(hit.slug); setSeen(`${domain} is ${hit.name}.${hit.slug === slug ? '' : ' Switched for you.'}`); }
    else setSeen(domain.includes('.') ? `Not an email at ${names}. You can still sign in with it.` : '');
  };
  if (!school) return null;
  const label = { fontSize: 0, '&::before': { content: `"${school.name} email"`, fontSize: '13px', fontWeight: 600 } };
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
  return <div className="cs-door-in" onInput={typed}>
    <h2>Sign in at {school.name}</h2>
    <div><label htmlFor="cs-school">School</label>
      <select id="cs-school" value={school.slug} onChange={event => { setSlug(event.target.value); setSeen(''); }}>{schools.map(each => <option key={each.slug} value={each.slug}>{each.name}</option>)}</select></div>
    {configured ? (routing === 'path' ? <SignIn routing="path" path="/sign-in" {...shared} /> : <SignIn routing="hash" {...shared} />)
      : <p role="status">Sign-in is not configured for this deployment.</p>}
    <p className="seen" aria-live="polite">{seen}</p>
    <p className="fine">With your {school.name} email ({school.domains.map(domain => `@${domain}`).join(', ')}) you see {school.name}. Your school is the one your email belongs to; any other email signs in too.</p>
  </div>;
}

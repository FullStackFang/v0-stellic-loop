'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DoorSignIn, type School } from './door-sign-in';

/** What the bar's "Sign in" needs to open the sign-in card: the schools it knows, and where signing in lands (the page it was pressed on, unless said). */
export type Door = { schools: School[]; configured: boolean; back?: string };

/**
 * The bar's "Sign in": the app's one way in from any page. The sign-in card opens over the page it was pressed on, and
 * Close, Escape or a press outside puts it away. Nothing of the card loads until it is pressed.
 */
export function SignInHere({ schools, configured, back }: Door) {
  const [open, setOpen] = useState(false), here = usePathname();
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);
  return <>
    <button type="button" className="cs-btn sm go" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>Sign in</button>
    {open && <div className="cs-over" role="dialog" aria-modal="true" aria-label="Sign in" onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="cs-over-card"><button type="button" className="cs-btn sm cs-over-x" onClick={() => setOpen(false)}>Close</button>
        <DoorSignIn schools={schools} routing="hash" configured={configured} back={back ?? here ?? undefined} /></div>
    </div>}
  </>;
}

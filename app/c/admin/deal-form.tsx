'use client';

import { useRef, useState, useTransition, type ReactNode } from 'react';
import { dealAction } from './actions';

/**
 * One form of the Deals tab (openspec campus-deals, design D7). Save and Hide stay on the page, as the animal form does:
 * the page is drawn again where it is and what happened shows above the form. What was typed is kept when a deal is
 * refused, so the admin fixes the one field; a new deal's form is cleared once it is saved. The pressed button's
 * name and value go with the form, so one form can carry Save and Hide.
 */
export function DealForm({ className, fresh = false, children }: { className?: string; /** The form that adds a deal. */ fresh?: boolean; children: ReactNode }) {
  const [said, setSaid] = useState<{ text: string; n: number } | null>(null), [busy, start] = useTransition(), form = useRef<HTMLFormElement>(null);
  return <form ref={form} className={className} aria-busy={busy} onSubmit={event => {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget), pressed = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (pressed?.name) data.set(pressed.name, pressed.value);
    start(async () => {
      const text = await dealAction(data);
      setSaid(was => ({ text, n: (was?.n ?? 0) + 1 }));
      if (fresh && !text.startsWith('Not saved')) form.current?.reset();
    });
  }}>
    {said && <p key={said.n} className="cs-adm-said" role="status">{said.text}</p>}
    {children}</form>;
}

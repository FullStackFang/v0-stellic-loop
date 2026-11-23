'use client';

import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import { animalAction } from './actions';

/**
 * The Animals tab's form. A press saves without leaving the page: the page is drawn again in place, so the grid does not
 * jump and the open card stays open, and what happened shows above the grid. React clears a form once its action is done,
 * so the animal that was open is picked again after.
 */
export function AnimalForm({ className, children }: { className: string; children: ReactNode }) {
  // `n` counts the presses, so the same line said twice still shows afresh.
  const [done, act] = useActionState(async (last: { said: string; n: number } | null, data: FormData) => ({ said: await animalAction(data), n: (last?.n ?? 0) + 1 }), null);
  const form = useRef<HTMLFormElement>(null), open = useRef<string[]>([]);
  useEffect(() => {
    const boxes = form.current?.querySelectorAll<HTMLInputElement>('.cs-adm-grid input[type=checkbox]') ?? [];
    for (const box of boxes) if (open.current.includes(box.value) && !box.checked) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
  }, [done]);
  return <form ref={form} action={act} className={className}
    onSubmit={event => { open.current = Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('.cs-adm-grid input:checked'), box => box.value); }}>
    {done && <p key={done.n} className="cs-adm-said" role="status">{done.said}</p>}
    {children}</form>;
}

'use client';

import { useEffect, useRef } from 'react';

/**
 * Marks the form it is in with how many of its grid's animals are ticked (data-picked), for the admin's Animals
 * section (app/c/admin/page.tsx): one picked opens in the grid, two or more show the bar of moves. CSS alone cannot
 * tell one from two across the grid's items: that needs :has() inside :has(), which browsers do not allow.
 * Where the browser can, a tick is made inside a view transition, so the picked one grows in place and the others glide aside.
 */
export function PickCount() {
  const mark = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = mark.current?.closest('form');
    if (!form) return;
    const count = () => { form.dataset.picked = String(form.querySelectorAll('.cs-adm-grid input[type=checkbox]:checked').length); };
    // A reset clears the boxes after its event, so it is counted once that is done.
    const reset = () => setTimeout(count);
    const tick = (event: MouseEvent) => {
      const box = (event.target as Element).closest?.('.cs-adm-grid input[type=checkbox]');
      if (!(box instanceof HTMLInputElement) || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      // By now the click has flipped the box; preventing it flips it back, and the transition sets it again.
      const to = box.checked;
      event.preventDefault();
      document.startViewTransition(() => { box.checked = to; box.dispatchEvent(new Event('change', { bubbles: true })); });
    };
    count(); form.addEventListener('change', count); form.addEventListener('reset', reset); form.addEventListener('click', tick);
    return () => { form.removeEventListener('change', count); form.removeEventListener('reset', reset); form.removeEventListener('click', tick); };
  }, []);
  return <span ref={mark} hidden />;
}

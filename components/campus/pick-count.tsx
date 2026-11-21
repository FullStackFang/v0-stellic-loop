'use client';

import { useEffect, useRef } from 'react';

/**
 * Marks the form it is in with how many of its grid's animals are ticked (data-picked), for the admin's Animals
 * section (app/c/admin/page.tsx): one picked shows its own card, two or more the bar of moves. CSS alone cannot
 * tell one from two across the grid's items: that needs :has() inside :has(), which browsers do not allow.
 */
export function PickCount() {
  const mark = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = mark.current?.closest('form');
    if (!form) return;
    const count = () => { form.dataset.picked = String(form.querySelectorAll('.cs-adm-grid input[type=checkbox]:checked').length); };
    // A reset clears the boxes after its event, so it is counted once that is done.
    const reset = () => setTimeout(count);
    count(); form.addEventListener('change', count); form.addEventListener('reset', reset);
    return () => { form.removeEventListener('change', count); form.removeEventListener('reset', reset); };
  }, []);
  return <span ref={mark} hidden />;
}

'use client';

import { useEffect, useRef } from 'react';

/**
 * Keeps one animal picked at a time in the admin's Animals grid (app/c/admin/page.tsx): tapping another closes the open one
 * and opens that one, and tapping the open one's face closes it. It marks the form with how many are picked (data-picked),
 * which the grid's CSS reads to open the picked one. Where the browser can, each tap is made inside a view transition, so the
 * picked one grows in place and the others glide aside.
 */
export function PickCount() {
  const mark = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = mark.current?.closest('form');
    if (!form) return;
    const boxes = () => Array.from(form.querySelectorAll<HTMLInputElement>('.cs-adm-grid input[type=checkbox]'));
    const count = () => { form.dataset.picked = String(boxes().filter(box => box.checked).length); };
    // A reset clears the boxes after its event, so it is counted once that is done.
    const reset = () => setTimeout(count);
    const tick = (event: MouseEvent) => {
      const box = (event.target as Element).closest?.('.cs-adm-grid input[type=checkbox]');
      if (!(box instanceof HTMLInputElement)) return;
      // By now the click has flipped the box. The others are let go, so one is picked at most.
      const to = box.checked, others = boxes().filter(each => each !== box && each.checked);
      const settle = () => { for (const each of others) each.checked = false; box.checked = to; box.dispatchEvent(new Event('change', { bubbles: true })); };
      if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return settle();
      // Preventing the click flips the box back; the transition sets it again.
      event.preventDefault();
      document.startViewTransition(settle);
    };
    // Escape closes the open one, as its Close button does.
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && boxes().some(box => box.checked)) form.reset(); };
    count(); form.addEventListener('change', count); form.addEventListener('reset', reset); form.addEventListener('click', tick); form.addEventListener('keydown', escape);
    return () => { form.removeEventListener('change', count); form.removeEventListener('reset', reset); form.removeEventListener('click', tick); form.removeEventListener('keydown', escape); };
  }, []);
  return <span ref={mark} hidden />;
}

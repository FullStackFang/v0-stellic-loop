'use client';

import { useEffect } from 'react';

/** Marks the part of a legal page being read: its pill in the strip is filled and its short answer is lit (components/legal.css). */
export function LegalSpy() {
  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') return;
    const rows = [...document.querySelectorAll<HTMLElement>('.cs-lg-row')], pills = [...document.querySelectorAll<HTMLAnchorElement>('.cs-lg-jump a')];
    const watch = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      rows.forEach(row => row.classList.toggle('now', row === entry.target));
      pills.forEach(pill => { if (pill.hash === `#${entry.target.id}`) pill.setAttribute('aria-current', 'true'); else pill.removeAttribute('aria-current'); });
    }), { rootMargin: '-30% 0px -60% 0px' });
    rows.forEach(row => watch.observe(row));
    return () => watch.disconnect();
  }, []);
  return null;
}

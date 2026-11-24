'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { KITS } from './kit';

type Shown = { who: string; school: string | null; kit: string | null; x: number; y: number };

/**
 * The tag a face shows when it is pointed at: the person's name and their school, with a dot in the school's colours
 * (public/demo/mockups-school-labels.html, faces A). One tag serves the whole page: a face says who it is in data-who,
 * data-school and data-school-kit (FaceDot in screen.tsx), so faces keep their own places in stacks, blots and seats.
 * It is mounted once, in the foot, which every page with faces has.
 */
export function FaceTags() {
  const [shown, setShown] = useState<Shown | null>(null);
  useEffect(() => {
    const faceAt = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('[data-who]') : null;
    const over = (event: Event) => {
      const face = faceAt(event.target); if (!face) return;
      const box = face.getBoundingClientRect(), kit = face.dataset.schoolKit ?? null;
      setShown({ who: face.dataset.who ?? '', school: face.dataset.school ?? null, kit: KITS.some(each => each.slug === kit) ? kit : null, x: box.left + box.width / 2, y: box.bottom });
    };
    const out = (event: Event) => { if (faceAt(event.target)) setShown(null); };
    const gone = () => setShown(null);
    document.addEventListener('pointerover', over); document.addEventListener('pointerout', out);
    document.addEventListener('focusin', over); document.addEventListener('focusout', out);
    window.addEventListener('scroll', gone, true);
    return () => {
      document.removeEventListener('pointerover', over); document.removeEventListener('pointerout', out);
      document.removeEventListener('focusin', over); document.removeEventListener('focusout', out);
      window.removeEventListener('scroll', gone, true);
    };
  }, []);
  // A face near the window's edge would put half its tag past it: the tag moves back inside, and its point stays on the face.
  const tag = useRef<HTMLSpanElement>(null), [nudge, setNudge] = useState(0);
  useLayoutEffect(() => {
    if (!shown || !tag.current) return;
    const half = tag.current.offsetWidth / 2, edge = 8, width = document.documentElement.clientWidth;
    setNudge(shown.x - half < edge ? edge - (shown.x - half) : shown.x + half > width - edge ? width - edge - (shown.x + half) : 0);
  }, [shown]);
  if (!shown) return null;
  return <span ref={tag} className="cs-facetag" role="tooltip" style={{ left: shown.x + nudge, top: shown.y, '--point': `${-nudge}px` } as CSSProperties}>
    {shown.kit && <i data-kit={shown.kit} aria-hidden="true" />}{shown.who}{shown.school && <small>{shown.school}</small>}
  </span>;
}

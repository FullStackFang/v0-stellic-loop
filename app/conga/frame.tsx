'use client';

import { useEffect, useRef } from 'react';

/**
 * The game, full-screen under the bar and the foot. It says when it is being played and when a card is up
 * ({ conga: 'playing' | 'stopped' }), and the bar and foot slide away or back (conga.css); 'signin' opens the bar's
 * sign-in card (components/campus/sign-in-here.tsx). Only this page's own frame is listened to.
 */
export function CongaFrame({ src }: { src: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    const heard = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== location.origin) return;
      const said = (event.data as { conga?: unknown } | null)?.conga;
      if (said === 'playing' || said === 'stopped') root.classList.toggle('cg-playing', said === 'playing');
      if (said === 'signin') window.dispatchEvent(new CustomEvent('loopd:sign-in'));
    };
    window.addEventListener('message', heard);
    return () => { window.removeEventListener('message', heard); root.classList.remove('cg-playing'); };
  }, []);
  // The keys (Space to dash, P to pause) go to the game from the start.
  return <iframe ref={frame} className="cg-frame" src={src} title="Conga" onLoad={() => frame.current?.focus()} />;
}

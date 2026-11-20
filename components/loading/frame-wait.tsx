'use client';

import { useEffect, useRef, useState, type IframeHTMLAttributes } from 'react';
import { SeatsSmall } from './seats';

/** A frame that never says it loaded is not waited on for ever. */
const GIVE_UP_MS = 8000;

/**
 * A frame (a map, the Ink page) with the small one and its line over its box until it has loaded (openspec
 * loop-loading-seats, design D14). The box it sits in must be positioned. The frame is there from the start, under the
 * loader, so nothing moves when it arrives.
 */
export function FrameWait(frame: IframeHTMLAttributes<HTMLIFrameElement>) {
  const [here, setHere] = useState(false), box = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    // A frame of this site can have loaded before this code ran; then no load event is coming.
    try { const inside = box.current?.contentDocument; if (inside && inside.readyState === 'complete' && inside.location.href !== 'about:blank') setHere(true); } catch { /* another site's frame: wait for its load event */ }
    const late = setTimeout(() => setHere(true), GIVE_UP_MS);
    return () => clearTimeout(late);
  }, []);
  return <>{!here && <span className="seats-over"><SeatsSmall line /></span>}<iframe {...frame} ref={box} onLoad={() => setHere(true)} /></>;
}

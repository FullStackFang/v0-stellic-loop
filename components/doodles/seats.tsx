'use client';

import { useEffect, useRef } from 'react';
import { SeatsSmall } from '@/components/loading/seats';
import { mountSeats, type SeatsPlayer } from './seats-game';

/**
 * The Seats doodle. The game draws itself into this element (components/doodles/seats-game.ts) once the page is in the
 * browser. Until it has, the app's small loader stands in the middle of where the game will be, as for any late part of a page.
 */
export function SeatsGame({ player }: { player: SeatsPlayer }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => mountSeats(root.current!, player), [player]);
  // the loader shows only while the game's element is empty (seats-game.css), so nothing here needs to know when it drew
  return <div className="sg-box"><div className="sg" ref={root} /><span className="sg-wait"><SeatsSmall line /></span></div>;
}

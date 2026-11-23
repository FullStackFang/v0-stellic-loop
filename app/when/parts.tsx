import type { ReactNode } from 'react';

// The pieces every Loopd When screen is made of (public/demo/mockups-when.html). No state and no data reads, so the
// server pages and the browser pieces both use them.

/** A person as a screen draws them: their name and the address of their animal. Someone who answered with only a name has no animal: `face` is empty and they are drawn as their initial. */
export type Shown = { personId: string; name: string; face: string };

export function Face({ of, here = false }: { of: Shown; here?: boolean }) {
  if (!of.face) return <i className={`cs-face wn-ini${here ? ' here' : ''}`} role="img" aria-label={of.name}>{(of.name.trim()[0] ?? '?').toUpperCase()}</i>;
  // eslint-disable-next-line @next/next/no-img-element -- an icon from public/animals
  return <img className={`cs-face pet${here ? ' here' : ''}`} src={of.face} alt={of.name} />;
}
/** A seat for each of the group: the people who answered, then the seats still empty. */
export function Seats({ people, size, me = null }: { people: Shown[]; size: number; me?: string | null }) {
  const shown = people.slice(0, 12), empty = Math.max(0, Math.min(size, 12) - shown.length);
  return <span className="cs-seats">{shown.map(each => <Face key={each.personId} of={each} here={each.personId === me} />)}{Array.from({ length: empty }, (_, at) => <i key={at} className="cs-seat" />)}</span>;
}
export const Stack = ({ people }: { people: Shown[] }) => <span className="cs-stack">{people.slice(0, 6).map(each => <Face key={each.personId} of={each} />)}</span>;
export const Tile = ({ top, big, met = false }: { top: string; big: string; met?: boolean }) => <span className={`cs-tile${met ? ' met' : ''}`}><small>{top}</small><b>{big}</b></span>;

/** The ticket at the head of a screen: what it is about on the paper, the count on the stub. */
export function Ticket({ tile, children, stub, met = false }: { tile?: ReactNode; children: ReactNode; stub: ReactNode; met?: boolean }) {
  return <div className="wn-tk">
    <div className={`wn-tk-top${tile ? '' : ' solo'}`}>{tile}<div>{children}</div></div>
    <div className={`wn-tk-stub${met ? ' met' : ''}`}>{stub}</div>
  </div>;
}
/** A panel, named by the tab that overlaps its top edge. */
export const Panel = ({ tab, children }: { tab: ReactNode; children: ReactNode }) => <section className="wn-panel"><h2 className="wn-tab">{tab}</h2>{children}</section>;

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Rings } from '@/components/LoopGlyphs';
import { groupHandle, groupHref } from '@/lib/emba/group-path';

type Placed = { namespace: string; slug: string; orgName: string };

/**
 * Where a page sits: Groups, then each group from the highest one the person can open down to this one, then the page.
 * A group the person cannot open is never in `trail`, so it is never named.
 */
export function Crumbs({ trail, here, children }: { trail: Placed[]; here?: string; children?: ReactNode }) {
  const last = trail.length - 1;
  return <p className="lp-crumbs"><Link href="/groups">Groups</Link>
    {trail.map((group, index) => <span key={group.slug} className="lp-crumb"><span aria-hidden="true">›</span>
      {index === last && !here ? <b>{group.orgName}</b> : <Link href={index === last ? groupHref(group) : `${groupHref(group)}/team`}>{group.orgName}</Link>}</span>)}
    {here && <span className="lp-crumb"><span aria-hidden="true">›</span><b>{here}</b></span>}
    {children}
  </p>;
}

/** The groups directly inside this one, and the way to start another for a person who may. */
export function Inside({ group }: { group: Placed & { inside: Placed[]; canStart: boolean } }) {
  if (!group.inside.length && !group.canStart) return null;
  return <nav className="lp-inside" aria-label="Inside this group"><h2>Inside this group</h2><ul>
    {group.inside.map(inner => <li key={inner.slug}><Link href={`${groupHref(inner)}/team`}><span className="lp-inside-mark"><Rings /></span><span><b>{inner.orgName}</b><small>{groupHandle(inner)}</small></span></Link></li>)}
    {group.canStart && <li><Link className="lp-inside-new" href={`/groups/new?in=${encodeURIComponent(groupHandle(group))}`}><span className="lp-inside-mark" aria-hidden="true">+</span><span><b>Start a group here</b><small>Everyone in {group.orgName} can open it</small></span></Link></li>}
  </ul></nav>;
}

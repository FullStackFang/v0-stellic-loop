import Link from 'next/link';
import type { ReactNode } from 'react';
import { Rings } from '@/components/LoopGlyphs';
import { groupHandle, groupHref } from '@/lib/emba/group-path';
import type { TileProps } from '@/lib/emba/group-picture';
import { GroupTile } from './group-picture';

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

/**
 * The head of a group's people pages: its name, how many are in it, and the sections. "Add people" is offered to
 * the owners and organizers only, so the Members page is the list and nothing else.
 */
export function GroupHead({ group, base, here, people, canAdd, asking, tile }: { group: Placed; base: string; here: 'members' | 'add'; people: number | null; canAdd: boolean; /** The group's drawn picture, and the card to draw one for a person who runs the group. */ tile: TileProps; /** How many people are asking to join: shown on the tab, so a request is not missed from the list. */ asking: number }) {
  return <section className="gt-tk gt-head gt-ppl"><div>
    <header className="gt-plate"><GroupTile {...tile} name={group.orgName} />
      <div><h1>{group.orgName}</h1><p className="gt-handle"><span>{groupHandle(group)}</span>{people !== null && <em>{people} {people === 1 ? 'person' : 'people'}</em>}</p></div></header>
    <nav className="gt-facts" aria-label="Group sections">
      <Link href={`${base}/team`} aria-label="Team"><b>Team</b><span>What is coming up</span></Link>
      <Link href={base} aria-label="Members" aria-current={here === 'members' ? 'page' : undefined}><b>Members</b><span>Who is in the group</span></Link>
      {canAdd && <Link href={`${base}/add`} aria-label={asking > 0 ? `Add people, ${asking} asking to join` : 'Add people'} aria-current={here === 'add' ? 'page' : undefined}><b>Add people{asking > 0 && <small>{asking}</small>}</b><span>{asking > 0 ? `${asking} asking to join` : 'By email or a join link'}</span></Link>}
      <Link href={`${base}/team?tab=resources`} aria-label="Resources"><b>Resources</b><span>Links and texts</span></Link>
    </nav>
  </div></section>;
}

/** The groups directly inside this one, and the way to start another for a person who may. */
export function Inside({ group }: { group: Placed & { inside: Placed[]; canStart: boolean } }) {
  if (!group.inside.length && !group.canStart) return null;
  return <nav className="lp-inside" aria-label="Inside this group"><h2>Inside this group</h2><ul>
    {group.inside.map(inner => <li key={inner.slug}><Link href={`${groupHref(inner)}/team`}><span className="lp-inside-mark"><Rings /></span><span><b>{inner.orgName}</b><small>{groupHandle(inner)}</small></span></Link></li>)}
    {group.canStart && <li><Link className="lp-inside-new" href={`/groups/new?in=${encodeURIComponent(groupHandle(group))}`}><span className="lp-inside-mark" aria-hidden="true">+</span><span><b>Start a group here</b><small>Everyone in {group.orgName} can open it</small></span></Link></li>}
  </ul></nav>;
}

'use client';

import Link, { useLinkStatus } from 'next/link';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Rings } from '@/components/LoopGlyphs';
import { ROOT_SLUG, groupPath } from '@/lib/emba/group-path';
import { folded, toggleGroup, useClosedGroups } from './collapse';

const icon = { viewBox: '0 0 16 16', 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const icons = {
  record: <svg {...icon}><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M2.5 6.5h11M6.5 6.5v7" /></svg>,
  resources: <svg {...icon}><path d="M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12M6 8h4M6 10.5h4" /></svg>,
  members: <svg {...icon}><circle cx="6" cy="6" r="2.3" /><path d="M2 13c.4-2.2 2-3.4 4-3.4s3.6 1.2 4 3.4M10.5 4a2.2 2.2 0 0 1 0 4.2M12 9.9c1.1.5 1.8 1.5 2 3.1" /></svg>,
  groups: <svg {...icon}><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></svg>,
  assistants: <svg {...icon}><circle cx="5.5" cy="8" r="3" /><circle cx="10.5" cy="8" r="3" /></svg>,
  reach: <svg {...icon}><rect x="2" y="3.5" width="12" height="9" rx="1.5" /><path d="M2.5 4.5 8 9l5.5-4.5" /></svg>,
  archive: <svg {...icon}><path d="M4 2.5v11M4 4.5h5.5M4 8h8M4 11.5h4" /><circle cx="11.5" cy="4.5" r="1.3" /></svg>,
};

/** A dot on the menu link that was clicked, until its page answers. Always drawn, so nothing shifts. */
function Wait() {
  return <span className="lp-wait" aria-hidden="true" data-on={useLinkStatus().pending || undefined} />;
}

/** A group in the rail, in tree order: `depth` is how many groups it sits inside that the person can open. */
export type RailGroup = { id: string; parent: string | null; namespace: string; slug: string; name: string; handle: string; depth: number };
/** The left rail of the team product: which team, where in it, and the signed-in account. */
export function Rail({ groups, account }: { groups: RailGroup[]; account: ReactNode }) {
  const path = usePathname(), tab = useSearchParams().get('tab');
  const { namespace, slug = ROOT_SLUG } = useParams<{ namespace?: string; slug?: string }>();
  const current = groups.find(group => group.namespace === namespace && group.slug === slug);
  // What the person folded shut on the Groups page is folded here too, except the groups on the way down to the one they are in.
  const closed = useClosedGroups(), above = new Set<string>();
  for (let at = groups.find(group => group.id === current?.parent); at; at = groups.find(group => group.id === at!.parent)) above.add(at.id);
  const fold = (group: RailGroup) => {
    if (above.has(group.id) || !groups.some(item => item.parent === group.id)) return null;
    const shut = !!closed?.has(group.id);
    return <button type="button" className="lp-fold" aria-expanded={!shut} aria-label={`${shut ? 'Show' : 'Hide'} the groups inside ${group.name}`} onClick={() => toggleGroup(group.id)}><svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg></button>;
  };
  const item = (href: string, label: string, glyph: ReactNode, on: boolean) => <li><Link href={href} aria-current={on ? 'page' : undefined}>{glyph}{label}<Wait /></Link></li>;
  const base = namespace ? groupPath(namespace, slug) : '';
  return <aside className="lp-rail">
    <Link href="/groups" className="lp-wordmark"><Rings /><span>Loop</span></Link>
    {groups.length > 0 && <details className="lp-switch" key={path}>
      <summary><span className="lp-switch-mark"><Rings /></span><span className="lp-switch-name">{current?.name ?? 'Choose a team'}</span></summary>
      <ul className="lp-tree">{groups.filter(group => !folded(groups, closed, group, above)).map(group => <li key={group.handle}><Link href={`${groupPath(group.namespace, group.slug)}/team`} aria-current={group === current ? 'true' : undefined} style={group.depth ? { paddingLeft: 10 + group.depth * 14 } : undefined}>{group.name}<span>{group.handle}</span></Link>{fold(group)}</li>)}</ul>
    </details>}
    {namespace && <nav aria-label="Team"><p className="lp-nav-label">Team</p><ul>
      {item(`${base}/team`, 'Record', icons.record, path === `${base}/team` && tab !== 'resources')}
      {item(`${base}/team?tab=resources`, 'Resources', icons.resources, (path === `${base}/team` && tab === 'resources') || path.startsWith(`${base}/resources`))}
      {item(base, 'Members', icons.members, path === base)}
    </ul></nav>}
    <nav aria-label="You"><p className="lp-nav-label">You</p><ul>
      {item('/groups', 'Groups', icons.groups, path === '/groups')}
      {item('/groups/connections', 'Assistants', icons.assistants, path === '/groups/connections')}
      {item('/groups/reach', 'Reach', icons.reach, path === '/groups/reach')}
      {item('/groups/archive', 'How we got here', icons.archive, path === '/groups/archive')}
    </ul></nav>
    {account && <div className="lp-account">{account}</div>}
  </aside>;
}

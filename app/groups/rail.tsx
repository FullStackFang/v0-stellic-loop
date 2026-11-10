'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Rings } from './glyphs';

const icon = { viewBox: '0 0 16 16', 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const icons = {
  record: <svg {...icon}><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M2.5 6.5h11M6.5 6.5v7" /></svg>,
  resources: <svg {...icon}><path d="M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12M6 8h4M6 10.5h4" /></svg>,
  members: <svg {...icon}><circle cx="6" cy="6" r="2.3" /><path d="M2 13c.4-2.2 2-3.4 4-3.4s3.6 1.2 4 3.4M10.5 4a2.2 2.2 0 0 1 0 4.2M12 9.9c1.1.5 1.8 1.5 2 3.1" /></svg>,
  groups: <svg {...icon}><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></svg>,
  assistants: <svg {...icon}><circle cx="5.5" cy="8" r="3" /><circle cx="10.5" cy="8" r="3" /></svg>,
};

/** The left rail of the team product: which team, where in it, and the signed-in account. */
export function Rail({ groups, account }: { groups: { namespace: string; name: string }[]; account: ReactNode }) {
  const path = usePathname();
  const { namespace } = useParams<{ namespace?: string }>();
  const current = groups.find(group => group.namespace === namespace);
  const item = (href: string, label: string, glyph: ReactNode, on: boolean) => <li><Link href={href} aria-current={on ? 'page' : undefined}>{glyph}{label}</Link></li>;
  const base = `/groups/${namespace}`;
  return <aside className="lp-rail">
    <Link href="/groups" className="lp-wordmark"><Rings /><span>Loop</span></Link>
    {groups.length > 0 && <details className="lp-switch" key={path}>
      <summary><span className="lp-switch-mark"><Rings /></span><span className="lp-switch-name">{current?.name ?? 'Choose a team'}</span></summary>
      <ul>{groups.map(group => <li key={group.namespace}><Link href={`/groups/${group.namespace}/team`} aria-current={group.namespace === namespace ? 'true' : undefined}>{group.name}<span>@{group.namespace}</span></Link></li>)}</ul>
    </details>}
    {namespace && <nav aria-label="Team"><p className="lp-nav-label">Team</p><ul>
      {item(`${base}/team`, 'Record', icons.record, path === `${base}/team`)}
      {item(`${base}/resources`, 'Resources', icons.resources, path.startsWith(`${base}/resources`))}
      {item(base, 'Members', icons.members, path === base)}
    </ul></nav>}
    <nav aria-label="You"><p className="lp-nav-label">You</p><ul>
      {item('/groups', 'Groups', icons.groups, path === '/groups')}
      {item('/groups/connections', 'Assistants', icons.assistants, path === '/groups/connections')}
    </ul></nav>
    {account && <div className="lp-account">{account}</div>}
  </aside>;
}

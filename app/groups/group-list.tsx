'use client';

import Link from 'next/link';
import { ViewTransition } from 'react';
import { ActionForm } from '@/components/emba/portal-forms';
import { Arrow, Rings } from '@/components/LoopGlyphs';
import { groupPictureSrc } from '@/lib/emba/group-picture-src';
import { folded, toggleGroup, useClosedGroups } from './collapse';
import { archiveGroupAction, renameGroupAction } from './organize-actions';
import './group-picture.css';

/** A row of the Groups page, in tree order. */
export type ListGroup = {
  id: string; parent: string | null; orgId: string; depth: number; name: string; handle: string; href: string;
  /** The person runs it: they may rename it. */
  canRename: boolean;
  /** The person may archive it. */
  canArchive: boolean;
  /** The picture the group wears, when one has been drawn and kept. */
  picture?: string;
};
const names = new Intl.ListFormat('en', { type: 'conjunction' });
const chevron = <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>;

/**
 * The person's groups as a tree. A group with groups inside it folds shut, and stays shut on the next visit.
 * Until the browser's copy of what is folded has been read, inner rows hold their place unseen, so nothing
 * opens and then closes. The people who run a group get a menu on its row: rename, and archive.
 */
export function GroupList({ groups }: { groups: ListGroup[] }) {
  const closed = useClosedGroups();
  const under = (id: string): ListGroup[] => groups.filter(group => group.parent === id).flatMap(group => [group, ...under(group.id)]);
  return <ul className="lp-list">{groups.filter(group => closed === null || !folded(groups, closed, group)).map(group => {
    const inside = under(group.id), shut = !!closed?.has(group.id);
    return <li key={group.id} className="lp-groupitem" data-wait={closed === null && group.depth > 0 ? '' : undefined}>
      <div className="lp-groupline" style={group.depth ? { paddingLeft: Math.min(group.depth, 4) * 28 } : undefined}>
        {inside.length > 0 ? <button type="button" className="lp-fold" aria-expanded={!shut} aria-label={`${shut ? 'Show' : 'Hide'} the groups inside ${group.name}`} onClick={() => toggleGroup(group.id)}>{chevron}</button> : <span className="lp-fold" aria-hidden="true" />}
        <ViewTransition name={`lp-group-${group.id}`} share="lp-morph" default="none">
          <Link className="lp-grouprow" href={group.href} data-menu={group.canRename || undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a drawing served from the database at its own address */}
            <span className={`lp-grouptile ${group.picture ? 'gp-has' : ''}`}>{group.picture ? <img src={groupPictureSrc(group.picture)} alt="" /> : <Rings />}</span>
            <div><b>{group.name}</b><span className="lp-handle">{group.handle}</span>{shut && <span className="lp-handle"> · {inside.length} inside</span>}</div>
            <span className="lp-go"><Arrow /></span>
          </Link>
        </ViewTransition>
      </div>
      {group.canRename && <details className="lp-rowmenu">
        <summary aria-label={`Manage ${group.name}`}>Manage</summary>
        <div className="lp-rowmenu-body">
          <ActionForm action={renameGroupAction} label="Rename">
            <input type="hidden" name="orgId" value={group.orgId} /><input type="hidden" name="loopId" value={group.id} />
            <label>Name<input name="name" required maxLength={200} defaultValue={group.name} /></label>
            <p>The tag {group.handle} and every link to the group stay the same.</p>
          </ActionForm>
          {group.canArchive && <details className="lp-rowmenu-archive">
            <summary>Archive</summary>
            <p>This hides <b>{group.name}</b>{inside.length > 0 && <> and the {inside.length === 1 ? 'group' : `${inside.length} groups`} inside it ({names.format(inside.map(item => item.name))})</>} from everyone, and ends assistant access given on {inside.length ? 'them' : 'it'}. Nothing is deleted. It can be restored from the Archived list on this page; assistant access is then given again by each person.</p>
            <ActionForm action={archiveGroupAction} label={`Archive ${group.name}`}>
              <input type="hidden" name="orgId" value={group.orgId} /><input type="hidden" name="loopId" value={group.id} />
            </ActionForm>
          </details>}
        </div>
      </details>}
    </li>;
  })}</ul>;
}

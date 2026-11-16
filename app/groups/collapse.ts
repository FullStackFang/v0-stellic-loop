'use client';

import { useMemo, useSyncExternalStore } from 'react';

// Which groups a person folded shut, kept in their browser and shared by the Groups page and the side menu
// (loop-organize-and-fix, design D10). The server cannot read it, so the first render knows nothing: `null`.
const KEY = 'loop.groups.closed';
const listeners = new Set<() => void>();
// Used when the browser refuses storage (a private window, say): folding still works until the page is left.
let kept = '';
const read = () => { try { return localStorage.getItem(KEY) ?? ''; } catch { return kept; } };
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => { listeners.delete(listener); window.removeEventListener('storage', listener); };
}

/** The ids of the groups folded shut, or null before the browser's copy has been read. */
export function useClosedGroups(): ReadonlySet<string> | null {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  return useMemo(() => raw === null ? null : new Set(raw.split(' ').filter(Boolean)), [raw]);
}
/** Folds a group shut, or opens it again. */
export function toggleGroup(id: string) {
  const closed = new Set(read().split(' ').filter(Boolean));
  if (!closed.delete(id)) closed.add(id);
  kept = [...closed].join(' ');
  try { localStorage.setItem(KEY, kept); } catch { /* kept in memory above */ }
  for (const listener of listeners) listener();
}
/** Whether a group is out of sight: a group above it is folded shut. `open` names groups that count as open whatever was stored. */
export function folded<T extends { id: string; parent: string | null }>(groups: T[], closed: ReadonlySet<string> | null, group: T, open?: ReadonlySet<string>): boolean {
  for (let at = groups.find(item => item.id === group.parent); at; at = groups.find(item => item.id === at!.parent)) if (closed?.has(at.id) && !open?.has(at.id)) return true;
  return false;
}

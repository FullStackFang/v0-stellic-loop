import { cache } from 'react';
import { OnYouPanel, type Going } from '@/components/campus/on-you';
import { onYouView } from '@/lib/campus/on-you';
import { campusViewer } from '@/lib/campus/session';

/**
 * What the counters are drawn from, read once per page view. A page that will draw them calls startOnYou as soon as it
 * knows someone is signed in, without waiting for it, so the read runs beside the page's own reads and not after
 * them: the counters then arrive with the page, and not seconds behind it.
 */
export const onYouRead = cache(async () => {
  const viewer = await campusViewer();
  return viewer && onYouView(viewer.principal).catch(error => { console.error('on you', error); return null; });
});
/** Starts that read and lets it run. */
export const startOnYou = () => { void onYouRead().catch(() => null); };

/**
 * The "Groups" and "On you" counters for the top bar (openspec loop-on-you). Groups is drawn for a signed-in person who is in a
 * group or is going to something this week (`going`), On you for one who is in a group; for anyone else there is nothing. It is read beside the week, never before it: the campus screen does not wait for it, and if it
 * cannot be read the screen is drawn without it.
 */
export async function OnYou({ going = [] }: { going?: Going[] } = {}) {
  if (!await campusViewer()) return null;
  const view = await onYouRead();
  return view || going.length ? <OnYouPanel view={view ?? { count: 0, items: [], more: 0, claims: [], groups: [], mine: [] }} going={going} /> : null;
}

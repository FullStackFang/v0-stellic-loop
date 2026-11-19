import { OnYouPanel } from '@/components/campus/on-you';
import { onYouView } from '@/lib/campus/on-you';
import { campusViewer } from '@/lib/campus/session';

/**
 * The "On you" counter for the top bar (openspec loop-on-you). Drawn for a signed-in person who is in a group; for anyone
 * else there is nothing. It is read beside the week, never before it: the campus screen does not wait for it, and if it
 * cannot be read the screen is drawn without it.
 */
export async function OnYou() {
  const viewer = await campusViewer();
  if (!viewer) return null;
  const view = await onYouView(viewer.principal).catch(error => { console.error('on you', error); return null; });
  return view ? <OnYouPanel view={view} /> : null;
}

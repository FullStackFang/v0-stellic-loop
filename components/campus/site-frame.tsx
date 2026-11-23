import type { ReactNode } from 'react';
import { siteBar } from '@/app/c/site-bar';
import { db } from '@/lib/db';
import { findCampus } from '@/lib/campus/listings';
import { DEFAULT_CAMPUS } from '@/lib/campus/schools';
import { campusViewer, lookingAt } from '@/lib/campus/session';
import { CampusShell } from './shell';
import '@/app/groups/campus-look.css';

/**
 * The app's one top bar and foot round a page that has neither of its own (a shared link). The bar is drawn as on the
 * Ink page: from the campus the person was last looking at, or else their own, or else the first one. If that cannot
 * be read the page is shown without them, never an error in its place.
 */
export async function SiteFrame({ back, children }: { /** Where signing in from the bar leads back to: the page it was pressed on, when not said. */ back?: string; children: ReactNode }) {
  const frame = await (async () => {
    const viewer = await campusViewer(), campus = await lookingAt() ?? viewer?.campus ?? await findCampus(db(), DEFAULT_CAMPUS);
    return campus ? siteBar({ campus, viewer, back }) : null;
  })().catch(error => { console.error('site frame', error); return null; });
  if (!frame) return <>{children}</>;
  return <CampusShell><div className="cs gb">{frame.bar}{children}{frame.foot}</div></CampusShell>;
}

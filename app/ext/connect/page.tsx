import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { extConnected, extReady } from '@/lib/campus/ext';
import { campusViewer, signInHref } from '@/lib/campus/session';
import { siteBar } from '../../c/site-bar';
import { ConnectButton } from './connect-button';
import '../../c/no-school.css';

export const dynamic = 'force-dynamic';

/** What the extension sends, in one line (design, "Students worry it tracks their browsing"). */
const SENDS = 'It sends Loopd the address of the event page you are on, only on Luma, Posh, Eventbrite and CampusGroups event pages. Nothing else.';

/**
 * Connecting the Loopd extension in this browser (openspec loopd-browser-extension, design D4): the person, signed in,
 * presses Connect and the extension is given a token of its own. Disconnect refuses every token they were given.
 */
export default async function ExtConnectPage() {
  const viewer = await campusViewer();
  if (!viewer) redirect(signInHref('/ext/connect'));
  const ready = await extReady(db()), connected = ready && await extConnected(db(), viewer.personId);
  const campus = viewer.campus, { bar, foot } = campus ? await siteBar({ campus, viewer, back: '/ext/connect' }) : { bar: null, foot: null };
  return <>
    <div className="cs">{bar}
      <div className="cs-ns"><div className="cs-ns-two">
        <section className="cs-ns-tk cs-ns-wide">
          <span className="cs-ns-tab">Browser extension</span>
          <div className="cs-ns-me"><span><b>See who you know on event pages</b><small>On Luma, Posh, Eventbrite and CampusGroups</small></span></div>
          <p>{SENDS}</p>
          {ready ? <ConnectButton connected={connected} /> : <p role="status">The browser extension is not set up yet.</p>}
        </section>
      </div></div>
    </div>
    {foot}
  </>;
}

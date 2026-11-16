import Link from 'next/link';
import { db } from '@/lib/db';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { listReachChoices } from '@/lib/emba/reach';
import { ActionForm } from '@/components/emba/portal-forms';
import { REACH_LABEL } from '@/components/emba/reach-control';
import { saveReachChoice } from '../reach-actions';

export const dynamic = 'force-dynamic';
export default async function ReachPage() {
  const principal = await getPortalPrincipal();
  if (!principal) return <section className="lt-editor"><h1>How groups reach you</h1><p>Sign in to choose.</p><Link href={`/groups/sign-in?redirect_url=${encodeURIComponent('/groups/reach')}`}>Sign in</Link></section>;
  let mine;
  try { mine = await listReachChoices(db(), principal); }
  catch { return <section className="lt-editor"><h1>How groups reach you</h1><p role="alert">Your membership or session may have changed.</p></section>; }
  // WhatsApp can be chosen only once the member's own message has linked their number.
  const ways = (['email', 'assistant', 'whatsapp', 'none'] as const).filter(way => way !== 'whatsapp' || mine.whatsapp === 'linked');
  return <>
    <h1>How groups reach you</h1>
    <p>Each group reaches you one way, for the questions it asks its members and the announcements an organizer chooses to send. Whatever you choose, everything stays on the site and in your assistant.{mine.email && <> Email goes to {mine.email}.</>}</p>
    {mine.teams.length === 0 ? <p>You are not in a group yet.</p> : mine.teams.map(team => <section className="lt-editor" key={team.loopId}>
      <h2>{team.name}</h2><p className="lp-handle">{team.handle}</p>
      <ActionForm action={saveReachChoice} label="Save">
        <input type="hidden" name="orgId" value={team.orgId} /><input type="hidden" name="loopId" value={team.loopId} />
        <label>This group reaches me<select name="way" defaultValue={team.way}>{ways.map(way => <option key={way} value={way}>{REACH_LABEL[way]}</option>)}</select></label>
      </ActionForm>
    </section>)}
  </>;
}

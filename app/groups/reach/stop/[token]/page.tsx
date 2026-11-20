import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { stopLinkPreview } from '@/lib/emba/reach';
import { ActionForm } from '@/components/emba/portal-forms';
import { stopGroupMessages } from '../../../reach-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Stop messages · Loopd', robots: { index: false, follow: false }, referrer: 'no-referrer' };

// Opening this page changes nothing, because mail scanners and chat previews
// open links. The one button does it. Nobody is signed in by the link, and the
// page shows only the group's name.
export default async function StopPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = await stopLinkPreview(db(), token);
  if (!target) return <section className="lt-editor"><h1>This link no longer works</h1><p>You can choose how each group reaches you on the Reach page after signing in.</p></section>;
  return <section className="lt-editor"><h1>Stop messages from {target.group}</h1>
    <p>{target.group} will send you nothing further. Your other groups are unchanged, and everything stays on the site and in your assistant.</p>
    <ActionForm action={stopGroupMessages} label="Stop messages from this group"><input type="hidden" name="token" value={token} /></ActionForm>
  </section>;
}

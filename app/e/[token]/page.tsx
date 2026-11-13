import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ZodError } from 'zod';
import { db } from '@/lib/db';
import { EmbaError } from '@/lib/emba/errors';
import { canAccessLoop } from '@/lib/emba/access';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { eventShare, type EventOutside } from '@/lib/emba/team-interest';
import { ActionForm } from '@/components/emba/portal-forms';
import { EventCard } from '@/components/emba/event-card';
import { joinFromShareLink } from '@/app/groups/request-actions';

export const dynamic = 'force-dynamic';
const robots = { index: false, follow: false };
const when = (outside: EventOutside) => `${outside.starts}${outside.ends ? ` to ${outside.ends}` : ''} (${outside.timezone})`;
/** The share page and its link preview read the same thing for anyone outside the group: the event's facts, and a count only at five or more. */
const outsideLine = (outside: EventOutside) => [when(outside), outside.place, outside.interested === null ? null : `${outside.interested} interested`].filter(Boolean).join(' · ');
const load = (principal: Awaited<ReturnType<typeof getPortalPrincipal>>, token: string) => eventShare(db(), principal, token).catch(error => { if (error instanceof ZodError || (error instanceof EmbaError && error.code === 'not_found')) return null; throw error; });

// The preview is built from the outside view alone: a null principal can never be shown the member view.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const share = await load(null, (await params).token);
  if (!share) return { robots };
  const { outside } = share, title = `${outside.name} · ${outside.group}`, description = outsideLine(outside);
  return { title, description, robots, openGraph: { title, description }, twitter: { card: 'summary', title, description } };
}

export default async function SharedEventPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const principal = await getPortalPrincipal();
  const share = await load(principal, token);
  if (!share) notFound();
  const { outside } = share;
  const head = <><p className="lp-handle">{outside.group}</p><h1>{outside.name}</h1></>;
  if (share.view === 'member') {
    const { scope, detail, namespace } = share;
    const canPost = await db().tx(q => canAccessLoop(q, principal, scope.orgId, scope.loopId, 'post'));
    return <div className="lp"><main className="lp-main lt-share"><div className="lp-wrap">
      <section className="lt-editor"><p className="lp-handle">{outside.group}</p><p className="emba-meta">Times are in {detail.timezone}.</p>
        <EventCard as="div" event={detail.event} scope={scope} route="share_link" canPost={canPost} />
        <p><Link href={`/groups/${namespace}/team?tab=events`}>Open the team page</Link></p></section>
    </div></main></div>;
  }
  const { join, signedIn } = share;
  return <div className="lp"><main className="lp-main lt-share"><div className="lp-wrap">
    <section className="lt-editor">{head}<p>{when(outside)}</p>{outside.place && <p>{outside.place}</p>}{outside.interested !== null && <p>{outside.interested} members are interested.</p>}</section>
    <section className="lt-editor">{!signedIn
      ? <>{clerkPortalConfigured() ? <p>Sign in to join this group. <Link href={`/groups/sign-in?redirect_url=${encodeURIComponent(`/e/${token}`)}`}>Sign in</Link></p> : <p role="status">Sign-in is not configured for this deployment.</p>}</>
      : join === null ? <p>This group is not taking join requests from this link. Ask an organizer to add you.</p>
        : join.requested ? <p role="status">Request sent</p>
          : <ActionForm action={joinFromShareLink} label={join.mode === 'admit' ? 'Join group' : 'Request to join'}><input type="hidden" name="kind" value="event" /><input type="hidden" name="token" value={token} /></ActionForm>}
    </section>
  </div></main></div>;
}

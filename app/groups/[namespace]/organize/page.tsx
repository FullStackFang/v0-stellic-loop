import Link from 'next/link';
import { db } from '@/lib/db';
import { groupPath, type GroupRoute } from '@/lib/emba/group-path';
import { Crumbs } from '@/app/groups/group-nav';
import { getPortalPrincipal, openGroup } from '@/lib/emba/portal-session';
import { sendingOn } from '@/lib/emba/reach-send';
import { listAsks } from '@/lib/emba/team-asks';
import { interestByDay } from '@/lib/emba/team-organize';
import { ActionForm } from '@/components/emba/portal-forms';
import { askPath } from '@/components/emba/ask-parts';
import { announceToTeam } from '@/app/groups/team-actions';

export const dynamic = 'force-dynamic';
const unavailable = <section className="lt-editor"><h1>Organizer view unavailable</h1><p role="alert">This page is for the group&apos;s owners and organizers.</p></section>;

// For owners and organizers: how interest in each event is building, how each
// open ask is filling, and the announcement form. Counts only. Who has not
// answered stays inside each ask.
export default async function OrganizePage({ params }: { params: Promise<GroupRoute> }) {
  const principal = await getPortalPrincipal();
  const route = await params, base = groupPath(route.namespace, route.slug);
  if (!principal) return <section className="lt-editor"><h1>Organizer view unavailable</h1><Link href={`/groups/sign-in?redirect_url=${encodeURIComponent(`${base}/organize`)}`}>Sign in</Link></section>;
  const opened = await openGroup(principal, route, scope => Promise.all([interestByDay(db(), principal, scope), listAsks(db(), principal, scope)])).catch(() => null);
  if (!opened) return unavailable;
  const { group, scope, data: [interest, asks] } = opened;
  return <>
    <Crumbs trail={group.trail} here="Organize" /><h1>Organize</h1>
    <section className="lt-editor"><h2>Interest in upcoming events</h2><p className="emba-meta">Members interested on each day, in {interest.timezone}. Up to the last 14 days.</p>
      {interest.events.length ? interest.events.map(event => <div key={event.slug}><h3>{event.name}</h3><p>{event.starts ? `${event.starts} · ` : ''}{event.interested} interested now</p>
        <table><caption className="emba-meta">Interested, by day</caption><thead><tr>{event.days.map(day => <th key={day.day} scope="col">{day.day.slice(5)}</th>)}</tr></thead><tbody><tr>{event.days.map(day => <td key={day.day}>{day.count}</td>)}</tr></tbody></table></div>)
        : <p className="lp-empty">No upcoming events.</p>}</section>
    <section className="lt-editor"><h2>Open asks</h2>
      {asks.open.items.length ? <ul className="lp-plain">{asks.open.items.map(ask => <li key={ask.number}><Link href={askPath(ask)}>{ask.question}</Link><p className="emba-meta">{ask.answered} of {ask.expected} answered · closes {ask.closes}</p></li>)}</ul> : <p className="lp-empty">No open asks.</p>}</section>
    <section className="lt-editor"><h2>Announce</h2>
      <ActionForm action={announceToTeam} label="Post announcement"><input type="hidden" name="orgId" value={scope.orgId} /><input type="hidden" name="loopId" value={scope.loopId} />
        <label>Announcement (at most 600 characters)<textarea name="text" required maxLength={600} /></label>
        {sendingOn() ? <><label className="lt-check"><input type="checkbox" name="send" value="true" />Send to members</label><p>Ticked, it also goes to each member the way they chose, and to nobody who chose not to be messaged.</p></> : <p>It appears in the brief and in what is new. No message is sent to anyone.</p>}
      </ActionForm></section>
    <p><Link href={`${base}/team`}>Back to the record</Link></p>
  </>;
}

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { dayNum, mon } from '@/lib/days';
import { getSignedInPrincipal } from '@/lib/emba/portal-session';
import { signInHref } from '@/lib/campus/session';
import { facesOf } from '@/lib/when/faces';
import type { Person } from '@/lib/when/polls';
import { seriesView } from '@/lib/when/repeat';
import { slotLabel } from '@/lib/when/slots';
import { repeatPollAction } from '../../actions';
import { Panel, Seats, Stack, Ticket, Tile, type Shown } from '../../parts';

export const metadata: Metadata = { title: 'Ask the group again · Loopd', robots: { index: false } };

// Loopd When, "Again": the same plan a week on, for the people who came before. Only they may open it.
export default async function AgainPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, who = await getSignedInPrincipal();
  if (!who) redirect(signInHref(`/when/${id}/again`));
  const view = await seriesView(db(), who, id);
  if (!view || !view.poll.chosen) notFound();
  const faces = await facesOf(db(), view.people.map(each => each.personId)), zone = view.poll.frame.timezone;
  const shown = (each: Person): Shown => ({ ...each, face: faces.get(each.personId) ?? '/animals/01.webp' });
  const span = `${dayNum(view.next.startDate)}${mon(view.next.startDate) === mon(view.next.endDate) ? '' : ` ${mon(view.next.startDate)}`} to ${dayNum(view.next.endDate)} ${mon(view.next.endDate)}`;
  return <main className="wn">
    <Ticket tile={<Tile top="Next" big={`${dayNum(view.next.startDate)} ${mon(view.next.startDate)}`} />} stub={<><Seats people={view.people.map(shown)} size={view.people.length} me={who.personId} /><span><b>{view.poll.title}</b></span></>}>
      <h1 className="xl">Same time <em>next week?</em></h1>
    </Ticket>
    {view.usual.length > 0 && <Panel tab="Your usual times"><div className="wn-chips">{view.usual.map(label => <span key={label} className="cs-pill hot">{label}</span>)}</div></Panel>}
    <Panel tab="Past sessions"><ul className="wn-rows">{view.past.map(session => {
      const label = slotLabel(session.at, zone);
      return <li key={session.id}><Tile met={session.id === view.past[0].id} top={label.month} big={String(label.date)} /><span><b>{label.dow}, {label.time}</b><small>{session.in.length} of {session.size} could make it</small></span><Stack people={session.in.map(shown)} /></li>;
    })}</ul></Panel>
    <form action={repeatPollAction}><input type="hidden" name="pollId" value={view.poll.id} /><button className="cs-btn go wn-big" type="submit">Ask the group again</button></form>
    <p className="wn-note">Makes a poll for {span} with everyone&apos;s usual times filled in.</p>
  </main>;
}

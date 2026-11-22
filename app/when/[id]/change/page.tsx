import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getSignedInPrincipal } from '@/lib/emba/portal-session';
import { signInHref } from '@/lib/campus/session';
import { pollView } from '@/lib/when/polls';
import { slotLabel } from '@/lib/when/slots';
import { Ticket } from '../../parts';
import { CreateForm } from '../../new/create-form';

export const metadata: Metadata = { title: 'Edit the poll · Loopd', robots: { index: false } };

// Loopd When, "Edit the poll": the plan of an open poll, for its organizer to change. Once the time is set there is nothing to change.
export default async function ChangeWhenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, who = await getSignedInPrincipal();
  if (!who) redirect(signInHref(`/when/${id}/change`));
  const view = await pollView(db(), who, id);
  if (!view || !view.isOrganizer) notFound();
  if (view.chosen) redirect(`/when/${view.id}`);
  const today = new Date().toISOString().slice(0, 10), by = slotLabel(view.deadline, view.frame.timezone).day, n = view.answered.length;
  return <main className="wn wn-make">
    <CreateForm signIn={null} today={today} edit={view.id}
      head={<Ticket stub={n ? `${n} of ${view.size} have answered. Their times stay where the days and hours still fit.` : 'Nobody has answered yet, so nothing is lost.'}><h1 className="xl">Change <em>the poll.</em></h1></Ticket>}
      first={{ title: view.title, startDate: view.frame.startDate, endDate: view.frame.endDate, hourStart: String(view.frame.hourStart), hourEnd: String(view.frame.hourEnd), expectedSize: String(view.size),
        by: by > today ? by : today, threshold: view.threshold, weekends: view.frame.weekends === false ? '0' : '1', duration: String(view.minutes) }} />
  </main>;
}

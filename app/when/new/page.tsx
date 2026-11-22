import type { Metadata } from 'next';
import { addDays } from '@/lib/days';
import { isWeekend } from '@/lib/when/slots';
import { getSignedInPrincipal } from '@/lib/emba/portal-session';
import { signInHref } from '@/lib/campus/session';
import { Ticket } from '../parts';
import { CreateForm } from './create-form';

export const metadata: Metadata = { title: 'Find a time · Loopd', description: 'One link. Everyone paints the times they can make, and you pick the one that works.' };

// Loopd When, screen 1: the plan for a poll. Signed out, the form is all there and the action is to sign in.
export default async function NewWhenPage() {
  const who = await getSignedInPrincipal(), today = new Date().toISOString().slice(0, 10);
  // Weekends start left out, so the days offered first are weekdays: from three days on, to the Friday of a five day run.
  let startDate = addDays(today, 3), endDate: string;
  while (isWeekend(startDate)) startDate = addDays(startDate, 1);
  for (endDate = addDays(startDate, 4); isWeekend(endDate);) endDate = addDays(endDate, -1);
  return <main className="wn wn-two">
    <CreateForm signIn={who ? null : signInHref('/when/new')} today={today}
      head={<Ticket stub="One link. It tells you when a time works, and you pick."><h1 className="xl">Find a time that works for <em>everyone.</em></h1></Ticket>}
      first={{ title: '', startDate, endDate, hourStart: '17', hourEnd: '22', expectedSize: '7', by: addDays(today, 2), threshold: 'two_thirds', weekends: '0' }} />
  </main>;
}

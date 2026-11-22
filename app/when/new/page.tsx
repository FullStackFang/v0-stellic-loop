import type { Metadata } from 'next';
import { addDays } from '@/lib/days';
import { getSignedInPrincipal } from '@/lib/emba/portal-session';
import { signInHref } from '@/lib/campus/session';
import { Ticket } from '../parts';
import { CreateForm } from './create-form';

export const metadata: Metadata = { title: 'Find a time · Loopd', description: 'One link. Everyone paints the times they can make, and you pick the one that works.' };

// Loopd When, screen 1: the plan for a poll. Signed out, the form is all there and the action is to sign in.
export default async function NewWhenPage() {
  const who = await getSignedInPrincipal(), today = new Date().toISOString().slice(0, 10);
  return <main className="wn">
    <Ticket stub="One link. It tells you when a time works, and you pick."><h1 className="xl">Find a time that works for <em>everyone.</em></h1></Ticket>
    <CreateForm signIn={who ? null : signInHref('/when/new')}
      first={{ title: '', startDate: addDays(today, 3), endDate: addDays(today, 7), hourStart: '17', hourEnd: '22', expectedSize: '7', by: `${addDays(today, 2)}T18:00`, threshold: 'two_thirds' }} />
  </main>;
}

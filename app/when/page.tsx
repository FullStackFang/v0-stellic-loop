import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { dayNum, mon } from '@/lib/days';
import { getSignedInPrincipal } from '@/lib/emba/portal-session';
import { signInHref } from '@/lib/campus/session';
import { myPolls, type PollLine } from '@/lib/when/polls';
import { meetingSpan } from '@/lib/when/send';
import { slotLabel } from '@/lib/when/slots';
import { Panel, Ticket, Tile } from './parts';

export const metadata: Metadata = { title: 'Your polls · Loopd', robots: { index: false } };

function Line({ poll }: { poll: PollLine }) {
  const set = poll.chosenSlot ? slotLabel(poll.chosenSlot, poll.timezone) : null, by = slotLabel(poll.deadline, poll.timezone);
  const [pill, look] = set ? ['Set', ' yes'] : poll.isOrganizer && poll.ready ? ['Pick the time', ' hot'] : !poll.mine ? ['Add your times', ' hot'] : ['Open', ''];
  return <a href={`/when/${poll.id}`}>
    {set ? <Tile met top={set.dow} big={`${set.date} ${set.month}`} /> : <Tile top="From" big={`${dayNum(poll.startDate)} ${mon(poll.startDate)}`} />}
    <span><b>{poll.title}</b><small>{set ? `${set.dow} ${set.date} ${set.month}, ${meetingSpan({ at: poll.chosenSlot!, minutes: poll.durationMin }, poll.timezone)}`
      : `${poll.isOrganizer ? '' : `${poll.organizerName} asked · `}${poll.answered} of ${poll.size} answered · by ${by.dow} ${by.date} ${by.month}`}</small></span>
    <span className={`cs-pill${look}`}>{pill}</span>
  </a>;
}

// Loopd When, "Your polls": the ones you made and the ones you have an answer in, so a poll is found without its link.
export default async function WhenListPage() {
  const who = await getSignedInPrincipal();
  if (!who) redirect(signInHref('/when'));
  const polls = await myPolls(db(), who), open = polls.filter(poll => poll.status === 'open'), set = polls.filter(poll => poll.status === 'sent');
  return <main className="wn">
    <Ticket stub="The ones you made, and the ones you answered."><h1 className="xl">Your <em>polls.</em></h1></Ticket>
    {polls.length === 0 && <Panel tab="No polls yet"><p className="wn-msg">Make one and pass on its link. It shows up here.</p></Panel>}
    {open.length > 0 && <Panel tab="Open"><div className="wn-picks wn-list">{open.map(poll => <Line key={poll.id} poll={poll} />)}</div></Panel>}
    {set.length > 0 && <Panel tab="Time is set"><div className="wn-picks wn-list">{set.map(poll => <Line key={poll.id} poll={poll} />)}</div></Panel>}
    <Link className="cs-btn go wn-big" href="/when/new">Find a time</Link>
  </main>;
}

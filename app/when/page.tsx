import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { dayNum, mon } from '@/lib/days';
import { getSignedInPrincipal } from '@/lib/emba/portal-session';
import { signInHref } from '@/lib/campus/session';
import { groupPictureMap } from '@/lib/emba/group-picture';
import { groupPictureSrc } from '@/lib/emba/group-picture-src';
import { groupsOfPolls, type PollTag } from '@/lib/when/groups';
import { myPolls, type PollLine } from '@/lib/when/polls';
import { meetingSpan } from '@/lib/when/send';
import { slotLabel } from '@/lib/when/slots';
import { Panel, Ticket, Tile } from './parts';

export const metadata: Metadata = { title: 'Your polls · Loopd', robots: { index: false } };

/** The group a poll is for, on its line: the group's picture and name, or "No group" for a poll made on its own. */
function GroupTag({ tag, picture }: { tag: PollTag | null; picture?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a drawing served from the database at its own address
  return tag ? <span className="wn-gtag">{picture && <img src={groupPictureSrc(picture)} alt="" />}{tag.name}</span> : <span className="wn-gtag solo">No group</span>;
}

function Line({ poll, tag }: { poll: PollLine; tag?: ReactNode }) {
  const set = poll.chosenSlot ? slotLabel(poll.chosenSlot, poll.timezone) : null, by = slotLabel(poll.deadline, poll.timezone);
  const [pill, look] = set ? ['Set', ' yes'] : poll.isOrganizer && poll.ready ? ['Pick the time', ' hot'] : !poll.mine ? ['Add your times', ' hot'] : ['Open', ''];
  return <a href={`/when/${poll.id}`}>
    {set ? <Tile met top={set.dow} big={`${set.date} ${set.month}`} /> : <Tile top="From" big={`${dayNum(poll.startDate)} ${mon(poll.startDate)}`} />}
    <span><b>{poll.title}</b><small>{tag}{set ? `${set.dow} ${set.date} ${set.month}, ${meetingSpan({ at: poll.chosenSlot!, minutes: poll.durationMin }, poll.timezone)}`
      : `${poll.isOrganizer ? '' : `${poll.organizerName} asked · `}${poll.answered} of ${poll.size} answered · by ${by.dow} ${by.date} ${by.month}`}</small></span>
    <span className={`cs-pill${look}`}>{pill}</span>
  </a>;
}

/** The key of the chip for polls made on their own. No group's ref can be it: a ref never starts with "_". */
const SOLO = '_none';

// Loopd When, "Your polls": the ones you made and the ones you have an answer in, so a poll is found without its link.
// Each line names the group it is for, and ?group= narrows the list to one group (public/demo/mockups-group-polls.html).
// A group's own page lists its polls itself and never sends anyone here.
export default async function WhenListPage({ searchParams }: { searchParams?: Promise<{ group?: string | string[] }> } = {}) {
  const who = await getSignedInPrincipal();
  if (!who) redirect(signInHref('/when'));
  const all = await myPolls(db(), who), tags = await groupsOfPolls(db(), who, all.map(poll => poll.id));
  const pictures = await groupPictureMap(db(), [...new Set([...tags.values()].flatMap(tag => tag ? [tag.loopId] : []))]);
  // A poll whose group the viewer cannot read has no entry in `tags`: it is listed under All, with no group named.
  const keyOf = (poll: PollLine) => tags.has(poll.id) ? tags.get(poll.id)?.ref ?? SOLO : null;
  const chips = new Map<string, { label: string; count: number }>();
  for (const poll of all) { const key = keyOf(poll); if (!key) continue;
    const chip = chips.get(key) ?? { label: tags.get(poll.id)?.name ?? 'No group', count: 0 }; chip.count += 1; chips.set(key, chip); }
  const wanted = (await searchParams)?.group, only = typeof wanted === 'string' && chips.has(wanted) ? wanted : null;
  const polls = only ? all.filter(poll => keyOf(poll) === only) : all;
  const open = polls.filter(poll => poll.status === 'open'), set = polls.filter(poll => poll.status === 'sent');
  const line = (poll: PollLine) => { const tag = tags.get(poll.id);
    return <Line key={poll.id} poll={poll} tag={tags.has(poll.id) && <GroupTag tag={tag ?? null} picture={tag ? pictures[tag.loopId] : undefined} />} />; };
  const chip = (key: string | null, label: string, count: number) => <Link key={key ?? 'all'} className="cs-pill" href={key ? `/when?group=${encodeURIComponent(key)}` : '/when'} aria-current={key === only ? 'page' : undefined}>{label}<em>{count}</em></Link>;
  return <main className="wn">
    <Ticket stub={chips.size > 1 ? <nav className="wn-chips wn-only" aria-label="Narrow to one group">{chip(null, 'All', all.length)}{[...chips].map(([key, { label, count }]) => chip(key, label, count))}</nav> : 'The ones you made, and the ones you answered.'}><h1 className="xl">Your <em>polls.</em></h1></Ticket>
    {polls.length === 0 && <Panel tab="No polls yet"><p className="wn-msg">Make one and pass on its link. It shows up here.</p></Panel>}
    {open.length > 0 && <Panel tab="Open"><div className="wn-picks wn-list">{open.map(line)}</div></Panel>}
    {set.length > 0 && <Panel tab="Time is set"><div className="wn-picks wn-list">{set.map(line)}</div></Panel>}
    <Link className="cs-btn go wn-big" href="/when/new">Find a time</Link>
  </main>;
}

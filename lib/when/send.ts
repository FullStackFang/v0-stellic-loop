import { z } from 'zod';
import type { Db } from '../db';
import { feedIcs, memberInviteIcs, type CalendarEntry } from '../ics';
import { appUrl } from '../url';
import { notify } from './notify';
import { POLL_ID, WhenError, answersOf, frameOf, logEvent, pollRow, read, type PollView, type Who } from './polls';
import { DURATIONS, START_MINUTES, slotLabel, slotsOf, spanText } from './slots';

// Loopd When: the organizer picks the time and sends it. Nothing goes to the group until they do.

const Send = z.object({
  pollId: z.string().regex(POLL_ID),
  slot: z.string().max(40).refine(value => !Number.isNaN(Date.parse(value))).transform(value => new Date(value).toISOString()),
  note: z.string().transform(value => value.replace(/\s+/g, ' ').trim()).pipe(z.string().max(200)).optional(),
  /** How far into the picked hour it starts, and how long it runs. */
  minute: z.coerce.number().refine(value => START_MINUTES.includes(value)).default(0),
  duration: z.coerce.number().refine(value => DURATIONS.includes(value)).default(60),
});

/**
 * Sets the poll's time and queues the invite for everyone who answered, and for the organizer. Only the organizer may,
 * once anyone has answered, and once: `sent: false` means it had already gone, and nothing more is queued.
 */
export async function sendPoll(db: Db, who: Who, input: unknown, now = new Date()): Promise<{ sent: boolean }> {
  const send = read(Send, input);
  return db.tx(async q => {
    const poll = await pollRow(q, send.pollId, true);
    if (!poll) throw new WhenError('not_found');
    if (poll.organizerId !== who.personId) throw new WhenError('forbidden');
    if (poll.status !== 'open') return { sent: false };
    const answered = (await answersOf(q, poll.id)).filter(answer => !answer.draft);
    if (!answered.length || !slotsOf(frameOf(poll)).some(slot => slot.at === send.slot)) throw new WhenError('invalid');
    await q.query(`update when_poll set status='sent',chosen_slot=$2,note=$3,sent_at=$4,sent_via='loopd',duration_min=$5 where id=$1`, [poll.id, new Date(Date.parse(send.slot) + send.minute * 60_000).toISOString(), send.note || null, now.toISOString(), send.duration]);
    for (const personId of new Set([poll.organizerId, ...answered.map(answer => answer.personId)])) await notify(q, poll.id, personId, 'invite', now);
    await logEvent(q, 'poll_sent', poll, { personId: who.personId });
    return { sent: true };
  });
}

/** "Tuesday 1 Dec at 7 pm", on the poll's own clock. */
export function whenText(at: string, timezone: string): string {
  const label = slotLabel(at, timezone);
  return `${label.dowLong} ${label.date} ${label.month} at ${label.time}`;
}
/** "Friday 27 Nov": a deadline is a day, and closes when that day ends. */
export function dayText(at: string, timezone: string): string {
  const label = slotLabel(at, timezone);
  return `${label.dowLong} ${label.date} ${label.month}`;
}
/** "7:15 to 8 pm": the meeting that was set. */
export function meetingSpan(chosen: { at: string; minutes: number }, timezone: string): string {
  const label = slotLabel(chosen.at, timezone);
  return spanText(label.hour * 60 + label.minute, chosen.minutes);
}
export const pollUrl = (id: string) => appUrl(`/when/${id}`);

const host = () => { try { return new URL(process.env.NEXT_PUBLIC_APP_URL ?? '').hostname || 'loopd'; } catch { return 'loopd'; } };
function entryOf(view: PollView): CalendarEntry | null {
  if (!view.chosen) return null;
  return { uid: `when-${view.id}@${host()}`, sequence: 0, start: new Date(view.chosen.at), end: new Date(Date.parse(view.chosen.at) + view.chosen.minutes * 60_000), summary: view.title, location: null,
    description: [view.chosen.note, `Set by ${view.organizer.name} on Loopd.`].filter(Boolean).join('\n'), url: pollUrl(view.id) };
}
/**
 * The poll's hour as a calendar file, or null until the time is set. With `to` it is the invite emailed to that one
 * person, from `from`; without, the file behind "Add to my calendar", which names nobody.
 */
export function pollIcs(view: PollView, mail?: { to: string; from: string }, now = new Date()): string | null {
  const entry = entryOf(view);
  if (!entry) return null;
  return mail ? memberInviteIcs({ method: 'REQUEST', entry, organizer: mail.from, attendee: mail.to, now }) : feedIcs({ name: view.title, entries: [entry], now });
}

/**
 * The words the organizer passes on by hand: to get answers while it is open, to tell the rest once it is set.
 * Three short lines, the link alone on the last: a chat app then draws the poll's picture under it (app/when/[id]/opengraph-image.tsx).
 */
export function shareMessage(view: PollView): string {
  if (view.chosen) return `${view.title} is on: ${dayText(view.chosen.at, view.frame.timezone)}, ${meetingSpan(view.chosen, view.frame.timezone)}.\nAdd it to your calendar:\n${pollUrl(view.id)}`;
  return `${view.title}\nWhen can you make it? Add your times by ${dayText(view.deadline, view.frame.timezone)}.\n${pollUrl(view.id)}`;
}

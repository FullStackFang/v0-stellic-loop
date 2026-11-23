import type { Db } from '../db';
import type { Mail, Sender } from '../email/resend';
import { appUrl } from '../url';
import { renderWhenEmail } from './emails';
import type { MessageKind } from './notify';
import { logEvent, markReady, pollRow, pollView } from './polls';
import { pollIcs } from './send';

// Loopd When's scheduled run (app/api/cron/when, every 15 minutes), and the same run for one poll straight after its
// organizer presses send. It tells organizers whose deadline has passed, queues reminders, and sends what is queued.

export const whenSendingOn = (env: Record<string, string | undefined> = process.env) => env.WHEN_SENDING === 'on';
/** How messages leave. `email` is null when there is no provider: then nothing is sent and nothing is marked failed. */
export type Carrier = { address: (personId: string) => Promise<string | null>; email: Sender | null; from?: string };
export type DrainResult = { readied: number; queued: number; sent: number; failed: number; retrying: number };

const ATTEMPTS = 4, BATCH = 50, CLAIM_MS = 120_000, STALE_MS = 3 * 86_400_000;
const cleanName = (name: string) => name.replace(/["<>\r\n\\]/g, '').trim() || 'Loopd';
type Queued = { id: string; pollId: string; personId: string; name: string; kind: MessageKind; attempts: number; stale: boolean };

export async function drainWhen(db: Db, carrier: Carrier, o: { now?: Date; pollId?: string; budgetMs?: number } = {}): Promise<DrainResult> {
  const now = o.now ?? new Date(), at = now.toISOString(), only = o.pollId ?? null, stopAt = Date.now() + (o.budgetMs ?? 45_000);
  const result: DrainResult = { readied: 0, queued: 0, sent: 0, failed: 0, retrying: 0 };

  // 1. A poll whose deadline has passed with an answer in is ready, met or not. One with no answer never will be, and is not looked at again.
  const { rows: due } = await db.query<{ id: string }>(`select id from when_poll where status='open' and ready_at is null and deadline<=$1 and ($2::text is null or id=$2)
    and exists(select 1 from when_answer a where a.poll_id=when_poll.id and not a.draft and cardinality(a.slots)>0) order by deadline limit 200`, [at, only]);
  for (const { id } of due) if (await db.tx(async q => { const poll = await pollRow(q, id, true); return poll ? markReady(q, poll, now) : false; })) result.readied++;

  // 2. A poll that was ready before its deadline and is still not sent gets one more word to its organizer.
  const { rows: late } = await db.query(`insert into when_message(poll_id,person_id,kind,created_at) select id,organizer_id,'deadline',$1::timestamptz from when_poll
    where status='open' and ready_at is not null and ready_at<deadline and deadline<=$1 and ($2::text is null or id=$2) on conflict(poll_id,person_id,kind) do nothing returning id`, [at, only]);
  result.queued += late.length;

  // 3. Reminders, 48 and 24 hours before the deadline, to people of the series who have not answered this poll and
  // have not stopped them. A first poll has no people yet, so it reminds nobody.
  for (const [kind, from, to] of [['reminder_48', 24, 48], ['reminder_24', 0, 24]] as const) {
    const { rows } = await db.query(`insert into when_message(poll_id,person_id,kind,created_at)
      select w.id,m.person_id,$1,$2::timestamptz from when_poll w
       join lateral (select distinct a.person_id from when_answer a join when_poll s on s.id=a.poll_id where s.series_id=w.series_id and not a.draft) m on true
      where w.status='open' and w.deadline>$2::timestamptz+make_interval(hours=>$3) and w.deadline<=$2::timestamptz+make_interval(hours=>$4) and ($5::text is null or w.id=$5)
       and m.person_id<>w.organizer_id
       and not exists(select 1 from when_answer mine where mine.poll_id=w.id and mine.person_id=m.person_id and (not mine.draft or mine.reminders_off))
      on conflict(poll_id,person_id,kind) do nothing returning id`, [kind, at, from, to, only]);
    result.queued += rows.length;
  }

  // 4. Send what is queued, one at a time: claimed first, so two runs never send the same message.
  const from = carrier.from ?? process.env.WHEN_FROM;
  // Without the site's address every link in a message would lead nowhere, the stop link included.
  if (!carrier.email || !from || !appUrl('/').startsWith('https://')) return result;
  const { rows: waiting } = await db.query<{ id: string }>(`select id from when_message where state='queued' and (claimed_at is null or claimed_at<$1) and ($2::text is null or poll_id=$2) order by created_at,id limit $3`,
    [new Date(now.getTime() - CLAIM_MS).toISOString(), only, BATCH]);
  const finish = (id: string, sql: string, values: unknown[] = []) => db.query(`update when_message set ${sql} where id=$1`, [id, ...values]);
  for (const { id } of waiting) {
    if (Date.now() > stopAt) break;
    const { rows: [row] } = await db.query<Queued>(`update when_message m set claimed_at=$2,attempts=attempts+1 from person p
      where m.id=$1 and p.id=m.person_id and m.state='queued' and (m.claimed_at is null or m.claimed_at<$3)
      returning m.id,m.poll_id as "pollId",m.person_id as "personId",p.name,m.kind,m.attempts,m.created_at<$4 as stale`, [id, at, new Date(now.getTime() - CLAIM_MS).toISOString(), new Date(now.getTime() - STALE_MS).toISOString()]);
    if (!row) continue;
    const again = async () => { if (row.attempts >= ATTEMPTS) { await finish(id, `state='failed',claimed_at=null`); result.failed++; } else { await finish(id, 'claimed_at=null'); result.retrying++; } };
    const view = await pollView(db, { personId: row.personId }, row.pollId);
    // What it was about is over: an invite needs a set time, anything else an open poll, a reminder someone who has not answered.
    const reminder = row.kind === 'reminder_48' || row.kind === 'reminder_24';
    if (!view || (row.kind === 'invite' ? !view.chosen : view.status !== 'open') || (reminder && (view.mine && !view.mine.draft || now >= new Date(view.deadline)))) { await db.query('delete from when_message where id=$1', [id]); continue; }
    // It waited too long to be worth sending (sending was off, or kept failing), or its person pressed stop: it is closed
    // unsent. The row stays, so nothing queues it again.
    const { rows: [stopped] } = await db.query('select 1 from when_answer where poll_id=$1 and person_id=$2 and reminders_off', [row.pollId, row.personId]);
    if (row.stale || stopped || (view.chosen && row.kind === 'invite' && new Date(view.chosen.at) < now)) { await finish(id, `state='failed',claimed_at=null`); continue; }
    let to: string | null;
    // The sign-in provider could not be asked: try again later. It answered that there is no address: that is final.
    // A guest has no account: their invite goes to the address they typed on this poll, and nothing else is sent to it.
    const { rows: [typed] } = await db.query<{ email: string | null }>('select invite_email as email from when_answer where poll_id=$1 and person_id=$2', [row.pollId, row.personId]).catch(() => ({ rows: [] }));
    try { to = (row.kind === 'invite' ? typed?.email : null) ?? await carrier.address(row.personId); } catch { await again(); continue; }
    if (!to) { await finish(id, `state='failed',claimed_at=null`); result.failed++; continue; }
    // Everyone written to has a row for the poll, so everyone has a stop link.
    await db.query('insert into when_answer(poll_id,person_id,draft) values($1,$2,true) on conflict(poll_id,person_id) do nothing', [row.pollId, row.personId]);
    const { rows: [{ token }] } = await db.query<{ token: string }>('select stop_token as token from when_answer where poll_id=$1 and person_id=$2', [row.pollId, row.personId]);
    const stopUrl = appUrl(`/api/when/stop/${token}`), email = renderWhenEmail(row.kind, { view, to: { personId: row.personId, name: row.name }, stopUrl });
    const address = from.replace(/^.*<([^>]+)>\s*$/, '$1').trim();
    const mail: Mail = { id, from: `"${cleanName(email.fromName)}" <${address}>`, to, subject: email.subject, text: email.text, html: email.html, unsubscribeUrl: stopUrl };
    if (row.kind === 'invite') {
      const reply = await carrier.address(view.organizer.personId).catch(() => null), content = pollIcs(view, { to, from: address }, now);
      if (reply) mail.replyTo = reply;
      // The file lands on a calendar as accepted, so it goes only to those who can make the time.
      if (content && (row.personId === view.organizer.personId || view.chosen!.in.some(each => each.personId === row.personId))) mail.calendar = { method: 'REQUEST', content };
    }
    const sent = await carrier.email(mail).catch(() => ({ ok: false as const, retry: true }));
    if (sent.ok) {
      await finish(id, `state='sent',sent_at=$2,claimed_at=null,provider_id=$3`, [at, sent.providerId && /^[ -~]{1,200}$/.test(sent.providerId) ? sent.providerId : null]);
      if (reminder) await logEvent(db, 'reminder_sent', view, { personId: row.personId });
      result.sent++;
    } else if (sent.retry) await again();
    else { await finish(id, `state='failed',claimed_at=null`); result.failed++; }
  }
  return result;
}

/** The stop link: no more reminders about that poll for that person. False for an address that names nothing. */
export async function stopReminders(db: Db, token: string): Promise<boolean> {
  if (!/^[0-9a-f]{32}$/.test(token)) return false;
  return (await db.query('update when_answer set reminders_off=true where stop_token=$1 returning poll_id', [token])).rows.length > 0;
}

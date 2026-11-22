import type { Q } from '../db';

export type MessageKind = 'reminder_48' | 'reminder_24' | 'ready' | 'deadline' | 'invite';

/**
 * The one way anything in Loopd When writes to a person: it queues the message, and the scheduled run
 * (lib/when/outbox.ts) sends it by email. A person gets each kind once per poll; false means they already had it.
 * A text provider, when there is one, is added behind this and no caller changes.
 */
export async function notify(q: Q, pollId: string, personId: string, kind: MessageKind): Promise<boolean> {
  const { rows } = await q.query('insert into when_message(poll_id,person_id,kind) values($1,$2,$3) on conflict(poll_id,person_id,kind) do nothing returning id', [pollId, personId, kind]);
  return rows.length > 0;
}

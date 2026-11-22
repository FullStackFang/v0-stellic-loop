'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { resendSender } from '@/lib/email/resend';
import { clerkEmailOf } from '@/lib/emba/clerk-identity';
import { getSignedInPrincipal } from '@/lib/emba/portal-session';
import { signInHref } from '@/lib/campus/session';
import { drainWhen, whenSendingOn } from '@/lib/when/outbox';
import { WhenError, createPoll, recordOpen, saveAnswer } from '@/lib/when/polls';
import { repeatPoll } from '@/lib/when/repeat';
import { sendPoll } from '@/lib/when/send';

// The presses of Loopd When's pages. Each asks afresh who is signed in, and says what went wrong in plain words.

export type Said = { error: string } | null;
const WORDS: Record<WhenError['code'], string> = {
  invalid: 'Check the details and try again.',
  limit: 'That is ten polls today. Try again tomorrow.',
  not_found: 'This poll is gone.',
  forbidden: 'Only the person who asked can do that.',
};
const said = (error: unknown): { error: string } => {
  if (error instanceof WhenError) return { error: WORDS[error.code] };
  console.error('when', error);
  return { error: 'That did not save. Try again.' };
};
/** Sends what is waiting for one poll now. If it cannot, the scheduled run sends it within fifteen minutes. */
async function flush(pollId: string): Promise<void> {
  if (!whenSendingOn()) return;
  await drainWhen(db(), { address: personId => clerkEmailOf(db(), personId), email: resendSender() }, { pollId, budgetMs: 8000 }).catch(error => console.error('when flush', error));
}

/** "Create the link". */
export async function createPollAction(_: Said, data: FormData): Promise<Said> {
  const who = await getSignedInPrincipal();
  if (!who) redirect(signInHref('/when/new'));
  let id: string;
  try {
    ({ id } = await createPoll(db(), who, Object.fromEntries(['title', 'startDate', 'endDate', 'hourStart', 'hourEnd', 'timezone', 'expectedSize', 'deadline', 'threshold', 'weekends'].map(key => [key, data.get(key) ?? undefined]))));
  } catch (error) { return said(error); }
  redirect(`/when/${id}`);
}

/** "Save my times". */
export async function saveAnswerAction(pollId: string, slots: string[]): Promise<Said> {
  const who = await getSignedInPrincipal();
  if (!who) return { error: 'Sign in to save your times.' };
  try {
    const { ready } = await saveAnswer(db(), who, { pollId, slots });
    if (ready) await flush(pollId);
  } catch (error) { return said(error); }
  revalidatePath(`/when/${pollId}`);
  return null;
}

/** "Send it to everyone": the organizer sets the time, and the invites leave at once. */
export async function sendPollAction(_: Said, data: FormData): Promise<Said> {
  const who = await getSignedInPrincipal(), pollId = String(data.get('pollId') ?? '');
  if (!who) return { error: 'Sign in to send it.' };
  try {
    await sendPoll(db(), who, { pollId, slot: String(data.get('slot') ?? ''), note: String(data.get('note') ?? ''), minute: data.get('minute') ?? undefined, duration: data.get('duration') ?? undefined });
    await flush(pollId);
  } catch (error) { return said(error); }
  redirect(`/when/${pollId}`);
}

/** "Ask the group again": the next poll of the series, and on to it. If it cannot be made, back to the poll it came from. */
export async function repeatPollAction(data: FormData): Promise<void> {
  const who = await getSignedInPrincipal(), pollId = String(data.get('pollId') ?? '');
  if (!who) redirect(signInHref('/when/new'));
  let next = /^[A-Za-z0-9_-]{12}$/.test(pollId) ? `/when/${pollId}` : '/when/new';
  try { next = `/when/${(await repeatPoll(db(), who, { pollId })).id}`; } catch (error) { if (!(error instanceof WhenError)) console.error('when repeat', error); }
  redirect(next);
}

const VISITOR = 'wn_v';
/** A browser opened a poll. It is counted once for that poll, by a mark kept in the browser that says nothing about who it is. */
export async function openedAction(pollId: string): Promise<void> {
  try {
    const jar = await cookies();
    let visitor = jar.get(VISITOR)?.value;
    if (!visitor || !/^[0-9a-f]{32}$/.test(visitor)) {
      visitor = randomBytes(16).toString('hex');
      jar.set(VISITOR, visitor, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/when', maxAge: 31_536_000 });
    }
    await recordOpen(db(), pollId, visitor);
  } catch (error) { console.error('when opened', error); }
}

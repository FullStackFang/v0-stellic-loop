'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { db } from '@/lib/db';
import { getSignedInPrincipal } from '@/lib/emba/portal-session';
import { ASK_DENIED, askWords, type AskDeclined } from '@/lib/emba/ask-words';
import { answerAsk, closeAsk, createAsk, extendAsk } from '@/lib/emba/team-asks';
import type { PortalResult } from '@/components/emba/portal-types';

// Site controls for asks (group-asks spec). The signed-in person comes from the session, never the form; the services decide what that person may do.
// These are open to any signed-in person whichever site is in front (loop-on-you, design D12): an ask belongs to its group's members, and every
// service here checks the caller's role in that group before it reads or writes anything of the group's.

const value = (data: FormData, key: string) => String(data.get(key) ?? '');
const team = (data: FormData) => ({ orgId: value(data, 'orgId'), loopId: value(data, 'loopId') });
type Declined = AskDeclined;
const denied = ASK_DENIED;

async function mutateAsk(run: (principal: NonNullable<Awaited<ReturnType<typeof getSignedInPrincipal>>>) => Promise<{ saved: true } | Declined>): Promise<PortalResult> {
  const principal = await getSignedInPrincipal();
  if (!principal) return { status: 'error', message: 'Sign in to continue.' };
  try {
    const result = await run(principal);
    revalidatePath('/groups');
    revalidatePath('/a/[token]', 'page');
    revalidatePath('/c/[campus]', 'page');
    return result.saved ? { status: 'success', message: 'Saved.' } : { status: 'error', message: askWords(result) };
  } catch (error) {
    if (error instanceof ZodError) return { status: 'error', message: 'Not saved. One of the values is not valid. Check the lengths and the closing time.' };
    return { status: 'error', message: denied };
  }
}

/** Asks the group a question. Options come one per line. */
export async function addTeamAsk(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutateAsk(principal => createAsk(db(), principal, { ...team(data), question: value(data, 'question'), kind: value(data, 'kind'), options: value(data, 'options').split('\n').map(line => line.trim()).filter(Boolean),
    closesAt: value(data, 'closesAt'), reveal: value(data, 'reveal') === 'counts' ? 'counts' : 'named' }));
}
/** Answers an ask, or with `remove` takes the answer back. Only ever the caller's own. */
export async function answerTeamAsk(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  const remove = value(data, 'remove') === 'true', text = value(data, 'text');
  return mutateAsk(principal => answerAsk(db(), principal, { ...team(data), number: Number(value(data, 'number')), route: value(data, 'route') === 'share_link' ? 'share_link' : 'site',
    ...(remove ? { remove: true } : value(data, 'done') === 'true' ? {} : data.has('text') ? { text } : { choices: data.getAll('choice').map(String) }) }));
}
/** Gives an ask a new closing time, which opens it again if it has closed. */
export async function extendTeamAsk(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutateAsk(principal => extendAsk(db(), principal, { ...team(data), number: Number(value(data, 'number')), closesAt: value(data, 'closesAt') }));
}
export async function closeTeamAsk(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutateAsk(principal => closeAsk(db(), principal, { ...team(data), number: Number(value(data, 'number')) }));
}

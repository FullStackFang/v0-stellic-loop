'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { closedToCaller, getPortalPrincipal } from '@/lib/emba/portal-session';
import { setReachChoice, stopFromLink } from '@/lib/emba/reach';
import { answerFromLink } from '@/lib/emba/reach-link';
import type { PortalResult } from '@/components/emba/portal-types';

const value = (data: FormData, key: string) => String(data.get(key) ?? '');

/** The Reach page: the signed-in member chooses how one group reaches them. */
export async function saveReachChoice(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  const principal = await getPortalPrincipal();
  if (!principal) return { status: 'error', message: 'Sign in to continue.' };
  try {
    const result = await setReachChoice(db(), principal, { orgId: value(data, 'orgId'), loopId: value(data, 'loopId'), way: value(data, 'way') });
    if (!result.saved) return { status: 'error', message: result.reason === 'whatsapp_off' ? 'WhatsApp is not available yet.' : 'Message Loop from your WhatsApp first, then choose it here.' };
    revalidatePath('/groups/reach');
    return { status: 'success', message: 'Saved. It applies from the next message.' };
  } catch {
    return { status: 'error', message: 'That could not be saved. Check that you are still in the group.' };
  }
}

/** The stop link's button. It needs no sign-in: the link itself says which member and which group. */
export async function stopGroupMessages(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  try {
    const stopped = await stopFromLink(db(), value(data, 'token'));
    return stopped ? { status: 'success', message: `Done. ${stopped.group} will send you nothing further. Your other groups are unchanged.` } : { status: 'error', message: 'This link no longer works.' };
  } catch {
    return { status: 'error', message: 'That did not work. Try again.' };
  }
}

const refused = { gone: 'This link no longer works.', busy: 'Not saved. Other changes to this group were in progress. Try again in a moment.', closed: 'Not saved. This ask has closed and takes no more answers.', needs_text: 'Not saved. This ask takes a short written answer.', needs_choice: 'Choose an option before sending.', one_only: 'Not saved. This ask takes exactly one option.', unknown_option: 'Not saved. That option is not one of the options. Reload the page.' } as const;
/** The personal answer link's form. It needs no sign-in and opens none: the link names the member and the ask. */
export async function answerFromPersonalLink(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  try {
    if (await closedToCaller()) return { status: 'error', message: refused.gone };
    const result = await answerFromLink(db(), value(data, 'token'), { choices: data.getAll('choice').map(String), text: data.has('text') ? value(data, 'text') : undefined });
    if (!result.saved) return { status: 'error', message: refused[result.reason] };
    revalidatePath('/groups/reach/answer/[token]', 'page');
    return { status: 'success', message: `Saved. Your answer: ${result.ask.yourAnswer}` };
  } catch {
    return { status: 'error', message: 'That did not work. Try again.' };
  }
}

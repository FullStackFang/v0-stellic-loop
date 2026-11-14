'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { db } from '@/lib/db';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { answerAsk, closeAsk, createAsk, type AnswerWrite, type AskChange, type AskWrite } from '@/lib/emba/team-asks';
import type { PortalResult } from '@/components/emba/portal-types';

// Site controls for asks (group-asks spec). The signed-in person comes from the session, never the form; the services decide what that person may do.

const value = (data: FormData, key: string) => String(data.get(key) ?? '');
const team = (data: FormData) => ({ orgId: value(data, 'orgId'), loopId: value(data, 'loopId') });
type Declined = Exclude<AskWrite | AnswerWrite | AskChange, { saved: true }>;

const denied = 'This change could not be saved. Check your access, reload the page and try again.';
const caps = { writes_per_hour: 'You have made many changes this hour. Try again later.', open_asks: 'This group has 20 open asks. Ask someone to close one first.', own_open_asks: 'You have 5 open asks in this group. Close one first.' } as const;
const options = { too_few: 'This kind of ask needs at least 2 options.', too_many: 'An ask takes at most 10 options.', duplicate: 'Two of the options are the same.', not_for_text: 'A written-answer ask takes no options. Clear the options box.', not_a_date: 'Each option of a dates ask is one day, written as YYYY-MM-DD.' } as const;
const closing = { past: 'The closing time must be in the future.', too_far: 'The closing time can be at most 60 days from now.' } as const;
const shape = { needs_text: 'This ask takes a short written answer.', needs_choice: 'Choose an option before sending.', one_only: 'This ask takes exactly one option.' } as const;
const askWords = (result: Declined): string => {
  switch (result.reason) {
    case 'busy': return 'Not saved. Other changes to this group were in progress. Try again in a moment.';
    case 'cap': return `Not saved. ${caps[result.cap]}`;
    case 'members_only': return 'You follow this group and can read it. Only members can do this.';
    case 'organizers_only': return denied;
    case 'options': return `Not saved. ${options[result.problem]}`;
    case 'closing_time': return `Not saved. ${closing[result.problem]}`;
    case 'unknown_event': return 'Not saved. That event is no longer current. Reload the page.';
    case 'unknown_ask': return 'Not saved. That ask is no longer here. Reload the page.';
    case 'closed': return 'Not saved. This ask has closed and takes no more answers.';
    case 'unknown_option': return 'Not saved. That option is not one of this ask\'s options. Reload the page.';
    case 'answer_shape': return `Not saved. ${shape[result.problem]}`;
    case 'not_yours': return 'Not saved. Only the person who asked, or an owner or organizer, can do this.';
    case 'reveal_fixed': return 'Not saved. Who sees which answer cannot change once someone has answered.';
    default: return denied;
  }
};
async function mutateAsk(run: (principal: NonNullable<Awaited<ReturnType<typeof getPortalPrincipal>>>) => Promise<{ saved: true } | Declined>): Promise<PortalResult> {
  const principal = await getPortalPrincipal();
  if (!principal) return { status: 'error', message: 'Sign in to continue.' };
  try {
    const result = await run(principal);
    revalidatePath('/groups');
    revalidatePath('/a/[token]', 'page');
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
    ...(remove ? { remove: true } : data.has('text') ? { text } : { choices: data.getAll('choice').map(String) }) }));
}
export async function closeTeamAsk(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutateAsk(principal => closeAsk(db(), principal, { ...team(data), number: Number(value(data, 'number')) }));
}

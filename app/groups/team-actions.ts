'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { db } from '@/lib/db';
import { EmbaError } from '@/lib/emba/errors';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { archiveTeamEvent, createTeamEvent, renameTeamEvent } from '@/lib/emba/team-events';
import { formatWrite } from '@/lib/emba/team-format';
import { saveBrief } from '@/lib/emba/team-read';
import { amendRecord, postAnnouncement, type WriteResult } from '@/lib/emba/team-records';
import type { PortalResult } from '@/components/emba/portal-types';

// Site controls for a team's records (team-curation spec). Every action takes
// the signed-in person from the session; the services decide what that person
// may do, so nothing here is a permission check of its own.

const value = (data: FormData, key: string) => String(data.get(key) ?? '');
const team = (data: FormData) => ({ orgId: value(data, 'orgId'), loopId: value(data, 'loopId') });
type Signed = NonNullable<Awaited<ReturnType<typeof getPortalPrincipal>>>;
// A declined save, in words for a person on the page. The assistant's wording refers to tools and to lines that follow it.
const declined = (result: Extract<WriteResult, { saved: false }>) => result.reason === 'stale' ? 'Not saved. This record changed after the page loaded. Reload the page to see how it stands now.'
  : result.reason === 'unknown_reference' ? 'Not saved. That record is no longer in this team. Reload the page.' : formatWrite(result).split('\n')[0];
const words = { invalid: 'Not saved. One of the values is not valid. Check the lengths, dates and names.', conflict: 'Not saved. This changed after the page loaded, or the name is already in use. Reload the page and try again.' };
async function mutate(run: (principal: Signed) => Promise<WriteResult | void>, say: Partial<typeof words> = {}): Promise<PortalResult> {
  const principal = await getPortalPrincipal();
  if (!principal) return { status: 'error', message: 'Sign in to continue.' };
  try {
    const result = await run(principal);
    revalidatePath('/groups');
    // A declined save explains itself in the same words an assistant would get.
    if (result && !result.saved) return { status: 'error', message: declined(result) };
    return { status: 'success', message: 'Saved.' };
  } catch (error) {
    // Values are checked before access, and a conflict is reported only to someone allowed to make the change, so neither message says anything about a team to an outsider.
    if (error instanceof ZodError) return { status: 'error', message: say.invalid ?? words.invalid };
    if (error instanceof EmbaError && error.code === 'conflict') return { status: 'error', message: say.conflict ?? words.conflict };
    return { status: 'error', message: 'This change could not be saved. Check your access, reload the page and try again.' };
  }
}

export async function saveTeamBrief(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(async principal => {
    await saveBrief(db(), principal, { ...team(data), body: value(data, 'body'), deadline: value(data, 'deadline') || null, timezone: value(data, 'timezone').trim() || undefined, expectedVersion: Number(value(data, 'expectedVersion')) });
  }, { invalid: 'Not saved. Check that the brief is at most 4,000 characters, the deadline is a real date, and the timezone is a name such as America/New_York.',
    conflict: 'Not saved. Someone else saved the brief while you were editing. Your text is still in the box: copy it, reload the page to see their version, then add your changes.' });
}
export async function addTeamEvent(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(async principal => { await createTeamEvent(db(), principal, { ...team(data), slug: value(data, 'slug').trim().toLowerCase(), name: value(data, 'name') }); });
}
export async function changeTeamEvent(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => renameTeamEvent(db(), principal, { orgId: value(data, 'orgId'), eventId: value(data, 'eventId'), slug: value(data, 'slug').trim().toLowerCase(), name: value(data, 'name') }));
}
export async function retireTeamEvent(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => archiveTeamEvent(db(), principal, { orgId: value(data, 'orgId'), eventId: value(data, 'eventId') }));
}
export async function announceToTeam(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => postAnnouncement(db(), principal, { ...team(data), text: value(data, 'text') }));
}
/** Withdraw, confirm, decline, done, release or untag: the same action an assistant has, used from the page. */
export async function amendTeamRecord(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => amendRecord(db(), principal, { ...team(data), number: Number(value(data, 'number')), action: value(data, 'action') }));
}

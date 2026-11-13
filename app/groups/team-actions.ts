'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { db } from '@/lib/db';
import { EmbaError } from '@/lib/emba/errors';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { addEvent, archiveTeamEvent, changeEvent, restoreEvent, type EventWrite } from '@/lib/emba/team-events';
import { setInterest } from '@/lib/emba/team-interest';
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
// An event's refusals in plain words. Someone who may not manage events gets the same sentence as an outsider, so it says nothing about the team.
const denied = 'This change could not be saved. Check your access, reload the page and try again.';
const linkWhy = { not_https: 'it must be an https link', has_login: 'it must not contain a user name or password', has_port: 'it must not name a port', host_not_a_name: 'its host must be a normal domain name, not an IP address', too_long: 'it is too long; use a shorter link', not_a_link: 'it is not a link, or it contains hidden characters' } as const;
type Declined = Exclude<EventWrite, { saved: true }> | Exclude<Awaited<ReturnType<typeof setInterest>>, { saved: true }>;
const eventWords = (result: Declined): string => {
  switch (result.reason) {
    case 'busy': return 'Not saved. Other changes to this team were in progress. Try again in a moment.';
    case 'cap': return result.cap === 'upcoming_events' ? 'Not saved. A team can have 50 upcoming events. Archive some first.' : 'Not saved. You have made many changes this hour. Try again later.';
    case 'members_only': return 'You follow this team and can read it. Only members can do this.';
    case 'name_taken': return 'Not saved. That tag is already used by an event, a group or a person in this team. Choose another tag.';
    case 'archived': return 'Not saved. That event is archived. Restore it first.';
    case 'end_before_start': return 'Not saved. The end time is earlier than the start time.';
    case 'end_needs_start': return 'Not saved. An end time needs a start time. Set the start too.';
    case 'link_refused': return `Not saved. The link was refused: ${linkWhy[result.problem]}.`;
    case 'unknown_event': return 'Not saved. That event is no longer current. Reload the page.';
    default: return denied;
  }
};
/** Runs an event write or an interest mark and says why when the service declined it. */
async function mutateEvent(run: (principal: Signed) => Promise<{ saved: true } | Declined>, paths: string[] = []): Promise<PortalResult> {
  const principal = await getPortalPrincipal();
  if (!principal) return { status: 'error', message: 'Sign in to continue.' };
  try {
    const result = await run(principal);
    revalidatePath('/groups');
    for (const path of paths) revalidatePath(path, 'page');
    return result.saved ? { status: 'success', message: 'Saved.' } : { status: 'error', message: eventWords(result) };
  } catch (error) {
    if (error instanceof ZodError) return { status: 'error', message: 'Not saved. One of the values is not valid. Check the lengths, dates and names.' };
    return { status: 'error', message: denied };
  }
}
// A date field is sent as YYYY-MM-DDTHH:MM and read in the team's timezone. On the add form an empty field is left out; on the change form it clears the fact.
const fact = (data: FormData, key: string) => value(data, key).trim() || null;
const facts = (data: FormData) => ({ startsAt: fact(data, 'startsAt'), endsAt: fact(data, 'endsAt'), place: fact(data, 'place'), url: fact(data, 'url'), note: fact(data, 'note') });
export async function addTeamEvent(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutateEvent(principal => addEvent(db(), principal, { ...team(data), slug: value(data, 'slug').trim().toLowerCase(), name: value(data, 'name'), ...facts(data) }));
}
export async function changeTeamEvent(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutateEvent(principal => changeEvent(db(), principal, { orgId: value(data, 'orgId'), eventId: value(data, 'eventId'), slug: value(data, 'slug').trim().toLowerCase(), name: value(data, 'name'), ...facts(data) }));
}
export async function restoreTeamEvent(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutateEvent(principal => restoreEvent(db(), principal, { orgId: value(data, 'orgId'), eventId: value(data, 'eventId') }));
}
/** Marks the signed-in person interested in an event, or takes it back. The person comes from the session, never the form. */
export async function setTeamInterest(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutateEvent(principal => setInterest(db(), principal, { ...team(data), event: value(data, 'event'), interested: value(data, 'interested') === 'true', route: value(data, 'route') === 'share_link' ? 'share_link' : 'site' }), ['/e/[token]']);
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

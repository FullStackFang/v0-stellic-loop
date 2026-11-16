'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { db } from '@/lib/db';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { newFeedAddress, sendEventInvites, type InviteWrite } from '@/lib/emba/team-calendar';
import { cancelIdea, changeIdea, proposeIdea, type IdeaWrite } from '@/lib/emba/team-ideas';
import { removeTravel, saveTravel, type TravelRemoval, type TravelWrite } from '@/lib/emba/team-travel';
import type { PortalResult } from '@/components/emba/portal-types';

// Site controls for a trip (loop-trip): ideas and plans, the member's own
// travel, the calendar feed, and sending a fixed event as an invite. The
// signed-in person comes from the session; the services decide what they may do.

const value = (data: FormData, key: string) => String(data.get(key) ?? '');
const team = (data: FormData) => ({ orgId: value(data, 'orgId'), loopId: value(data, 'loopId') });
type Signed = NonNullable<Awaited<ReturnType<typeof getPortalPrincipal>>>;
const denied = 'This change could not be saved. Check your access, reload the page and try again.';
type Declined = Exclude<IdeaWrite | TravelWrite | TravelRemoval | InviteWrite, { saved: true }>;
const linkWhy = { not_https: 'it must be an https link', has_login: 'it must not contain a user name or password', has_port: 'it must not name a port', host_not_a_name: 'its host must be a normal domain name, not an IP address', too_long: 'it is too long; use a shorter link', not_a_link: 'it is not a link, or it contains hidden characters' } as const;
const travelWhy = { no_day: 'Give an arrival day or a departure day.', arrival_needs_day: 'An arrival place or flight needs the arrival day.', departure_needs_day: 'A departure place or flight needs the departure day.' } as const;
const words = (result: Declined): string => {
  switch (result.reason) {
    case 'busy': return 'Not saved. Other changes to this group were in progress. Try again in a moment.';
    case 'cap': return result.cap === 'own_open_ideas' ? 'Not saved. You have 5 open ideas in this group. Cancel one, or wait for one to become a plan.' : result.cap === 'open_ideas' ? 'Not saved. This group has 100 open ideas.' : 'Not saved. You have made many changes this hour. Try again later.';
    case 'members_only': return 'You follow this group and can read it. Only members can do this.';
    case 'unknown_event': return 'Not saved. That is no longer open. Reload the page.';
    case 'not_yours': return 'Not saved. Only the person who proposed it, or an owner or organizer, can do this.';
    case 'in_the_past': return 'Not saved. The start time must be in the future.';
    case 'offered_day_past': return 'Not saved. A day must be today or later.';
    case 'plan_needs_time_and_place': return 'Not saved. A plan keeps a start time and a place. Change them, or cancel the plan.';
    case 'end_before_start': return 'Not saved. The end time is earlier than the start time.';
    case 'end_needs_start': return 'Not saved. An end time needs a start time. Set the start too.';
    case 'link_refused': return `Not saved. The link was refused: ${linkWhy[result.problem]}.`;
    case 'incomplete': return `Not saved. ${travelWhy[result.problem]}`;
    case 'no_date': return 'Not sent. An event needs a date before it can go to calendars.';
    default: return denied;
  }
};
async function mutate(run: (principal: Signed) => Promise<{ saved: true } | Declined>, done: (result: { saved: true }) => string = () => 'Saved.'): Promise<PortalResult> {
  const principal = await getPortalPrincipal();
  if (!principal) return { status: 'error', message: 'Sign in to continue.' };
  try {
    const result = await run(principal);
    revalidatePath('/groups');
    return result.saved ? { status: 'success', message: done(result) } : { status: 'error', message: words(result) };
  } catch (error) {
    if (error instanceof ZodError) return { status: 'error', message: 'Not saved. One of the values is not valid. Check the lengths, dates and names.' };
    return { status: 'error', message: denied };
  }
}
// On a new idea an empty box is left out; on a change it clears the fact.
const fact = (data: FormData, key: string) => value(data, key).trim() || null;
const facts = (data: FormData) => ({ startsAt: fact(data, 'startsAt'), endsAt: fact(data, 'endsAt'), place: fact(data, 'place'), url: fact(data, 'url'), note: fact(data, 'note') });
const days = (data: FormData) => value(data, 'offeredDays').split(/[\s,;]+/).filter(Boolean);

export async function proposeTeamIdea(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => proposeIdea(db(), principal, { ...team(data), name: value(data, 'name'), needed: Number(value(data, 'needed') || 3), ...facts(data), offeredDays: days(data) }));
}
export async function changeTeamIdea(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => changeIdea(db(), principal, { ...team(data), event: value(data, 'event'), name: value(data, 'name'), ...facts(data), ...(data.has('offeredDays') ? { offeredDays: days(data) } : {}), ...(data.has('day') ? { day: fact(data, 'day') } : {}) }));
}
export async function cancelTeamIdea(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => cancelIdea(db(), principal, { ...team(data), event: value(data, 'event') }), () => 'Cancelled.');
}
/** The signed-in person's own travel. An emptied box clears that fact. */
export async function saveMyTravel(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => saveTravel(db(), principal, { ...team(data), arrivesAt: fact(data, 'arrivesAt'), arrivesPlace: fact(data, 'arrivesPlace'), arrivesFlight: fact(data, 'arrivesFlight'),
    departsAt: fact(data, 'departsAt'), departsPlace: fact(data, 'departsPlace'), departsFlight: fact(data, 'departsFlight'), stay: fact(data, 'stay') }));
}
export async function removeMyTravel(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => removeTravel(db(), principal, team(data)), () => 'Removed.');
}
/** Makes the signed-in person's calendar address for the group, or replaces it. The page then shows the new one. */
export async function newCalendarAddress(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(async principal => { await newFeedAddress(db(), principal, team(data)); return { saved: true as const }; }, () => 'Done. The address below is the one to use now.');
}
export async function sendTeamEventInvites(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => sendEventInvites(db(), principal, { ...team(data), event: value(data, 'event') }),
    result => { const sent = result as Extract<InviteWrite, { saved: true }>; return sent.sending ? `Sent to the calendars of the ${sent.interested} interested, where they allow email.` : 'Saved. No message goes out while sending is switched off.'; });
}

'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { CampusError } from '@/lib/campus/errors';
import { readLine } from '@/lib/campus/line';
import { findCampus, findListing } from '@/lib/campus/listings';
import { checkIn, imIn, invite, joinByToken, leave, outingByToken, uninvite } from '@/lib/campus/outings';
import { customFace } from '@/lib/campus/animals';
import { freeCode, keepPicture, makeCustomFace, retryCustomFace, subscribe, useCustomFace } from '@/lib/campus/custom-face';
import { subscribeInkPlus } from '@/lib/campus/ink';
import { pickFace, placeAt } from '@/lib/campus/people';
import { cancelPlan, changePlan, postPlan, readPlanLink, type LinkFill, type PlanInput } from '@/lib/campus/plans';
import { useBuildingReward as markBuildingUsed, useGroupReward as markGroupUsed } from '@/lib/campus/rewards';
import { setSchools } from '@/lib/campus/linkedin';
import { linkedinAccount } from '@/lib/campus/linkedin-account';
import { askForSchool } from '@/lib/campus/school-ask';
import { campusViewer, mayUse, type CampusViewer } from '@/lib/campus/session';
import { askWords } from '@/lib/emba/ask-words';
import { answerAsk, createAsk, type AnswerWrite } from '@/lib/emba/team-asks';
import { setInterest } from '@/lib/emba/team-interest';
import { amendRecord } from '@/lib/emba/team-records';

// Every action of the campus screen. Each asks afresh who is signed in, and acts only on the person's own campus
// (the admin may act on any). A signed-out caller gets `signIn`, and the screen sends them to sign in and back.

export type ActResult = { ok: true } | { ok: false; message: string; signIn?: boolean };
const OTHER_SCHOOL = "This is another school's list. Yours is under This week.";

async function act(run: (viewer: CampusViewer) => Promise<{ campusId: string; slug?: string } | void>): Promise<ActResult> {
  const viewer = await campusViewer();
  if (!viewer) return { ok: false, signIn: true, message: 'Sign in to continue.' };
  try {
    await run(viewer);
    revalidatePath('/c', 'layout'); revalidatePath('/o', 'layout');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof CampusError ? error.message : 'That did not go through. Try again.' };
  }
}
/** Refuses unless the event is on a campus this person may use. */
async function onMyCampus(viewer: CampusViewer, listingId: string) {
  const listing = await findListing(db(), String(listingId));
  if (!listing) throw new CampusError('This event is no longer on the list.');
  if (!mayUse(viewer, { id: listing.campusId })) throw new CampusError(OTHER_SCHOOL);
  return listing;
}

/** "I'm in", and "Register me" on a feed event. */
export async function imInAction(listingId: string): Promise<ActResult> {
  return act(async viewer => { await onMyCampus(viewer, listingId); await imIn(db(), viewer.personId, listingId); });
}
/** "Join" from a share link. */
export async function joinAction(token: string): Promise<ActResult> {
  return act(async viewer => {
    const outing = await outingByToken(db(), String(token));
    if (!outing) throw new CampusError('This link does not lead to a group any more.');
    if (!mayUse(viewer, { id: outing.campusId })) throw new CampusError(OTHER_SCHOOL);
    await joinByToken(db(), viewer.personId, token);
  });
}
export async function leaveAction(listingId: string): Promise<ActResult> {
  return act(async viewer => { await onMyCampus(viewer, listingId); await leave(db(), viewer.personId, listingId); });
}
export async function checkInAction(listingId: string): Promise<ActResult> {
  return act(async viewer => { await onMyCampus(viewer, listingId); await checkIn(db(), viewer.personId, listingId); });
}
/** "Invite" beside a person's name, and "Invited" to take it back. */
export async function inviteAction(listingId: string, personId: string, on: boolean): Promise<ActResult> {
  return act(async viewer => { await onMyCampus(viewer, listingId); await (on ? invite : uninvite)(db(), viewer.personId, listingId, String(personId)); });
}
/** "Mark as used" on an unlocked group reward. */
export async function useRewardAction(listingId: string): Promise<ActResult> {
  return act(async viewer => { await onMyCampus(viewer, listingId); await markGroupUsed(db(), viewer.personId, listingId); });
}
/** "Mark as used" on an earned building reward. */
export async function useCouponAction(rewardId: string): Promise<ActResult> {
  return act(async viewer => {
    if (!viewer.campus) throw new CampusError('There is no such reward.');
    await markBuildingUsed(db(), viewer.personId, String(rewardId), viewer.campus);
  });
}
/** A person picks their face in the account card: one of the animals, or their own photo. */
export async function faceAction(face: number): Promise<ActResult> {
  return act(async viewer => { await pickFace(db(), viewer.personId, Number(face), viewer.admin); });
}

/** A person picks one of the animals they had made, by its address. */
export async function ownFaceAction(own: string): Promise<ActResult> {
  return act(async viewer => { await useCustomFace(db(), viewer.personId, String(own).split('/').pop() ?? '', viewer.admin); });
}

/** "Change campus" in the account card: the person's own campus becomes another campus of their school. */
export async function changeCampusAction(slug: string): Promise<ActResult> {
  return act(async viewer => {
    const to = await findCampus(db(), String(slug));
    if (!to) throw new CampusError('That campus is not part of your school.');
    await placeAt(db(), viewer.personId, to.id);
  });
}

export type AgainFace = { ok: true; own: string } | { ok: false; message: string; signIn?: boolean };
/** "Draw again": a photo drawn beside an animal the person had made, with what should change. It takes the founder's code; the admin needs none. Takes about 20 seconds. */
export async function againFaceAction(data: FormData): Promise<AgainFace> {
  const viewer = await campusViewer();
  if (!viewer) return { ok: false, signIn: true, message: 'Sign in to continue.' };
  const photo = data.get('photo');
  if (!(photo instanceof File) || !photo.size) return { ok: false, message: 'Choose a photo of an animal first.' };
  if (!viewer.admin && !freeCode(data.get('code'))) return { ok: false, message: String(data.get('code') ?? '').trim() ? 'That code does not work.' : 'Enter the code to draw again.' };
  try {
    return { ok: true, own: customFace(await retryCustomFace(db(), viewer.personId, new Uint8Array(await photo.arrayBuffer()), String(data.get('first')).split('/').pop() ?? '', data.getAll('change').map(String), String(data.get('note') ?? ''))) };
  } catch (error) {
    return { ok: false, message: error instanceof CampusError ? error.message : 'That did not go through. Try again.' };
  }
}

/** "Keep this one": of the two drawings, the one the person keeps, by its address. */
export async function keepFaceAction(keep: string): Promise<ActResult> {
  return act(async viewer => { await keepPicture(db(), viewer.personId, String(keep).split('/').pop() ?? ''); });
}

/** "Subscribe" to Loop Premium in the account card. Nothing is charged; the ask and its email are kept. */
export async function subscribeAction(email: string): Promise<ActResult> {
  return act(async viewer => { await subscribe(db(), viewer.personId, String(email)); });
}

/** "Add my school", for a person whose email is at none of the schools: the school they name is kept with that email. */
export async function askSchoolAction(school: string): Promise<ActResult> {
  return act(async viewer => { await askForSchool(db(), viewer.personId, String(school), viewer.principal.verifiedEmail); });
}

/** "Unlock": a person adds the address of their LinkedIn profile and ticks the schools they have been at. Someone with no campus then waits for the admin to approve it. */
export async function setSchoolsAction(profile: string, schools: string[]): Promise<ActResult> {
  return act(async viewer => { await setSchools(db(), { personId: viewer.personId, verifiedEmail: viewer.principal.verifiedEmail }, String(profile), Array.isArray(schools) ? schools.map(String) : [], (await linkedinAccount(viewer.principal))?.name ?? null); });
}

export type MadeFace = { ok: true; own: string; left: number } | { ok: false; message: string; signIn?: boolean };
/**
 * "Subscribe" on a person's own animal, and "Make it" after that: the photo is drawn as one of the set and becomes their
 * face. Nothing is charged; the first ask is kept with its email. Takes about 20 seconds.
 */
export async function makeFaceAction(data: FormData): Promise<MadeFace> {
  const viewer = await campusViewer();
  if (!viewer) return { ok: false, signIn: true, message: 'Sign in to continue.' };
  const photo = data.get('photo'), email = data.get('email');
  if (!(photo instanceof File) || !photo.size) return { ok: false, message: 'Choose a photo of an animal first.' };
  try {
    const made = await makeCustomFace(db(), viewer.personId, new Uint8Array(await photo.arrayBuffer()), typeof email === 'string' ? email : null, undefined, viewer.admin || freeCode(data.get('code')), String(data.get('note') ?? ''));
    revalidatePath('/c', 'layout'); revalidatePath('/o', 'layout');
    return { ok: true, own: customFace(made.token), left: made.left };
  } catch (error) {
    return { ok: false, message: error instanceof CampusError ? error.message : 'That did not go through. Try again.' };
  }
}

export type PlanState ={ message: string };
const field = (data: FormData, key: string) => String(data.get(key) ?? '');
const planOf = (data: FormData): PlanInput => ({ title: field(data, 'title'), starts: field(data, 'starts'), ends: field(data, 'ends') || null, place: field(data, 'place'), about: field(data, 'about'), link: field(data, 'link') || null });

/** "Fill in" on the post form: reads an event page into what the form should hold. Nothing is saved. */
export async function readPlanLinkAction(slug: string, url: string): Promise<LinkFill> {
  const viewer = await campusViewer();
  if (!viewer) return { ok: false, message: 'Sign in to continue.' };
  const campus = await findCampus(db(), String(slug));
  if (!campus || !mayUse(viewer, campus)) return { ok: false, message: OTHER_SCHOOL };
  return readPlanLink(campus, String(url).slice(0, 2000));
}
/** What a read link added to a line: the link, and what its page said. The line's own words win over these. */
export type LineFrom = { link: string; title?: string; starts?: string; ends?: string; place?: string; about?: string };
/** Posts what was typed in one line (design D12). The line is read here; what the browser showed is not trusted. */
export async function postLineAction(slug: string, text: string, from: LineFrom | null): Promise<ActResult> {
  const campus = await findCampus(db(), String(slug));
  return act(async viewer => {
    if (!campus || !mayUse(viewer, campus)) throw new CampusError(OTHER_SCHOOL);
    const read = readLine(String(text).slice(0, 400), campus.tz, new Date()), page = from && typeof from === 'object' ? from : null;
    const title = read.title || String(page?.title ?? ''), starts = read.starts ?? (page?.starts ? String(page.starts) : null);
    if (!title.trim()) throw new CampusError('What is it? Say dumplings, a run, a study group.');
    if (!starts) throw new CampusError('When is it? Say tonight, tomorrow 7pm, sat 10am.');
    // The page's end only goes with the page's start.
    await postPlan(db(), viewer.personId, campus, { title, starts, ends: read.starts ? null : page?.ends ? String(page.ends) : null, place: page?.place ? String(page.place) : null,
      about: page?.about ? String(page.about) : null, link: page?.link ? String(page.link) : read.link, tags: read.tags });
  });
}
/** Posts a plan from the post form, then returns to the screen. A link the list already has counts the person in on that plan. */
export async function postPlanAction(_previous: PlanState, data: FormData): Promise<PlanState> {
  const slug = field(data, 'campus'), campus = await findCampus(db(), slug);
  const result = await act(async viewer => {
    if (!campus || !mayUse(viewer, campus)) throw new CampusError(OTHER_SCHOOL);
    await postPlan(db(), viewer.personId, campus, planOf(data));
  });
  if (result.ok) redirect(`/c/${slug}`);
  return { message: result.message };
}
/** Changes a plan, or with `cancel` set, cancels it. The poster until it starts, or the admin. */
export async function changePlanAction(_previous: PlanState, data: FormData): Promise<PlanState> {
  const slug = field(data, 'campus'), listingId = field(data, 'listing'), cancel = field(data, 'intent') === 'cancel';
  const result = await act(async viewer => {
    await onMyCampus(viewer, listingId);
    const who = { personId: viewer.personId, admin: viewer.admin };
    await (cancel ? cancelPlan(db(), who, listingId) : changePlan(db(), who, listingId, planOf(data)));
  });
  if (result.ok) redirect(`/c/${slug}`);
  return { message: result.message };
}

// "On you" (openspec loop-on-you): what a person's groups need from them, answered from the campus screen. Each write is the
// group's own (the same one its pages and the assistant call), made as the signed-in person, and each checks that person's
// role in that group before it reads or writes anything of the group's. The group comes from the row; it is never trusted.

export type OnYouResult = { ok: true } | { ok: false; message: string; signIn?: boolean; /** It is no longer there to act on: the row leaves. */ gone?: boolean };
type GroupScope = { orgId: string; loopId: string };
const NOT_SAVED = 'That did not go through. Try again.';
const GONE = ['closed', 'unknown_ask', 'unknown_event', 'unknown_record', 'stale'];
const plainWords = (declined: { reason: string }) => declined.reason === 'busy' ? 'Not saved. Other changes to this group were in progress. Try again in a moment.'
  : declined.reason === 'cap' ? 'You have made many changes this hour. Try again later.' : declined.reason === 'members_only' ? 'You follow this group. Only members can do this.'
  : GONE.includes(declined.reason) ? 'This is no longer waiting for you.' : NOT_SAVED;
async function onYouWrite<D extends { saved: false; reason: string }>(run: (viewer: CampusViewer) => Promise<{ saved: true } | D>, words: (declined: D) => string): Promise<OnYouResult> {
  const viewer = await campusViewer();
  if (!viewer) return { ok: false, signIn: true, message: 'Sign in to continue.' };
  try {
    const result = await run(viewer);
    revalidatePath('/c', 'layout');
    return result.saved ? { ok: true } : { ok: false, message: words(result), ...(GONE.includes(result.reason) ? { gone: true } : {}) };
  } catch { return { ok: false, message: NOT_SAVED }; }
}
const scopeOf = (scope: GroupScope) => ({ orgId: String(scope?.orgId), loopId: String(scope?.loopId) });
/** "Done" on something to do, or one option of a pick-one ask. */
export async function answerOnYouAction(scope: GroupScope, number: number, choice?: number): Promise<OnYouResult> {
  return onYouWrite<Exclude<AnswerWrite, { saved: true }>>(viewer => answerAsk(db(), viewer.principal, { ...scopeOf(scope), number: Number(number), route: 'site', ...(choice === undefined ? {} : { choices: [String(choice)] }) }),
    declined => declined.reason === 'closed' ? 'This has closed.' : askWords(declined));
}
/** "I'm in" or "Not for me" on a group's event or idea. */
export async function interestOnYouAction(scope: GroupScope, event: string, going: boolean): Promise<OnYouResult> {
  return onYouWrite(viewer => setInterest(db(), viewer.principal, { ...scopeOf(scope), event: String(event), interested: !!going, decline: !going, route: 'site' }), plainWords);
}
/** "It's mine" or "Not mine" on work someone proposed for the person. */
export async function claimOnYouAction(scope: GroupScope, number: number, mine: boolean): Promise<OnYouResult> {
  return onYouWrite(viewer => amendRecord(db(), viewer.principal, { ...scopeOf(scope), operationId: randomUUID(), number: Number(number), action: mine ? 'confirm' : 'decline' }), plainWords);
}
/** "Ask a group": the question, what kind of answer it takes and when it closes, as read from the line and shown before sending. */
export async function askGroupAction(scope: GroupScope, ask: { question: string; kind: 'done' | 'one' | 'text'; options?: string[]; closesAt: string }): Promise<OnYouResult> {
  return onYouWrite(viewer => createAsk(db(), viewer.principal, { ...scopeOf(scope), question: String(ask?.question ?? ''), kind: ask?.kind, closesAt: String(ask?.closesAt ?? ''),
    ...(ask?.kind === 'one' ? { options: (ask.options ?? []).map(String) } : {}) }), askWords);
}

/** "Subscribe" on the Ink+ plate of "Save your picture": what takes the Loop mark off. Nothing is charged: the ask is kept, with where it was made. */
export async function subscribeToSaveAction(email: string): Promise<ActResult> {
  return act(async viewer => { if (!await subscribeInkPlus(db(), viewer.personId, String(email), 'save picture')) throw new CampusError('Enter the email to subscribe with.'); });
}

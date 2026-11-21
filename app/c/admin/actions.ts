'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { setAnimalName, setBuiltTier, setPictureTier } from '@/lib/campus/animal-tiers';
import { MASCOT } from '@/lib/campus/animals';
import { decideClubClaim } from '@/lib/campus/club-claim';
import { deletePicture } from '@/lib/campus/custom-face';
import { readFeeds } from '@/lib/campus/import';
import { approveLinkedin, removeLinkedin } from '@/lib/campus/linkedin';
import { removeAskedSchool } from '@/lib/campus/school-ask';
import { findCampus, type Campus } from '@/lib/campus/listings';
import { addCampus, addFeed, addHandListing, setCampus, setFeedOn, setHidden, setWords } from '@/lib/campus/manage';
import { savePlace } from '@/lib/campus/places';
import { saveReward, setRewardHidden } from '@/lib/campus/rewards';
import { campusViewer } from '@/lib/campus/session';
import { schoolOf } from '@/lib/campus/schools';
import { joinTag, setTagKind, splitTag } from '@/lib/campus/tags';
import { zoned } from '@/lib/campus/time';

// Everything the admin does on /c/admin. Each action asks afresh whether the caller is the admin and refuses anyone
// else, so calling one without going through the page gets nothing. Each ends back on the page, saying what happened.

const text = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
const list = (typed: string) => typed.split(/[,\n]+/).map(part => part.trim()).filter(Boolean);
const uuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value) ? value : '';
const number = (typed: string) => typed === '' ? NaN : Number(typed);

/** Runs one admin step on the campus the form names, then returns to the page with a line about it. */
async function admin(data: FormData, run: (campus: Campus) => Promise<string>): Promise<never> {
  const viewer = await campusViewer();
  if (!viewer?.admin) redirect('/');
  const slug = text(data, 'campus'), campus = await findCampus(db(), slug);
  let said: string;
  try {
    if (!campus) throw new Error('No such campus');
    said = await run(campus);
  } catch (error) {
    // The admin is shown what went wrong as it is: these are their own typing mistakes and the database's refusals.
    said = `Not saved. ${error instanceof Error ? error.message.slice(0, 240) : 'Try again.'}`;
  }
  revalidatePath('/c', 'layout'); revalidatePath('/o', 'layout');
  // Back to the section the form was on.
  const back = ['tab', 'show'].map(key => /^[a-z]+$/.test(text(data, key)) ? `&${key}=${text(data, key)}` : '').join('');
  redirect(`/c/admin?campus=${encodeURIComponent(campus?.slug ?? slug)}${back}&said=${encodeURIComponent(said)}`);
}

export async function addCampusAction(data: FormData): Promise<void> {
  const viewer = await campusViewer();
  if (!viewer?.admin) redirect('/');
  const slug = text(data, 'slug').toLowerCase();
  let said = `Added ${text(data, 'name')}.`, to = slug;
  try {
    await addCampus(db(), { slug, name: text(data, 'name'), tz: text(data, 'tz'), domains: list(text(data, 'domains')), listSource: text(data, 'listSource') });
  } catch (error) { said = `Not saved. ${error instanceof Error ? error.message.slice(0, 240) : 'Try again.'}`; to = text(data, 'campus'); }
  revalidatePath('/c', 'layout');
  redirect(`/c/admin?campus=${encodeURIComponent(to)}&said=${encodeURIComponent(said)}`);
}
export async function setCampusAction(data: FormData): Promise<void> {
  await admin(data, async campus => { await setCampus(db(), campus.id, { domains: list(text(data, 'domains')), listSource: text(data, 'listSource') }); return 'Saved.'; });
}

/** "Approve" beside a person with no school email who is waiting: they are let in at the first school they ticked. */
export async function approveLinkedinAction(data: FormData): Promise<void> {
  await admin(data, async () => { const id = uuid(text(data, 'person')); if (!id) throw new Error('No such person'); await approveLinkedin(db(), id); return 'Approved. They are in the next time they open Loopd.'; });
}
/** "Remove" beside a person who added a LinkedIn profile: the profile goes, and what it unlocked. */
/** "Remove" on a school people asked for: the name comes off the list, with everyone who gave it. */
export async function removeSchoolAskAction(data: FormData): Promise<void> {
  await admin(data, async () => { const key = text(data, 'school'); if (!key) throw new Error('No such school'); await removeAskedSchool(db(), key); return 'Removed from the list.'; });
}

export async function removeLinkedinAction(data: FormData): Promise<void> {
  await admin(data, async () => { const id = uuid(text(data, 'person')); if (!id) throw new Error('No such person'); await removeLinkedin(db(), id); return 'Removed. The schools it unlocked are closed to them again.'; });
}

/** "Approve", "Turn down" and "Take back" beside a claim to a club: the admin's word stands over what the officer list said. */
export async function decideClubClaimAction(data: FormData): Promise<void> {
  await admin(data, async () => {
    const id = uuid(text(data, 'claim')), to = text(data, 'to') === 'approved' ? 'approved' as const : 'refused' as const;
    if (!id || !await decideClubClaim(db(), id, to)) throw new Error('No such claim');
    return to === 'approved' ? 'Approved. The club is theirs.' : 'Turned down. The club is not theirs.';
  });
}

export async function addFeedAction(data: FormData): Promise<void> {
  await admin(data, async campus => { await addFeed(db(), { campusId: campus.id, source: text(data, 'source'), url: text(data, 'url') }); return 'Feed added. Press "Read now" to bring its events in.'; });
}
export async function setFeedOnAction(data: FormData): Promise<void> {
  await admin(data, async () => { const on = text(data, 'on') === 'true'; await setFeedOn(db(), uuid(text(data, 'feed')), on); return on ? 'Feed on.' : 'Feed off. Its events stay as they are.'; });
}
export async function readFeedAction(data: FormData): Promise<void> {
  await admin(data, async () => { const { failed } = await readFeeds(db(), { feedId: uuid(text(data, 'feed')) }); return failed ? 'The feed could not be read. Its events are as they were.' : 'Feed read.'; });
}

export async function savePlaceAction(data: FormData): Promise<void> {
  await admin(data, async campus => {
    await savePlace(db(), { campusId: campus.id, id: uuid(text(data, 'place')) || undefined, name: text(data, 'name'), otherNames: list(text(data, 'otherNames')), lat: number(text(data, 'lat')), lon: number(text(data, 'lon')) });
    return 'Place saved. Events were matched again.';
  });
}

export async function addEventAction(data: FormData): Promise<void> {
  await admin(data, async campus => {
    const title = text(data, 'title'), ends = text(data, 'ends');
    if (!title) throw new Error('Give the event a title');
    await addHandListing(db(), { campusId: campus.id, title, startsAt: zoned(campus.tz, text(data, 'starts')).toISOString(), endsAt: ends ? zoned(campus.tz, ends).toISOString() : null, place: text(data, 'place'), host: text(data, 'host'), about: text(data, 'about') });
    return `Added "${title}".`;
  });
}
export async function setWordsAction(data: FormData): Promise<void> {
  await admin(data, async () => { const words = await setWords(db(), uuid(text(data, 'listing')), text(data, 'words')); return `Words saved: ${words.join(' ') || 'none'}.`; });
}
export async function setHiddenAction(data: FormData): Promise<void> {
  await admin(data, async () => { const hidden = text(data, 'hidden') === 'true'; await setHidden(db(), uuid(text(data, 'listing')), hidden); return hidden ? 'Hidden. People who were in keep their outings.' : 'Showing again.'; });
}

// Tags (openspec loop-campus-tags, design D6). What the admin sets here, the automatic sorting never changes again.
export async function setTagKindAction(data: FormData): Promise<void> {
  await admin(data, async campus => { await db().tx(q => setTagKind(q, campus.id, uuid(text(data, 'tag')), text(data, 'kind'))); return 'Kind saved, for the tag and the tags counted with it.'; });
}
export async function joinTagAction(data: FormData): Promise<void> {
  await admin(data, async campus => { await db().tx(q => joinTag(q, campus.id, uuid(text(data, 'tag')), uuid(text(data, 'into')))); return 'Joined. They are counted as one now, and plans keep the word that was typed.'; });
}
export async function splitTagAction(data: FormData): Promise<void> {
  await admin(data, async campus => { await db().tx(q => splitTag(q, campus.id, uuid(text(data, 'tag')))); return 'Split out. It stays on its own.'; });
}

const MOVED: Record<string, string> = { core: 'Core now: it is in everyone’s picker.', premium: 'Premium now: people who subscribed can pick it.', school: 'School now: free to people of its school, and nobody else.', off: 'Off: it is in nobody’s picker. Whoever has it keeps it.', own: 'Its maker’s alone again. Whoever else uses it keeps it.' };
/** Core, Premium or Off on the animals that were picked: ones shipped with the app, by number, and ones people had made. Off, for a made one, is its maker's alone. */
export async function setTierAction(data: FormData): Promise<void> {
  await admin(data, async campus => {
    const tier = text(data, 'tier'), faces = data.getAll('face').map(String), pictures = data.getAll('picture').map(String);
    if (!faces.length && !pictures.length) throw new Error('Pick an animal first');
    // School makes it the own animal of the school of the campus the page is on. A mascot keeps its own school.
    const school = schoolOf(campus.slug);
    for (const face of faces) await setBuiltTier(db(), number(face), tier, MASCOT[number(face)] ?? school);
    for (const picture of pictures) await setPictureTier(db(), picture, tier === 'off' ? 'own' : tier, school);
    const many = faces.length + pictures.length;
    return many === 1 ? MOVED[tier] ?? 'Saved.' : `${many} animals moved to ${tier}. Whoever has one keeps it.`;
  });
}
/** "Save" on the card of the one picked animal: its name, and the words the picker finds it by. The card's fields carry the animal's number or token in their names. */
export async function setAnimalNameAction(data: FormData): Promise<void> {
  await admin(data, async () => {
    const faces = data.getAll('face').map(String), pictures = data.getAll('picture').map(String), key = faces[0] ?? pictures[0];
    if (faces.length + pictures.length !== 1) throw new Error('Pick one animal to name');
    const words = await setAnimalName(db(), faces.length ? { face: number(key) } : { token: key }, text(data, `name-${key}`), list(text(data, `words-${key}`)));
    return `Saved. The picker finds it by its name${words.length ? ` and by: ${words.join(', ')}` : ' alone'}.`;
  });
}
/** "Delete for good" on the picked animals that people had made. The ones shipped with the app cannot be deleted, only turned off. */
export async function deletePictureAction(data: FormData): Promise<void> {
  await admin(data, async () => { const pictures = data.getAll('picture').map(String); for (const picture of pictures) await deletePicture(db(), picture); return `Deleted ${pictures.length}. Anyone who used one is shown their own animal again.`; });
}

export async function saveRewardAction(data: FormData): Promise<void> {
  await admin(data, async campus => {
    const kind = text(data, 'kind') === 'building' ? 'building' : 'group', on = text(data, 'on');
    await saveReward(db(), {
      campusId: campus.id, id: uuid(text(data, 'reward')) || undefined, giver: text(data, 'giver'), kind, texts: [text(data, 'member'), text(data, 'regular'), text(data, 'insider')],
      // A group reward rides on one event (picked from the list) or on every event of a host (typed).
      listingId: kind === 'group' && uuid(on) ? on : null, hostName: kind === 'group' && !uuid(on) ? text(data, 'hostName') : null, headCount: number(text(data, 'headCount')),
      rule: text(data, 'rule'), ruleCount: number(text(data, 'ruleCount')), ruleWord: text(data, 'ruleWord'),
    });
    return 'Reward saved.';
  });
}
export async function setRewardHiddenAction(data: FormData): Promise<void> {
  await admin(data, async () => { const hidden = text(data, 'hidden') === 'true'; await setRewardHidden(db(), uuid(text(data, 'reward')), hidden); return hidden ? 'Reward hidden. What was already used stays used.' : 'Reward showing again.'; });
}

'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { CampusError } from '@/lib/campus/errors';
import { subscribeInkPlus } from '@/lib/campus/ink';
import { askGroupPicture, keepGroupPicture, type Pick } from '@/lib/emba/group-picture';
import { getPortalPrincipal } from '@/lib/emba/portal-session';

// The "Group picture" card's three presses (openspec loop-group-picture). Each one finds out again who is asking:
// nothing the page sends says who the person is or what they may do.

// Two drawings can take a minute: the page that mounts the card sets maxDuration, since a file of actions may export nothing but actions.
export type PictureResult = { ok: true; tokens?: string[] } | { ok: false; message: string };
type Scope = { orgId: string; loopId: string };
async function act(run: (principal: NonNullable<Awaited<ReturnType<typeof getPortalPrincipal>>>) => Promise<string[] | void>): Promise<PictureResult> {
  const principal = await getPortalPrincipal();
  if (!principal) return { ok: false, message: 'Sign in to continue.' };
  try {
    const tokens = await run(principal);
    revalidatePath('/groups');
    return { ok: true, ...(tokens ? { tokens } : {}) };
  } catch (error) {
    // A CampusError is a sentence written for the person. Anything else says only that it did not work.
    return { ok: false, message: error instanceof CampusError ? error.message : 'That did not go through. Check your access and try again.' };
  }
}
/** "Subscribe" on the Ink+ plate of the card. Nothing is charged: the ask is kept, with where it was made. */
export async function subscribeInkPlusAction(email: string): Promise<PictureResult> {
  return act(async principal => { if (!await subscribeInkPlus(db(), principal.personId, String(email), 'group picture')) throw new CampusError('Enter the email to subscribe with.'); });
}
/** "Draw us together": the picked animals, and a short line of the person's own for what should change. */
export async function drawGroupPictureAction(scope: Scope, picks: Pick[], note = ''): Promise<PictureResult> {
  return act(async principal => (await askGroupPicture(db(), principal, scope, picks, undefined, String(note))).tokens);
}
/** "Keep this one". */
export async function keepGroupPictureAction(scope: Scope, token: string): Promise<PictureResult> {
  return act(principal => keepGroupPicture(db(), principal, scope, String(token)));
}

'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { campusViewer } from '@/lib/campus/session';
import { pressTap, type TapDone, type TapRefusal } from '@/lib/campus/tap';

/** The press on /c/tap/<code>: the link's code, for the signed-in person it was made for (openspec campus-assistant-tools, design D6). */
export async function tapAction(code: string): Promise<TapDone | TapRefusal | { done: false; reason: 'sign_in' }> {
  const viewer = await campusViewer();
  if (!viewer) return { done: false, reason: 'sign_in' };
  const result = await pressTap(db(), viewer.personId, code, 'link');
  if (result.done) { revalidatePath('/c', 'layout'); revalidatePath('/o', 'layout'); }
  return result;
}

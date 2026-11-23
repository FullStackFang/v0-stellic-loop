'use server';

import { db } from '@/lib/db';
import { hasAssistants, planOf, type Plan } from '@/lib/campus/ink';
import { getPortalPrincipal } from '@/lib/emba/portal-session';

// "Assistants" at the foot of every page is part of Ink+ (components/campus/foot.tsx). Each press finds out again who is asking.

/** Whether the person at the foot of the page may open Assistants: what the link there does when pressed. */
export async function hasInkPlusAction(): Promise<boolean> {
  const principal = await getPortalPrincipal();
  return !!principal && hasAssistants(db(), principal);
}
/** The plan of the person asking, so an Ink+ ask can say what Ink+ adds to Ink. Free for nobody signed in. */
export async function planHereAction(): Promise<Plan> {
  const principal = await getPortalPrincipal();
  return principal ? planOf(db(), principal.personId) : 'free';
}

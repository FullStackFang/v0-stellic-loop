'use server';

import { db } from '@/lib/db';
import { hasAssistants, subscribeInkPlus } from '@/lib/campus/ink';
import { getPortalPrincipal } from '@/lib/emba/portal-session';

// "Assistants" at the foot of every page is part of Ink+ (components/campus/foot.tsx). Each press finds out again who is asking.

/** Whether the person at the foot of the page may open Assistants: what the link there does when pressed. */
export async function hasInkPlusAction(): Promise<boolean> {
  const principal = await getPortalPrincipal();
  return !!principal && hasAssistants(db(), principal);
}
/** "Subscribe" on the card at the foot. Nothing is charged: the ask is kept, with when it was made and that it was made here. False for an email that is not one, or for nobody signed in. */
export async function subscribeAtFootAction(email: string): Promise<boolean> {
  const principal = await getPortalPrincipal();
  return !!principal && subscribeInkPlus(db(), principal.personId, String(email), 'footer');
}

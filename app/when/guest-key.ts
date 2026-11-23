import { cookies } from 'next/headers';

/** The mark a guest's browser keeps: it finds their answers again, here and on other polls. It says nothing about who they are. */
export const GUEST = 'wn_g';
/** The mark this browser holds, if any. For a page to find its guest (lib/when/guests.ts). */
export async function guestKey(): Promise<string | undefined> {
  try { return (await cookies()).get(GUEST)?.value; } catch { return undefined; }
}

/**
 * The one admin (design D17): whoever LOOP_ADMIN lists, by sign-in account id or by email address.
 * With the variable empty nobody is the admin, and nothing inside the app can make someone one.
 * No 'server-only' here: proxy.ts asks this too.
 */
export function isAdmin(who: { subject: string; verifiedEmail: string | null } | null | undefined): boolean {
  if (!who) return false;
  const listed = (process.env.LOOP_ADMIN ?? '').split(/[\s,]+/).filter(Boolean);
  const email = who.verifiedEmail?.trim().toLowerCase();
  return listed.some(entry => entry.includes('@') ? !!email && entry.toLowerCase() === email : !!who.subject && entry === who.subject);
}

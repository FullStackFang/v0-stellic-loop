import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { clerkClient, clerkMiddleware } from '@clerk/nextjs/server';
import { isAdmin } from "@/lib/campus/admin";
import { frontIsCampus } from "@/lib/campus/schools";
import { ENTRY_COOKIE, entryFromUrl } from "@/lib/events";

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/**
 * The pages of the current site that lead into groups (openspec loop-campus-rewards, design D17). With LOOP_FRONT=campus
 * they open for the admin alone and send everyone else to `/`. Sign-in stays reachable, and so does the link in every
 * email that stops the emails. Crons, the routes members' assistants connect through, the legal pages and /demo are
 * not on this list and are never gated.
 */
export function leadsIntoGroups(path: string): boolean {
  if (under(path, '/groups/sign-in') || under(path, '/emba/sign-in') || under(path, '/groups/reach/stop')) return false;
  return under(path, '/groups') || under(path, '/emba') || path.startsWith('/e/') || path.startsWith('/a/');
}
/** The campus app: the front door, the campus screen, share links and its sign-in. */
const isCampus = (path: string) => path === '/' || under(path, '/c') || under(path, '/o') || under(path, '/sign-in');
const usesSignIn = (path: string) => under(path, '/emba') || under(path, '/groups') || path.startsWith('/e/') || path.startsWith('/a/') || path.startsWith('/api/emba/documents/');

// Whether a signed-in account is the admin. LOOP_ADMIN may list an email address, which the session does not carry,
// so the account is looked up, and the answer kept for a minute.
const known = new Map<string, { admin: boolean; until: number }>();
async function adminAccount(userId: string): Promise<boolean> {
  if (isAdmin({ subject: userId, verifiedEmail: null })) return true;
  if (!(process.env.LOOP_ADMIN ?? '').includes('@')) return false;
  const kept = known.get(userId);
  if (kept && kept.until > Date.now()) return kept.admin;
  let admin = false;
  try {
    const user = await (await clerkClient()).users.getUser(userId);
    const email = user.emailAddresses.find(each => each.id === user.primaryEmailAddressId && each.verification?.status === 'verified')?.emailAddress.trim().toLowerCase() ?? null;
    admin = isAdmin({ subject: userId, verifiedEmail: email });
  } catch { return false; }
  if (known.size > 500) known.clear();
  known.set(userId, { admin, until: Date.now() + 60_000 });
  return admin;
}

/**
 * Sign-in for the pages that use it, the admin gate (above), and how a visit entered, for event attribution. A
 * navigation from outside the site (a chat app, a pasted link) resets the entry from its URL:
 * a share token → proposal_link, else group_link. Navigation within the site
 * keeps it, so a share stays credited until the next outside entry.
 */
export function proxy(req: NextRequest,event:NextFetchEvent) {
  const path=req.nextUrl.pathname, front=frontIsCampus();
  // With the flag unset the front page is what it was: no sign-in work, nothing recorded.
  if(path==='/'&&!front) return NextResponse.next();
  if(usesSignIn(path)||isCampus(path)) {
    const gated=front&&leadsIntoGroups(path), toFront=()=>NextResponse.redirect(new URL('/',req.url));
    if(!(process.env.LOOP_AUTH_PROVIDER==='clerk'&&process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY&&process.env.CLERK_SECRET_KEY)) return gated?toFront():NextResponse.next();
    return clerkMiddleware(async auth=>{
      if(!gated) return;
      const {userId}=await auth();
      if(!userId||!await adminAccount(userId)) return toFront();
    },{signInUrl:isCampus(path)||front?'/sign-in':'/groups/sign-in'})(req,event);
  }
  const res = NextResponse.next();
  const site = req.headers.get("sec-fetch-site");
  const isDocument = req.headers.get("sec-fetch-dest") === "document" || req.headers.get("accept")?.includes("text/html");
  const fromOutside = site !== "same-origin";
  const hasToken = req.nextUrl.searchParams.has("s");
  if ((isDocument && fromOutside) || hasToken || !req.cookies.get(ENTRY_COOKIE)) {
    res.cookies.set(ENTRY_COOKIE, entryFromUrl(req.nextUrl.searchParams), { httpOnly: true, sameSite: "lax", path: "/" });
  }
  return res;
}

export const config = {
  matcher: ["/", "/b/:path*", "/p/:path*", "/emba/:path*", "/groups/:path*", "/e/:path*", "/a/:path*","/api/emba/documents/:path*", "/c/:path*", "/o/:path*", "/sign-in/:path*"],
};

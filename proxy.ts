import { NextResponse, type NextRequest } from "next/server";
import { ENTRY_COOKIE, entryFromUrl } from "@/lib/events";

/**
 * Records how a visit entered, for event attribution. A navigation from
 * outside the site (a chat app, a pasted link) resets the entry from its URL:
 * a share token → proposal_link, else group_link. Navigation within the site
 * keeps it, so a share stays credited until the next outside entry.
 */
export function proxy(req: NextRequest) {
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
  matcher: ["/b/:path*", "/p/:path*"],
};

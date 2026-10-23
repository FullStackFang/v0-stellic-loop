import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ENTRY_COOKIE, entryFromUrl } from "@/lib/events";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, sessionSecret, signSession } from "@/lib/session";
import { hashToken } from "@/lib/tokens";

/** Only same-origin paths; anything else lands on the home page. */
function safePath(to: string | null): string {
  if (!to || !to.startsWith("/") || to.startsWith("//") || to.includes("\\")) return "/";
  return to;
}

/** `/m/<token>?to=<path>&src=<source>`: a single-use link from a text sets the session. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const to = safePath(req.nextUrl.searchParams.get("to"));
  const dest = new URL(to, req.nextUrl.origin);
  const res = NextResponse.redirect(dest, 303);
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(ENTRY_COOKIE, entryFromUrl(req.nextUrl.searchParams), { httpOnly: true, sameSite: "lax", path: "/" });

  const { rows } = await db().query<{ person_id: string }>(
    `update magic_token set used_at = now()
     where token_hash = $1 and used_at is null and expires_at > now()
     returning person_id`,
    [hashToken(token)],
  );
  if (rows[0]) {
    res.cookies.set(SESSION_COOKIE, signSession(rows[0].person_id, sessionSecret()), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_S,
    });
  }
  return res;
}

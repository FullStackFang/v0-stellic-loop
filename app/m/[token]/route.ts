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

type Row = { person_id: string | null; to_path: string | null; source: string | null };

/**
 * `/m/<token>`: a single-use link from a text sets the session. The token's
 * stored destination and source win over `?to=<path>&src=<source>`; a used or
 * expired token still lands there, signed out.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const hash = hashToken(token);
  const q = db();
  const { rows: [fresh] } = await q.query<Row>(
    `update magic_token set used_at = now()
     where token_hash = $1 and used_at is null and expires_at > now()
     returning person_id, to_path, source`,
    [hash],
  );
  const row = fresh ?? (await q.query<Row>(
    "select null::uuid person_id, to_path, source from magic_token where token_hash = $1", [hash])).rows[0];

  const search = new URLSearchParams(req.nextUrl.searchParams);
  if (row?.source) search.set("src", row.source);
  const dest = new URL(safePath(row?.to_path ?? search.get("to")), req.nextUrl.origin);
  const res = NextResponse.redirect(dest, 303);
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(ENTRY_COOKIE, entryFromUrl(search), { httpOnly: true, sameSite: "lax", path: "/" });
  if (row?.person_id) {
    res.cookies.set(SESSION_COOKIE, signSession(row.person_id, sessionSecret()), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_S,
    });
  }
  return res;
}

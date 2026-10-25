// Who is acting. A valid `qb` cookie is the whole session; without one, a name
// and a number: an unknown number becomes a person on the spot, a known number
// gets a one-time code and the action waits for it (the `pending` replay).
import "server-only";
import { cookies } from "next/headers";
import type { Q } from "./db";
import { ENTRY_COOKIE, resolveSource, writeEvent, type Attribution } from "./events";
import { notifier } from "./notify";
import { isForeignNumber, isUsNumber, normalizePhone } from "./phone";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, sessionSecret, signSession, verifySession } from "./session";
import { hashCode, sixDigitCode } from "./tokens";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_ATTEMPTS = 5;

export type IdentityInput = { name?: string | null; phone?: string | null };

/** What to do once a known number proves itself. */
export type Pending =
  | { kind: "respond"; proposalId: string; answer: "in" | "out" | "maybe" }
  | { kind: "post"; boardId: string; post: Record<string, unknown> }
  | { kind: "board"; name: string; tz: string };

export type Who =
  | { kind: "session"; personId: string }
  | { kind: "new"; personId: string }
  | { kind: "needs_code"; phone: string }
  | { kind: "error"; error: "need_identity" | "bad_phone" | "not_us" | "need_name" | "code_not_sent" };

/** The signed-in person id, or null. Does not touch the database. */
export async function sessionPersonId(): Promise<string | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value, sessionSecret())?.person_id ?? null;
}

/** Sets (or refreshes) the session cookie. Only callable from actions and route handlers. */
export async function setSession(personId: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(personId, sessionSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

/** This visit's attribution, from the entry cookie the proxy set. */
export async function attribution(q: Q): Promise<Attribution> {
  const jar = await cookies();
  return resolveSource(q, jar.get(ENTRY_COOKIE)?.value);
}

/**
 * Resolve the actor inside a transaction. Known number without a cookie:
 * stores a hashed code with `pending`, hands the code to the notifier, and
 * returns `needs_code` — the caller must commit and record nothing else.
 * A code that cannot be texted is discarded and returns `code_not_sent`.
 */
export async function withIdentity(q: Q, input: IdentityInput, ctx: { boardId: string | null; pending: Pending }): Promise<Who> {
  const sid = await sessionPersonId();
  if (sid) {
    const { rows } = await q.query("select 1 from person where id = $1", [sid]);
    if (rows.length) return { kind: "session", personId: sid };
  }
  const name = input.name?.trim();
  const raw = input.phone?.trim();
  if (!raw && !name) return { kind: "error", error: "need_identity" };
  const phone = raw ? normalizePhone(raw) : null;
  if (raw && isForeignNumber(raw)) return { kind: "error", error: "not_us" };
  if (!phone || !isUsNumber(phone)) return { kind: "error", error: "bad_phone" };

  const { rows: found } = await q.query<{ id: string }>("select id from person where phone = $1", [phone]);
  if (found[0]) {
    if (!(await issueCode(q, phone, found[0].id, ctx.boardId, ctx.pending))) return { kind: "error", error: "code_not_sent" };
    return { kind: "needs_code", phone };
  }
  if (!name) return { kind: "error", error: "need_name" };
  const { rows: made } = await q.query<{ id: string }>(
    "insert into person (phone, name) values ($1, $2) returning id",
    [phone, name.slice(0, 80)],
  );
  return { kind: "new", personId: made[0].id };
}

/** False when the text did not go; the stored code is gone again. */
async function issueCode(q: Q, phone: string, personId: string, boardId: string | null, pending: Pending): Promise<boolean> {
  const code = sixDigitCode();
  await q.query(
    `insert into otp_code (phone, code_hash, expires_at, attempts, pending)
     values ($1, $2, $3, 0, $4)
     on conflict (phone) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at,
       attempts = 0, pending = excluded.pending, created_at = now()`,
    [phone, hashCode(phone, code, sessionSecret()), new Date(Date.now() + CODE_TTL_MS).toISOString(), JSON.stringify(pending)],
  );
  const { sent } = await notifier(q).code({ boardId, personId, phone, code });
  if (!sent) await q.query("delete from otp_code where phone = $1", [phone]);
  return sent;
}

/**
 * Puts the person on the board's roster if they are not on it yet, writing
 * `person_added` with the proposal that brought them.
 */
export async function joinBoard(q: Q, boardId: string, personId: string, proposalId: string | null, attr: Attribution): Promise<void> {
  const { rows } = await q.query(
    `insert into board_person (board_id, person_id, joined_via, via_proposal_id)
     values ($1, $2, $3, $4) on conflict do nothing returning person_id`,
    [boardId, personId, attr.source, proposalId],
  );
  if (rows.length) {
    await writeEvent(q, { boardId, proposalId, personId, type: "person_added", source: attr.source, shareId: attr.shareId });
  }
}

export const IDENTITY_ERRORS: Record<Extract<Who, { kind: "error" }>["error"], string> = {
  need_identity: "Add your name and number to answer.",
  bad_phone: "That number doesn't look right.",
  not_us: "US numbers only for now.",
  need_name: "Add your name too.",
  code_not_sent: "We couldn't text that number. Try again.",
};

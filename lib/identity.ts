// Who is acting. A valid `qb` cookie is the whole session; without one, a name
// and a number: an unknown number becomes a person on the spot, a known number
// gets a one-time code and the action waits for it (the `pending` replay).
import "server-only";
import { cookies } from "next/headers";
import type { Q } from "./db";
import { ENTRY_COOKIE, resolveSource, writeEvent, type Attribution } from "./events";
import { notifier } from "./notify";
import { normalizePhone } from "./phone";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, sessionSecret, signSession, verifySession } from "./session";
import { hashCode, sixDigitCode } from "./tokens";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_ATTEMPTS = 5;

export type IdentityInput = { name?: string | null; phone?: string | null };

/** What to do once a known number proves itself. */
export type Pending =
  | { kind: "respond"; proposalId: string; answer: "in" | "out" | "maybe" }
  | { kind: "post"; boardId: string; post: Record<string, unknown> };

export type Who =
  | { kind: "session"; personId: string }
  | { kind: "new"; personId: string }
  | { kind: "needs_code"; phone: string }
  | { kind: "error"; error: "need_identity" | "bad_phone" | "need_name" };

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
 */
export async function withIdentity(q: Q, input: IdentityInput, ctx: { boardId: string; pending: Pending }): Promise<Who> {
  const sid = await sessionPersonId();
  if (sid) {
    const { rows } = await q.query("select 1 from person where id = $1", [sid]);
    if (rows.length) return { kind: "session", personId: sid };
  }
  const name = input.name?.trim();
  const raw = input.phone?.trim();
  if (!raw && !name) return { kind: "error", error: "need_identity" };
  const phone = raw ? normalizePhone(raw) : null;
  if (!phone) return { kind: "error", error: "bad_phone" };

  const { rows: found } = await q.query<{ id: string }>("select id from person where phone = $1", [phone]);
  if (found[0]) {
    await issueCode(q, phone, found[0].id, ctx.boardId, ctx.pending);
    return { kind: "needs_code", phone };
  }
  if (!name) return { kind: "error", error: "need_name" };
  const { rows: made } = await q.query<{ id: string }>(
    "insert into person (phone, name) values ($1, $2) returning id",
    [phone, name.slice(0, 80)],
  );
  return { kind: "new", personId: made[0].id };
}

async function issueCode(q: Q, phone: string, personId: string, boardId: string, pending: Pending) {
  const code = sixDigitCode();
  await q.query(
    `insert into otp_code (phone, code_hash, expires_at, attempts, pending)
     values ($1, $2, $3, 0, $4)
     on conflict (phone) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at,
       attempts = 0, pending = excluded.pending, created_at = now()`,
    [phone, hashCode(phone, code, sessionSecret()), new Date(Date.now() + CODE_TTL_MS).toISOString(), JSON.stringify(pending)],
  );
  await notifier(q).code({ boardId, personId, phone, code });
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
  bad_phone: "That number doesn't look right. Outside the US, start with +country code.",
  need_name: "Add your name too.",
};

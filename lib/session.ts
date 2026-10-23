// The session is a signed cookie `qb` = base64url({person_id, iat}).hmac.
// Pure: signing and verifying only. Reading/writing the cookie is lib/identity.ts.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "qb";
export const SESSION_MAX_AGE_S = 365 * 24 * 60 * 60;

export type Session = { person_id: string; iat: number };

function mac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function signSession(personId: string, secret: string, now: Date = new Date()): string {
  const body = Buffer.from(JSON.stringify({ person_id: personId, iat: Math.floor(now.getTime() / 1000) })).toString("base64url");
  return `${body}.${mac(body, secret)}`;
}

/** The session, or null when the value is missing, tampered with, malformed or older than a year. */
export function verifySession(value: string | undefined | null, secret: string, now: Date = new Date()): Session | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot < 1) return null;
  const body = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const want = Buffer.from(mac(body, secret));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof s?.person_id !== "string" || typeof s?.iat !== "number") return null;
    if (now.getTime() / 1000 - s.iat > SESSION_MAX_AGE_S) return null;
    return { person_id: s.person_id, iat: s.iat };
  } catch {
    return null;
  }
}

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET is not set");
  return s;
}

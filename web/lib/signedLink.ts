import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed one-tap RSVP links for the day-before reminder (design.md
 * "Signed one-tap links in reminders"). A token binds one membership, one
 * occurrence, and one status, and expires after 48 h.
 *
 * Token format: `<base64url(JSON payload)>.<base64url(HMAC-SHA256)>` — two
 * URL-safe segments joined by a single `.`. The payload holds only the two
 * uuids, the status, and the expiry; the HMAC is computed over the encoded
 * payload segment with the shared secret (`REMINDER_LINK_SECRET` in the
 * handler). The token is opaque to the recipient: no session, no member
 * data, nothing beyond what is needed to record exactly that RSVP.
 */

export type RsvpStatus = "in" | "out";

export interface RsvpLinkPayload {
  membershipId: string;
  occurrenceId: string;
  status: RsvpStatus;
  /** Expiry as unix seconds. */
  exp: number;
}

export const RSVP_LINK_TTL_SECONDS = 48 * 60 * 60;

const SEGMENT = /^[A-Za-z0-9_-]+$/;

function hmac(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

/**
 * Builds a URL-safe token. Throws on an empty secret, empty ids, a status
 * outside 'in' | 'out', or a non-positive ttl, so a caller bug fails loud
 * instead of mailing a link that can never verify.
 */
export function signRsvpLink(
  payload: Omit<RsvpLinkPayload, "exp">,
  secret: string,
  now: Date = new Date(),
  ttlSeconds: number = RSVP_LINK_TTL_SECONDS,
): string {
  if (!secret) throw new Error("signRsvpLink: secret is required");
  if (typeof payload.membershipId !== "string" || payload.membershipId.length === 0) {
    throw new Error("signRsvpLink: membershipId is required");
  }
  if (typeof payload.occurrenceId !== "string" || payload.occurrenceId.length === 0) {
    throw new Error("signRsvpLink: occurrenceId is required");
  }
  if (payload.status !== "in" && payload.status !== "out") {
    throw new Error("signRsvpLink: status must be 'in' or 'out'");
  }
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("signRsvpLink: ttlSeconds must be a finite positive number");
  }
  const full: RsvpLinkPayload = {
    membershipId: payload.membershipId,
    occurrenceId: payload.occurrenceId,
    status: payload.status,
    exp: Math.floor(now.getTime() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  return `${encoded}.${hmac(encoded, secret)}`;
}

/** Returns the payload, or null on bad format, bad signature, or expiry. Never throws. */
export function verifyRsvpLink(
  token: string,
  secret: string,
  now: Date = new Date(),
): RsvpLinkPayload | null {
  if (!secret || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  if (!SEGMENT.test(encoded) || !SEGMENT.test(signature)) return null;

  // Compare the canonical base64url strings (not decoded bytes) so a flipped
  // padding bit in the last character cannot slip through, and always with a
  // constant-time comparison.
  const expected = Buffer.from(hmac(encoded, secret), "utf8");
  const given = Buffer.from(signature, "utf8");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { membershipId, occurrenceId, status, exp } = parsed as Record<string, unknown>;
  if (typeof membershipId !== "string" || membershipId.length === 0) return null;
  if (typeof occurrenceId !== "string" || occurrenceId.length === 0) return null;
  if (status !== "in" && status !== "out") return null;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;

  if (Math.floor(now.getTime() / 1000) >= exp) return null;

  return { membershipId, occurrenceId, status, exp };
}

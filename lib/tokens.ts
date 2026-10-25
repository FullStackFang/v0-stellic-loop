import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import type { Q } from "./db";
import type { Source } from "./types";
import { appUrl } from "./url";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** 10 base62 characters (~59 bits), unbiased. */
export function shareToken(): string {
  let out = "";
  while (out.length < 10) {
    for (const b of randomBytes(16)) {
      // 248 = 4 * 62: reject the tail to keep the distribution flat
      if (b < 248 && out.length < 10) out += ALPHABET[b % 62];
    }
  }
  return out;
}

export function isShareToken(s: unknown): s is string {
  return typeof s === "string" && /^[0-9A-Za-z]{10}$/.test(s);
}

/** Six digits, leading zeros kept. */
export function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Codes are six digits, so a bare hash is brute-forceable from a leaked row:
 * key it with the server secret and bind it to the phone.
 */
export function hashCode(phone: string, code: string, secret: string): string {
  return createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

/** 16 random bytes (128 bits), base64url: 22 characters, so a link fits in a text. */
export function magicToken(): string {
  return randomBytes(16).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const MAGIC_TTL_MS = 24 * 60 * 60 * 1000;

/** A single-use sign-in link for one person; the token stores where it lands and its source. */
export async function issueMagicLink(q: Q, personId: string, toPath: string, source: Source): Promise<string> {
  const token = magicToken();
  await q.query(
    "insert into magic_token (token_hash, person_id, expires_at, to_path, source) values ($1, $2, $3, $4, $5)",
    [hashToken(token), personId, new Date(Date.now() + MAGIC_TTL_MS).toISOString(), toPath, source],
  );
  return appUrl(`/m/${token}`);
}

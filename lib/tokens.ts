import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

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

/** 32 random bytes, base64url. */
export function magicToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  RSVP_LINK_TTL_SECONDS,
  signRsvpLink,
  verifyRsvpLink,
  type RsvpLinkPayload,
} from "@/lib/signedLink";

const SECRET = "test-reminder-link-secret";
const NOW = new Date("2026-11-03T15:00:00Z");
const NOW_SEC = Math.floor(NOW.getTime() / 1000);
const payload = {
  membershipId: "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
  occurrenceId: "0a9b8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d",
  status: "in" as const,
};

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Replace the character at `i` with a different one from the URL-safe alphabet. */
function flip(token: string, i: number): string {
  const c = token[i];
  const replacement = c === "A" ? "B" : "A";
  return token.slice(0, i) + replacement + token.slice(i + 1);
}

/**
 * A different last character that decodes to the same bytes: base64url leaves
 * 4 or 2 bits of the final character unused when the segment length is 2 or 3
 * mod 4, so any character agreeing on the used bits is byte-equivalent.
 */
function equivalentLastChar(segment: string): string {
  const unused = [0, 0, 4, 2][segment.length % 4];
  if (unused === 0) throw new Error("segment has no unused bits; pick a different fixture");
  const mask = ~((1 << unused) - 1) & 63;
  const last = segment[segment.length - 1];
  const idx = ALPHABET.indexOf(last);
  const alt = [...ALPHABET].find((c) => c !== last && (ALPHABET.indexOf(c) & mask) === (idx & mask));
  if (!alt) throw new Error("no byte-equivalent character found");
  return segment.slice(0, -1) + alt;
}

/** Encode arbitrary JSON and sign it exactly as signRsvpLink does. */
function forge(json: unknown, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(json), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

describe("signRsvpLink / verifyRsvpLink", () => {
  it("round-trips: sign then verify returns the payload with a 48 h expiry", () => {
    const token = signRsvpLink(payload, SECRET, NOW);
    const verified = verifyRsvpLink(token, SECRET, NOW);
    expect(verified).toEqual<RsvpLinkPayload>({
      ...payload,
      exp: NOW_SEC + RSVP_LINK_TTL_SECONDS,
    });
  });

  it("binds status: an 'out' token verifies as out, not in", () => {
    const token = signRsvpLink({ ...payload, status: "out" }, SECRET, NOW);
    expect(verifyRsvpLink(token, SECRET, NOW)?.status).toBe("out");
  });

  it("is URL-safe: two [A-Za-z0-9_-] segments joined by a single '.'", () => {
    const token = signRsvpLink(payload, SECRET, NOW);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(token)).toBe(token);
  });

  it("is opaque: carries nothing beyond the two uuids, status, and expiry", () => {
    const token = signRsvpLink(payload, SECRET, NOW);
    const decoded = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
    expect(Object.keys(decoded).sort()).toEqual(["exp", "membershipId", "occurrenceId", "status"]);
    expect(token).not.toContain(SECRET);
  });

  it("agrees with the forge helper (same encoding and HMAC)", () => {
    const token = signRsvpLink(payload, SECRET, NOW);
    expect(forge({ ...payload, exp: NOW_SEC + RSVP_LINK_TTL_SECONDS }, SECRET)).toBe(token);
  });

  it("returns null when any single character is tampered with", () => {
    const token = signRsvpLink(payload, SECRET, NOW);
    for (let i = 0; i < token.length; i++) {
      expect(verifyRsvpLink(flip(token, i), SECRET, NOW), `index ${i}`).toBeNull();
    }
  });

  it("rejects a byte-equivalent but non-canonical last character in either segment", () => {
    const token = signRsvpLink(payload, SECRET, NOW);
    const [encoded, signature] = token.split(".");

    const sig2 = equivalentLastChar(signature);
    expect(sig2).not.toBe(signature);
    expect(Buffer.from(sig2, "base64url").equals(Buffer.from(signature, "base64url"))).toBe(true);
    expect(verifyRsvpLink(`${encoded}.${sig2}`, SECRET, NOW)).toBeNull();

    const enc2 = equivalentLastChar(encoded);
    expect(enc2).not.toBe(encoded);
    expect(Buffer.from(enc2, "base64url").equals(Buffer.from(encoded, "base64url"))).toBe(true);
    expect(verifyRsvpLink(`${enc2}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it("rejects a payload segment spliced onto another token's signature", () => {
    const a = signRsvpLink(payload, SECRET, NOW).split(".");
    const b = signRsvpLink(
      { ...payload, occurrenceId: "ffffffff-0000-4000-8000-000000000001" },
      SECRET,
      NOW,
    ).split(".");
    expect(a[1]).not.toBe(b[1]);
    expect(verifyRsvpLink(`${a[0]}.${b[1]}`, SECRET, NOW)).toBeNull();
    expect(verifyRsvpLink(`${b[0]}.${a[1]}`, SECRET, NOW)).toBeNull();
  });

  it("returns null for a different secret", () => {
    const token = signRsvpLink(payload, SECRET, NOW);
    expect(verifyRsvpLink(token, "another-secret", NOW)).toBeNull();
  });

  it("returns null once expired (48 h + 1 s later)", () => {
    const token = signRsvpLink(payload, SECRET, NOW);
    const later = new Date(NOW.getTime() + (RSVP_LINK_TTL_SECONDS + 1) * 1000);
    expect(verifyRsvpLink(token, SECRET, later)).toBeNull();
  });

  it("verifies just under 48 h", () => {
    const token = signRsvpLink(payload, SECRET, NOW);
    const almost = new Date(NOW.getTime() + (RSVP_LINK_TTL_SECONDS - 1) * 1000);
    expect(verifyRsvpLink(token, SECRET, almost)).not.toBeNull();
  });

  it("honors a custom ttl", () => {
    const token = signRsvpLink(payload, SECRET, NOW, 60);
    expect(verifyRsvpLink(token, SECRET, new Date(NOW.getTime() + 59_000))).not.toBeNull();
    expect(verifyRsvpLink(token, SECRET, new Date(NOW.getTime() + 60_000))).toBeNull();
  });

  it("returns null on malformed tokens without throwing", () => {
    const token = signRsvpLink(payload, SECRET, NOW);
    const [encoded, signature] = token.split(".");
    expect(verifyRsvpLink("", SECRET, NOW)).toBeNull();
    expect(verifyRsvpLink(undefined as unknown as string, SECRET, NOW)).toBeNull();
    expect(verifyRsvpLink("not-a-token", SECRET, NOW)).toBeNull();
    expect(verifyRsvpLink(`${encoded}.${signature}.extra`, SECRET, NOW)).toBeNull();
    expect(verifyRsvpLink(`${encoded}+.${signature}`, SECRET, NOW)).toBeNull();
    expect(verifyRsvpLink(`${encoded}.${signature.slice(0, -1)}`, SECRET, NOW)).toBeNull();
    expect(verifyRsvpLink(token, "", NOW)).toBeNull();
  });

  it("rejects characters a lenient base64 decoder would accept", () => {
    const token = signRsvpLink(payload, SECRET, NOW);
    const [encoded, signature] = token.split(".");
    expect(verifyRsvpLink(`${encoded}.${signature}=`, SECRET, NOW)).toBeNull();
    expect(
      verifyRsvpLink(`${encoded}.${signature.slice(0, 10)}/${signature.slice(10)}`, SECRET, NOW),
    ).toBeNull();
    expect(verifyRsvpLink(`${encoded}=.${signature}`, SECRET, NOW)).toBeNull();
  });

  const exp = NOW_SEC + RSVP_LINK_TTL_SECONDS;
  it.each<[string, unknown]>([
    ["array", []],
    ["null", null],
    ["string", "x"],
    ["missing exp", { ...payload }],
    ["string exp", { ...payload, exp: String(exp) }],
    ["empty membershipId", { ...payload, membershipId: "", exp }],
    ["empty occurrenceId", { ...payload, occurrenceId: "", exp }],
    ["status maybe", { ...payload, status: "maybe", exp }],
  ])("rejects a correctly signed payload with an invalid shape: %s", (_name, json) => {
    expect(verifyRsvpLink(forge(json, SECRET), SECRET, NOW)).toBeNull();
  });

  it("accepts a correctly signed payload with keys in a different order", () => {
    const reordered = {
      exp,
      status: payload.status,
      occurrenceId: payload.occurrenceId,
      membershipId: payload.membershipId,
    };
    expect(verifyRsvpLink(forge(reordered, SECRET), SECRET, NOW)).toEqual({ ...payload, exp });
  });

  it("refuses to sign with an empty secret", () => {
    expect(() => signRsvpLink(payload, "", NOW)).toThrow();
  });

  it("refuses to sign an invalid payload or ttl", () => {
    expect(() => signRsvpLink({ ...payload, membershipId: "" }, SECRET, NOW)).toThrow(
      /membershipId/,
    );
    expect(() => signRsvpLink({ ...payload, occurrenceId: "" }, SECRET, NOW)).toThrow(
      /occurrenceId/,
    );
    expect(() =>
      signRsvpLink({ ...payload, status: "maybe" as unknown as "in" }, SECRET, NOW),
    ).toThrow(/status/);
    expect(() => signRsvpLink(payload, SECRET, NOW, 0)).toThrow(/ttlSeconds/);
    expect(() => signRsvpLink(payload, SECRET, NOW, -1)).toThrow(/ttlSeconds/);
    expect(() => signRsvpLink(payload, SECRET, NOW, Number.NaN)).toThrow(/ttlSeconds/);
    expect(() => signRsvpLink(payload, SECRET, NOW, Number.POSITIVE_INFINITY)).toThrow(
      /ttlSeconds/,
    );
  });
});

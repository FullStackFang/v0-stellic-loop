import { describe, expect, it } from "vitest";
import { normalizePhone } from "../phone";
import { SESSION_MAX_AGE_S, signSession, verifySession } from "../session";
import { hashCode, hashToken, isShareToken, magicToken, shareToken, sixDigitCode } from "../tokens";

const SECRET = "s".repeat(32);

describe("phone", () => {
  it("normalises US numbers and matches other spellings", () => {
    expect(normalizePhone("(607) 555-0123")).toBe("+16075550123");
    expect(normalizePhone("+1 607 555 0123")).toBe("+16075550123");
  });
  it("keeps international numbers given with +country", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });
  it("rejects invalid numbers", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("session", () => {
  it("round-trips", () => {
    const v = signSession("person-1", SECRET);
    expect(verifySession(v, SECRET)?.person_id).toBe("person-1");
  });
  it("treats a tampered cookie as absent", () => {
    const v = signSession("person-1", SECRET);
    const [body, mac] = v.split(".");
    const forged = Buffer.from(JSON.stringify({ person_id: "person-2", iat: 1 })).toString("base64url");
    expect(verifySession(`${forged}.${mac}`, SECRET)).toBeNull();
    expect(verifySession(`${body}.${mac.slice(0, -2)}xx`, SECRET)).toBeNull();
    expect(verifySession(v, "other".repeat(8))).toBeNull();
    expect(verifySession("garbage", SECRET)).toBeNull();
    expect(verifySession(undefined, SECRET)).toBeNull();
  });
  it("expires after a year", () => {
    const issued = new Date("2026-11-01T00:00:00Z");
    const v = signSession("p", SECRET, issued);
    expect(verifySession(v, SECRET, new Date(issued.getTime() + (SESSION_MAX_AGE_S - 1) * 1000))).not.toBeNull();
    expect(verifySession(v, SECRET, new Date(issued.getTime() + (SESSION_MAX_AGE_S + 1) * 1000))).toBeNull();
  });
});

describe("tokens", () => {
  it("share tokens are 10 base62 chars and unique over 10k", () => {
    const set = new Set(Array.from({ length: 10_000 }, shareToken));
    expect(set.size).toBe(10_000);
    for (const t of [...set].slice(0, 100)) expect(isShareToken(t)).toBe(true);
  });
  it("magic tokens are unique over 10k and hash stably", () => {
    const set = new Set(Array.from({ length: 10_000 }, magicToken));
    expect(set.size).toBe(10_000);
    const t = magicToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toBe(t);
  });
  it("codes are six digits and hashed with the phone and the secret", () => {
    for (let i = 0; i < 1000; i++) expect(sixDigitCode()).toMatch(/^\d{6}$/);
    const h = hashCode("+16075550123", "012345", SECRET);
    expect(h).toBe(hashCode("+16075550123", "012345", SECRET));
    expect(h).not.toBe(hashCode("+16075550124", "012345", SECRET));
    expect(h).not.toBe(hashCode("+16075550123", "012345", "x".repeat(32)));
  });
});

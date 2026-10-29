// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePerson: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(),
}));

import {
  dropUrl,
  isAllowlistedOrganizer,
  isValidSlug,
  localDateTimeToInstant,
  parseStartLocal,
  publicLoopUrl,
  randomToken,
} from "@/lib/organizer";
import { isPartifulUrl, parseHttpUrl } from "@/lib/organizer-shared";

const originalEnv = { ...process.env };
beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://loop.example/";
});
afterEach(() => {
  process.env = { ...originalEnv };
});

describe("isAllowlistedOrganizer", () => {
  it("matches case-insensitively and ignores whitespace around entries and the email", () => {
    process.env.ORGANIZER_EMAILS = " Dana@Cornell.edu , ra@cornell.edu,";
    expect(isAllowlistedOrganizer("dana@cornell.edu")).toBe(true);
    expect(isAllowlistedOrganizer("  DANA@cornell.EDU ")).toBe(true);
    expect(isAllowlistedOrganizer("ra@cornell.edu")).toBe(true);
    expect(isAllowlistedOrganizer("student@cornell.edu")).toBe(false);
  });

  it("allows nobody when the variable is empty, unset, or the email is blank", () => {
    process.env.ORGANIZER_EMAILS = "";
    expect(isAllowlistedOrganizer("dana@cornell.edu")).toBe(false);
    delete process.env.ORGANIZER_EMAILS;
    expect(isAllowlistedOrganizer("dana@cornell.edu")).toBe(false);
    process.env.ORGANIZER_EMAILS = " , ,";
    expect(isAllowlistedOrganizer("")).toBe(false);
    expect(isAllowlistedOrganizer(null)).toBe(false);
    expect(isAllowlistedOrganizer(undefined)).toBe(false);
  });
});

describe("isValidSlug", () => {
  it("accepts lower-case letters, digits, and single inner hyphens", () => {
    expect(isValidSlug("cs2110-thursdays")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
    expect(isValidSlug("donlon-2f-study")).toBe(true);
  });

  it("rejects upper case, spaces, leading/trailing/double hyphens, length, and reserved names", () => {
    expect(isValidSlug("CS2110")).toBe(false);
    expect(isValidSlug("cs 2110")).toBe(false);
    expect(isValidSlug("-cs2110")).toBe(false);
    expect(isValidSlug("cs2110-")).toBe(false);
    expect(isValidSlug("cs--2110")).toBe(false);
    expect(isValidSlug("cs_2110")).toBe(false);
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("a".repeat(49))).toBe(false);
    expect(isValidSlug("new")).toBe(false);
  });
});

describe("parseHttpUrl and isPartifulUrl", () => {
  it("accepts only http and https", () => {
    expect(parseHttpUrl(" https://lu.ma/abc ")).toBe("https://lu.ma/abc");
    expect(parseHttpUrl("http://example.com")).toBe("http://example.com/");
    expect(parseHttpUrl("javascript:alert(1)")).toBeNull();
    expect(parseHttpUrl("lu.ma/abc")).toBeNull();
    expect(parseHttpUrl("ftp://x")).toBeNull();
  });

  it("recognizes partiful.com and subdomains only", () => {
    expect(isPartifulUrl("https://partiful.com/e/abc")).toBe(true);
    expect(isPartifulUrl("https://www.partiful.com/e/abc")).toBe(true);
    expect(isPartifulUrl("https://lu.ma/abc")).toBe(false);
    expect(isPartifulUrl("https://notpartiful.com/x")).toBe(false);
    expect(isPartifulUrl(null)).toBe(false);
    expect(isPartifulUrl("nonsense")).toBe(false);
  });
});

describe("parseStartLocal", () => {
  it("normalises 'H:MM', 'HH:MM', and 'HH:MM:00' to 'HH:MM'", () => {
    expect(parseStartLocal("7:05")).toBe("07:05");
    expect(parseStartLocal("19:00")).toBe("19:00");
    expect(parseStartLocal(" 19:00:00 ")).toBe("19:00");
  });

  it("rejects non-zero seconds and out-of-range values", () => {
    expect(parseStartLocal("19:00:30")).toBeNull();
    expect(parseStartLocal("24:00")).toBeNull();
    expect(parseStartLocal("19:60")).toBeNull();
    expect(parseStartLocal("19")).toBeNull();
  });
});

describe("localDateTimeToInstant", () => {
  it("resolves a campus wall time on both sides of the Nov 1 2026 DST change", () => {
    expect(localDateTimeToInstant("2026-10-29T19:00", "America/New_York")?.toISOString()).toBe(
      "2026-10-29T23:00:00.000Z",
    );
    expect(localDateTimeToInstant("2026-11-05T19:00", "America/New_York")?.toISOString()).toBe(
      "2026-11-06T00:00:00.000Z",
    );
  });

  it("rolls a wall time in the spring gap forward an hour (Mar 8 2026, 02:30 → 03:30 EDT)", () => {
    expect(localDateTimeToInstant("2026-03-08T02:30", "America/New_York")?.toISOString()).toBe(
      "2026-03-08T07:30:00.000Z",
    );
  });

  it("returns null for malformed or impossible values", () => {
    expect(localDateTimeToInstant("2026-11-05", "America/New_York")).toBeNull();
    expect(localDateTimeToInstant("2026-13-05T19:00", "America/New_York")).toBeNull();
    expect(localDateTimeToInstant("2026-02-30T19:00", "America/New_York")).toBeNull();
    expect(localDateTimeToInstant("2026-11-05T25:00", "America/New_York")).toBeNull();
  });
});

describe("tokens and URLs", () => {
  it("makes URL-safe tokens of the requested entropy", () => {
    const token = randomToken(24);
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(randomToken(24)).not.toBe(token);
    expect(randomToken(32)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("builds public and drop URLs without a doubled slash", () => {
    expect(publicLoopUrl("cs2110")).toBe("https://loop.example/l/cs2110");
    expect(dropUrl("cs2110", "tok")).toBe("https://loop.example/l/cs2110?d=tok");
  });
});

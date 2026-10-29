// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const getClaims = vi.fn();
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const redirect = vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  });
  return { getClaims, maybeSingle, eq, select, from, redirect };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getClaims: mocks.getClaims },
    from: mocks.from,
  })),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { getPerson, getSession, requirePerson, safeNext } from "@/lib/auth";

const USER_ID = "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const claims = (overrides: Record<string, unknown> = {}) => ({
  data: { claims: { sub: USER_ID, email: "sarah@cornell.edu", ...overrides } },
  error: null,
});
const person = (first_name: string | null) => ({
  id: USER_ID,
  campus_id: "campus-1",
  email: "sarah@cornell.edu",
  first_name,
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("getSession", () => {
  it("returns the verified user id and email from the claims", async () => {
    mocks.getClaims.mockResolvedValueOnce(claims());
    expect(await getSession()).toEqual({ userId: USER_ID, email: "sarah@cornell.edu" });
  });

  it("returns null when there are no claims or verification fails", async () => {
    mocks.getClaims.mockResolvedValueOnce({ data: null, error: null });
    expect(await getSession()).toBeNull();
    mocks.getClaims.mockResolvedValueOnce({ data: null, error: new Error("bad jwt") });
    expect(await getSession()).toBeNull();
  });
});

describe("getPerson", () => {
  it("selects exactly the person columns for the session's own id", async () => {
    mocks.getClaims.mockResolvedValueOnce(claims());
    mocks.maybeSingle.mockResolvedValueOnce({ data: person(null), error: null });

    expect(await getPerson()).toEqual(person(null));
    expect(mocks.from).toHaveBeenCalledWith("person");
    expect(mocks.select).toHaveBeenCalledWith("id, campus_id, email, first_name");
    expect(mocks.eq).toHaveBeenCalledWith("id", USER_ID);
  });

  it("returns null when signed out without querying", async () => {
    mocks.getClaims.mockResolvedValueOnce({ data: null, error: null });
    expect(await getPerson()).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("throws when a session exists but the trigger-created row is missing", async () => {
    mocks.getClaims.mockResolvedValueOnce(claims());
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(getPerson()).rejects.toThrow(/No person row/);
  });
});

describe("requirePerson", () => {
  it("redirects to /signin with next when signed out", async () => {
    mocks.getClaims.mockResolvedValueOnce({ data: null, error: null });
    await expect(requirePerson("/l/x")).rejects.toThrow("REDIRECT:/signin?next=%2Fl%2Fx");
    expect(mocks.redirect).toHaveBeenCalledWith("/signin?next=%2Fl%2Fx");
  });

  it("redirects to /welcome with next while first_name is null", async () => {
    mocks.getClaims.mockResolvedValueOnce(claims());
    mocks.maybeSingle.mockResolvedValueOnce({ data: person(null), error: null });
    await expect(requirePerson("/l/x")).rejects.toThrow("REDIRECT:/welcome?next=%2Fl%2Fx");
  });

  it("returns the named person", async () => {
    mocks.getClaims.mockResolvedValueOnce(claims());
    mocks.maybeSingle.mockResolvedValueOnce({ data: person("Sarah"), error: null });
    expect(await requirePerson("/l/x")).toEqual(person("Sarah"));
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sanitizes next before putting it in the redirect", async () => {
    mocks.getClaims.mockResolvedValueOnce({ data: null, error: null });
    await expect(requirePerson("https://evil")).rejects.toThrow("REDIRECT:/signin?next=%2F");
  });
});

describe("safeNext", () => {
  it("accepts loop and organizer paths, keeping the query string", () => {
    expect(safeNext("/l/x?intent=watching&d=abc")).toBe("/l/x?intent=watching&d=abc");
    expect(safeNext("/org/new")).toBe("/org/new");
    expect(safeNext("/l/cs-2110-study/me")).toBe("/l/cs-2110-study/me");
  });

  it("rejects absolute URLs and protocol-relative hosts", () => {
    expect(safeNext("https://evil")).toBe("/");
    expect(safeNext("http://evil/l/x")).toBe("/");
    expect(safeNext("//evil")).toBe("/");
    expect(safeNext("//evil/l/x")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
  });

  it("rejects paths outside /l/ and /org/", () => {
    expect(safeNext("/evil")).toBe("/");
    expect(safeNext("/")).toBe("/");
    expect(safeNext("/login")).toBe("/");
    expect(safeNext("/lx/foo")).toBe("/");
    expect(safeNext("/organizer")).toBe("/");
    expect(safeNext("l/x")).toBe("/");
  });

  it("rejects dot segments, including encoded ones", () => {
    expect(safeNext("/l/../x")).toBe("/");
    expect(safeNext("/l/x/../../admin")).toBe("/");
    expect(safeNext("/l/%2e%2e/x")).toBe("/");
    expect(safeNext("/l/%2E%2E/x")).toBe("/");
  });

  it("normalizes a harmless single-dot segment that stays under /l/", () => {
    expect(safeNext("/l/./x")).toBe("/l/x");
  });

  it("rejects backslash variants", () => {
    expect(safeNext("/l/\\evil")).toBe("/");
    expect(safeNext("\\\\evil")).toBe("/");
    expect(safeNext("/\\evil")).toBe("/");
    expect(safeNext("/l/x\\@evil")).toBe("/");
    expect(safeNext("/l/%5Cevil")).toBe("/");
  });

  it("rejects whitespace, control characters, and non-strings", () => {
    expect(safeNext("/l/x\n")).toBe("/");
    expect(safeNext(" /l/x")).toBe("/");
    expect(safeNext("/l/x\u0000")).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext(["/l/x"])).toBe("/");
    expect(safeNext("")).toBe("/");
  });

  it("drops the fragment", () => {
    expect(safeNext("/l/x#frag")).toBe("/l/x");
  });

  describe("absolute URLs", () => {
    const original = process.env.NEXT_PUBLIC_APP_URL;
    beforeEach(() => {
      process.env.NEXT_PUBLIC_APP_URL = "https://loop.example";
    });
    afterEach(() => {
      process.env.NEXT_PUBLIC_APP_URL = original;
    });

    it("reduces a same-origin URL to its path and query", () => {
      expect(safeNext("https://loop.example/l/x?intent=watching&d=abc")).toBe(
        "/l/x?intent=watching&d=abc",
      );
      expect(safeNext("https://loop.example/org/new")).toBe("/org/new");
    });

    it("rejects other origins, lookalike hosts, and scheme or port mismatches", () => {
      expect(safeNext("https://evil/l/x")).toBe("/");
      expect(safeNext("https://loop.example.attacker.com/l/x")).toBe("/");
      expect(safeNext("http://loop.example/l/x")).toBe("/");
      expect(safeNext("https://loop.example:8443/l/x")).toBe("/");
      expect(safeNext("https://loop.example@evil/l/x")).toBe("/");
    });

    it("still applies the path rules to a same-origin URL", () => {
      expect(safeNext("https://loop.example/evil")).toBe("/");
      expect(safeNext("https://loop.example/")).toBe("/");
      expect(safeNext("https://loop.example/l/../x")).toBe("/");
      expect(safeNext("https://loop.example/l/x#frag")).toBe("/l/x");
    });

    it("rejects every absolute URL when NEXT_PUBLIC_APP_URL is unset", () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      expect(safeNext("https://loop.example/l/x")).toBe("/");
      expect(safeNext("/l/x")).toBe("/l/x");
    });
  });
});

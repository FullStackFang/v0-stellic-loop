// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOOP_ID,
  eqValue,
  fakeAdmin,
  seedResponder,
  type Call,
} from "@/app/l/[slug]/__tests__/fake-admin";

const PERSON_ID = "a0000000-0000-4000-8000-000000000002";
const OCC = "e0000000-0000-4000-8000-000000000001";

const state = vi.hoisted(() => ({ calls: [] as Call[] }));
const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
const rsvp = vi.hoisted(() => ({ setRsvp: vi.fn(), undoRsvp: vi.fn() }));

/** The session's own membership in the seed loop; any other person has none. */
const sessionMembership = {
  id: "m-session",
  loop_id: LOOP_ID,
  person_id: PERSON_ID,
  intent: "crew_conditional",
  tapped_in_at: "2030-10-01T00:00:00.000Z",
  crewed_at: "2030-10-10T00:00:00.000Z",
  crew_id: "crew-1",
  left_at: null,
  drop_id: null,
  rsvp_source: null,
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () =>
    fakeAdmin((call) => {
      state.calls.push(call);
      return seedResponder((c) => {
        if (c.table !== "membership" || c.op !== "select") return null;
        return eqValue(c, "person_id") === PERSON_ID && eqValue(c, "loop_id") === LOOP_ID
          ? sessionMembership
          : null;
      })(call);
    }).client,
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requirePerson: vi.fn(),
  getSession: auth.getSession,
  getPerson: vi.fn(),
  safeNext: (s: unknown) => s,
}));
vi.mock("@/lib/rsvp", () => ({ setRsvp: rsvp.setRsvp, undoRsvp: rsvp.undoRsvp }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { setRsvpForm, undoMarkedForm } from "@/app/l/[slug]/actions";

const NOW = new Date("2030-10-20T12:00:00.000Z");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  state.calls = [];
  auth.getSession.mockResolvedValue({ userId: PERSON_ID, email: "sarah@cornell.edu" });
  rsvp.setRsvp.mockResolvedValue({ ok: true });
  rsvp.undoRsvp.mockResolvedValue({ ok: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("setRsvpForm", () => {
  it("writes for the session's membership in the slug's loop and lands on the member page", async () => {
    await expect(
      setRsvpForm(form({ slug: "cs2110-thursdays", occurrence_id: OCC, status: "in" })),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me");
    expect(rsvp.setRsvp).toHaveBeenCalledTimes(1);
    expect(rsvp.setRsvp.mock.calls[0][1]).toEqual({
      membershipId: "m-session",
      occurrenceId: OCC,
      status: "in",
      now: NOW,
    });
    const read = state.calls.find((c) => c.table === "membership");
    expect(read && eqValue(read, "person_id")).toBe(PERSON_ID);
  });

  it("ignores a forged membership id in the form", async () => {
    await expect(
      setRsvpForm(
        form({
          slug: "cs2110-thursdays",
          occurrence_id: OCC,
          status: "out",
          membership_id: "m-forged",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me");
    expect(rsvp.setRsvp.mock.calls[0][1].membershipId).toBe("m-session");
    expect(state.calls.some((c) => eqValue(c, "id") === "m-forged")).toBe(false);
  });

  it("redirects a refusal to ?error=rsvp_refused", async () => {
    rsvp.setRsvp.mockResolvedValue({ ok: false, reason: "uncrewed" });
    await expect(
      setRsvpForm(form({ slug: "cs2110-thursdays", occurrence_id: OCC, status: "in" })),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me?error=rsvp_refused");
  });

  it("refuses without writing when the session has no membership in this loop", async () => {
    auth.getSession.mockResolvedValue({ userId: "someone-else", email: null });
    await expect(
      setRsvpForm(form({ slug: "cs2110-thursdays", occurrence_id: OCC, status: "in", membership_id: "m-session" })),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me?error=rsvp_refused");
    expect(rsvp.setRsvp).not.toHaveBeenCalled();
  });

  it("refuses a junk status without writing", async () => {
    await expect(
      setRsvpForm(form({ slug: "cs2110-thursdays", occurrence_id: OCC, status: "no_reply" })),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me?error=rsvp_refused");
    expect(rsvp.setRsvp).not.toHaveBeenCalled();
  });

  it.each(["o1", "", "not-a-uuid", `${OCC}x`, "'; drop table rsvp; --"])(
    "refuses a non-UUID occurrence_id %j with no database call",
    async (occ) => {
      await expect(
        setRsvpForm(form({ slug: "cs2110-thursdays", occurrence_id: occ, status: "in" })),
      ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me?error=rsvp_refused");
      expect(rsvp.setRsvp).not.toHaveBeenCalled();
      expect(state.calls).toHaveLength(0);
      expect(auth.getSession).not.toHaveBeenCalled();
    },
  );

  it("sends a signed-out caller to ?error=signed_out without writing", async () => {
    auth.getSession.mockResolvedValue(null);
    await expect(
      setRsvpForm(form({ slug: "cs2110-thursdays", occurrence_id: OCC, status: "in" })),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me?error=signed_out");
    expect(rsvp.setRsvp).not.toHaveBeenCalled();
  });

  it("maps a database failure to ?error=failed", async () => {
    rsvp.setRsvp.mockResolvedValue({ ok: false, reason: "error" });
    await expect(
      setRsvpForm(form({ slug: "cs2110-thursdays", occurrence_id: OCC, status: "in" })),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me?error=failed");
  });

  it("goes home for a junk slug", async () => {
    await expect(setRsvpForm(form({ slug: "../x", occurrence_id: OCC, status: "in" }))).rejects.toThrow(
      "NEXT_REDIRECT:/",
    );
    expect(rsvp.setRsvp).not.toHaveBeenCalled();
  });
});

describe("undoMarkedForm", () => {
  it("calls undoRsvp with the session membership and the marked status, then lands on /me", async () => {
    await expect(
      undoMarkedForm(
        form({ slug: "cs2110-thursdays", occurrence_id: OCC, marked: "in", membership_id: "m-forged" }),
      ),
    ).rejects.toThrow(/^NEXT_REDIRECT:\/l\/cs2110-thursdays\/me$/);
    expect(rsvp.undoRsvp).toHaveBeenCalledTimes(1);
    expect(rsvp.undoRsvp.mock.calls[0][1]).toEqual({
      membershipId: "m-session",
      occurrenceId: OCC,
      status: "in",
      now: NOW,
    });
    expect(rsvp.setRsvp).not.toHaveBeenCalled();
  });

  it("redirects a refused undo to ?error=rsvp_refused", async () => {
    rsvp.undoRsvp.mockResolvedValue({ ok: false, reason: "ended" });
    await expect(
      undoMarkedForm(form({ slug: "cs2110-thursdays", occurrence_id: OCC, marked: "out" })),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me?error=rsvp_refused");
  });
});

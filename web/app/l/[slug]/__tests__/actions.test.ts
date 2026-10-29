// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAMPUS_ID,
  DROP_ID,
  DROP_TOKEN,
  LOOP_ID,
  OTHER_CAMPUS_ID,
  OTHER_DROP_TOKEN,
  eqValue,
  fakeAdmin,
  pgError,
  seedResponder,
  type Call,
  type Responder,
} from "@/app/l/[slug]/__tests__/fake-admin";

const PERSON_ID = "a0000000-0000-4000-8000-000000000002";

const state = vi.hoisted(() => ({
  respond: (() => null) as Responder,
  calls: [] as Call[],
}));
const auth = vi.hoisted(() => ({
  requirePerson: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const fake = fakeAdmin((call) => state.respond(call));
    state.calls = fake.calls;
    return fake.client;
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requirePerson: auth.requirePerson,
  getSession: auth.getSession,
  getPerson: vi.fn(),
  safeNext: (s: unknown) => s,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import {
  leaveLoop,
  leaveLoopForm,
  rejoin,
  setIntent,
  setIntentForm,
  tapIn,
} from "@/app/l/[slug]/actions";

const NOW = new Date("2030-10-20T12:00:00.000Z");
const NOW_ISO = NOW.toISOString();

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

const activeMembership = {
  id: "m1",
  loop_id: LOOP_ID,
  person_id: PERSON_ID,
  intent: "watching",
  tapped_in_at: "2030-10-01T00:00:00.000Z",
  crewed_at: null,
  crew_id: null,
  left_at: null,
  drop_id: DROP_ID,
  rsvp_source: "luma",
};

const crewedMembership = {
  ...activeMembership,
  intent: "crew_conditional",
  crewed_at: "2030-10-10T00:00:00.000Z",
  crew_id: "crew-1",
};

const leftMembership = {
  ...crewedMembership,
  left_at: "2030-10-15T00:00:00.000Z",
};

/** Membership-side responder on top of the seed: `row` answers selects, inserts return `m-new`. */
function withMembership(row: unknown): Responder {
  return seedResponder((call) => {
    if (call.table === "membership" && call.op === "select") return row;
    if (call.table === "membership" && call.op === "insert") return { id: "m-new" };
    return null;
  });
}

const inserts = (table: string) => state.calls.filter((c) => c.table === table && c.op === "insert");
const updates = (table: string) => state.calls.filter((c) => c.table === table && c.op === "update");

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  state.calls = [];
  auth.requirePerson.mockResolvedValue({
    id: PERSON_ID,
    campus_id: CAMPUS_ID,
    email: "sarah@cornell.edu",
    first_name: "Sarah",
  });
  auth.getSession.mockResolvedValue({ userId: PERSON_ID, email: "sarah@cornell.edu" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("tapIn", () => {
  it("carries slug, intent, drop and RSVP source in next for the sign-in round trip", async () => {
    state.respond = withMembership(null);
    await expect(
      tapIn(form({ slug: "cs2110-thursdays", intent: "watching", d: DROP_TOKEN, rsvp_source: "luma" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(auth.requirePerson).toHaveBeenCalledWith(
      `/l/cs2110-thursdays?intent=watching&d=${DROP_TOKEN}&src=luma`,
    );
  });

  it("first tap-in inserts the membership once with the drop and RSVP source, and history with prev null", async () => {
    state.respond = withMembership(null);
    await expect(
      tapIn(form({ slug: "cs2110-thursdays", intent: "going_want_crew", d: DROP_TOKEN, rsvp_source: "partiful" })),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me");

    const [insert] = inserts("membership");
    expect(inserts("membership")).toHaveLength(1);
    expect(insert.payload).toEqual({
      loop_id: LOOP_ID,
      person_id: PERSON_ID,
      intent: "going_want_crew",
      tapped_in_at: NOW_ISO,
      drop_id: DROP_ID,
      rsvp_source: "partiful",
    });
    expect(updates("membership")).toHaveLength(0);

    const [history] = inserts("intent_history");
    expect(inserts("intent_history")).toHaveLength(1);
    expect(history.payload).toEqual({
      membership_id: "m-new",
      prev_intent: null,
      new_intent: "going_want_crew",
      occurrence_id: "o1",
      changed_at: NOW_ISO,
    });
  });

  it("re-tap with a different drop and intent updates intent only and records the previous value", async () => {
    state.respond = withMembership(activeMembership);
    await expect(
      tapIn(form({ slug: "cs2110-thursdays", intent: "crew_conditional", d: OTHER_DROP_TOKEN })),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me");

    expect(inserts("membership")).toHaveLength(0);
    const [update] = updates("membership");
    expect(updates("membership")).toHaveLength(1);
    expect(update.payload).toEqual({ intent: "crew_conditional" });
    expect(update.payload).not.toHaveProperty("tapped_in_at");
    expect(update.payload).not.toHaveProperty("drop_id");
    expect(update.payload).not.toHaveProperty("rsvp_source");
    expect(eqValue(update, "id")).toBe("m1");

    const [history] = inserts("intent_history");
    expect(history.payload).toMatchObject({
      membership_id: "m1",
      prev_intent: "watching",
      new_intent: "crew_conditional",
      occurrence_id: "o1",
    });
  });

  it("re-tap with an RSVP source answered updates rsvp_source alongside intent", async () => {
    state.respond = withMembership(activeMembership);
    await expect(
      tapIn(form({ slug: "cs2110-thursdays", intent: "going_want_crew", rsvp_source: "campusgroups" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(updates("membership")[0].payload).toEqual({
      intent: "going_want_crew",
      rsvp_source: "campusgroups",
    });
    expect(inserts("intent_history")).toHaveLength(1);
  });

  it("re-tap with the same intent stores an answered RSVP source but records no history", async () => {
    state.respond = withMembership(activeMembership);
    await expect(
      tapIn(form({ slug: "cs2110-thursdays", intent: "watching", rsvp_source: "campusgroups" })),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me");
    expect(updates("membership")).toHaveLength(1);
    expect(updates("membership")[0].payload).toEqual({ rsvp_source: "campusgroups" });
    expect(inserts("intent_history")).toHaveLength(0);
  });

  it("re-tap with the same intent and no RSVP answer writes nothing", async () => {
    state.respond = withMembership(activeMembership);
    await expect(tapIn(form({ slug: "cs2110-thursdays", intent: "watching" }))).rejects.toThrow(
      "NEXT_REDIRECT:/l/cs2110-thursdays/me",
    );
    expect(updates("membership")).toHaveLength(0);
    expect(inserts("intent_history")).toHaveLength(0);
  });

  it("a concurrent first tap-in (insert hits 23505) falls through to the change path", async () => {
    let membershipReads = 0;
    state.respond = seedResponder((call) => {
      if (call.table === "membership" && call.op === "select") {
        membershipReads += 1;
        // First read: no row yet. After the losing insert: the winner's row.
        return membershipReads === 1 ? null : activeMembership;
      }
      if (call.table === "membership" && call.op === "insert") return pgError("23505");
      return null;
    });
    await expect(
      tapIn(form({ slug: "cs2110-thursdays", intent: "crew_conditional", d: DROP_TOKEN })),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me");

    expect(membershipReads).toBe(2);
    expect(inserts("membership")).toHaveLength(1);
    expect(updates("membership")).toHaveLength(1);
    expect(updates("membership")[0].payload).toEqual({ intent: "crew_conditional" });
    expect(eqValue(updates("membership")[0], "id")).toBe("m1");
    const history = inserts("intent_history");
    expect(history).toHaveLength(1);
    expect(history[0].payload).toMatchObject({
      membership_id: "m1",
      prev_intent: "watching",
      new_intent: "crew_conditional",
    });
  });

  it("any other insert error still throws", async () => {
    state.respond = seedResponder((call) => {
      if (call.table === "membership" && call.op === "insert") return pgError("23503");
      return null;
    });
    await expect(tapIn(form({ slug: "cs2110-thursdays", intent: "watching" }))).rejects.toMatchObject({
      code: "23503",
    });
    expect(inserts("intent_history")).toHaveLength(0);
  });

  it("invalid drop token: no drop recorded and no error", async () => {
    state.respond = withMembership(null);
    await expect(
      tapIn(form({ slug: "cs2110-thursdays", intent: "crew_conditional", d: "not-a-real-token" })),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me");
    expect(inserts("membership")[0].payload).toMatchObject({ drop_id: null, rsvp_source: null });
  });

  it("rejects a person from another campus without writing", async () => {
    auth.requirePerson.mockResolvedValue({
      id: PERSON_ID,
      campus_id: OTHER_CAMPUS_ID,
      email: "x@other.edu",
      first_name: "Alex",
    });
    state.respond = withMembership(null);
    await expect(tapIn(form({ slug: "cs2110-thursdays", intent: "crew_conditional" }))).rejects.toThrow(
      "NEXT_REDIRECT:/l/cs2110-thursdays?error=other_campus",
    );
    expect(inserts("membership")).toHaveLength(0);
    expect(inserts("intent_history")).toHaveLength(0);
  });

  it("re-tap by a member who left reactivates with no crew and the original drop", async () => {
    state.respond = withMembership(leftMembership);
    await expect(
      tapIn(form({ slug: "cs2110-thursdays", intent: "going_want_crew", d: OTHER_DROP_TOKEN })),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me");
    expect(updates("membership")[0].payload).toEqual({
      intent: "going_want_crew",
      crew_id: null,
      crewed_at: null,
      left_at: null,
    });
    expect(inserts("intent_history")[0].payload).toMatchObject({
      prev_intent: "crew_conditional",
      new_intent: "going_want_crew",
    });
  });

  it("404s for an unknown or malformed slug", async () => {
    state.respond = withMembership(null);
    await expect(tapIn(form({ slug: "nope", intent: "watching" }))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(tapIn(form({ slug: "../x", intent: "watching" }))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("setIntent", () => {
  it("updates intent, appends history with the previous value, and never touches crew_id", async () => {
    state.respond = withMembership(crewedMembership);
    expect(await setIntent("m1", "watching")).toEqual({ ok: true, slug: "cs2110-thursdays" });

    const [update] = updates("membership");
    expect(update.payload).toEqual({ intent: "watching" });
    expect(update.payload).not.toHaveProperty("crew_id");
    expect(inserts("intent_history")[0].payload).toEqual({
      membership_id: "m1",
      prev_intent: "crew_conditional",
      new_intent: "watching",
      occurrence_id: "o1",
      changed_at: NOW_ISO,
    });
  });

  it("the same intent again writes nothing and records no history", async () => {
    state.respond = withMembership(crewedMembership);
    expect(await setIntent("m1", "crew_conditional")).toEqual({ ok: true, slug: "cs2110-thursdays" });
    expect(updates("membership")).toHaveLength(0);
    expect(inserts("intent_history")).toHaveLength(0);
  });

  it("checks that the membership belongs to the session's person", async () => {
    state.respond = withMembership(null);
    expect(await setIntent("m-someone-elses", "watching")).toMatchObject({ ok: false });
    const select = state.calls.find((c) => c.table === "membership" && c.op === "select");
    expect(eqValue(select!, "person_id")).toBe(PERSON_ID);
    expect(updates("membership")).toHaveLength(0);
    expect(inserts("intent_history")).toHaveLength(0);
  });

  it("refuses when signed out or for a bad intent", async () => {
    state.respond = withMembership(crewedMembership);
    auth.getSession.mockResolvedValue(null);
    expect(await setIntent("m1", "watching")).toMatchObject({ ok: false });
    auth.getSession.mockResolvedValue({ userId: PERSON_ID, email: null });
    expect(await setIntent("m1", "yes" as never)).toMatchObject({ ok: false });
    expect(updates("membership")).toHaveLength(0);
  });
});

describe("leaveLoop", () => {
  it("sets left_at, keeps crew_id, and appends no intent history", async () => {
    state.respond = withMembership(crewedMembership);
    expect(await leaveLoop("m1")).toEqual({ ok: true, slug: "cs2110-thursdays" });

    const [update] = updates("membership");
    expect(updates("membership")).toHaveLength(1);
    expect(update.payload).toEqual({ left_at: NOW_ISO });
    expect(update.payload).not.toHaveProperty("crew_id");
    expect(update.payload).not.toHaveProperty("crewed_at");
    expect(inserts("intent_history")).toHaveLength(0);
  });

  it("is a no-op for a membership that already left", async () => {
    state.respond = withMembership(leftMembership);
    expect(await leaveLoop("m1")).toEqual({ ok: true, slug: "cs2110-thursdays" });
    expect(updates("membership")).toHaveLength(0);
  });
});

describe("rejoin", () => {
  it("clears crew_id, crewed_at and left_at, sets intent, keeps drop_id, and appends history", async () => {
    state.respond = withMembership(leftMembership);
    expect(await rejoin("m1", "crew_conditional")).toEqual({ ok: true, slug: "cs2110-thursdays" });

    const [update] = updates("membership");
    expect(update.payload).toEqual({
      intent: "crew_conditional",
      crew_id: null,
      crewed_at: null,
      left_at: null,
    });
    expect(update.payload).not.toHaveProperty("drop_id");
    expect(inserts("intent_history")[0].payload).toEqual({
      membership_id: "m1",
      prev_intent: "crew_conditional",
      new_intent: "crew_conditional",
      occurrence_id: "o1",
      changed_at: NOW_ISO,
    });
  });

  it("refuses a membership that is not the caller's", async () => {
    state.respond = withMembership(null);
    expect(await rejoin("m1", "watching")).toMatchObject({ ok: false });
    expect(updates("membership")).toHaveLength(0);
  });
});

describe("member-page form adapters", () => {
  it("redirect with a short error code, never the message text", async () => {
    state.respond = withMembership(null);
    await expect(
      setIntentForm(form({ membership_id: "m-x", intent: "watching", slug: "cs2110-thursdays" })),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me?error=not_yours");

    await expect(
      setIntentForm(form({ membership_id: "m1", intent: "yes", slug: "cs2110-thursdays" })),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me?error=bad_intent");

    auth.getSession.mockResolvedValue(null);
    await expect(
      leaveLoopForm(form({ membership_id: "m1", slug: "cs2110-thursdays" })),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me?error=signed_out");
  });

  it("setIntentForm reports left for a membership that already left", async () => {
    state.respond = withMembership(leftMembership);
    await expect(
      setIntentForm(form({ membership_id: "m1", intent: "watching", slug: "cs2110-thursdays" })),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me?error=left");
  });

  it("a failed write becomes error=failed", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    state.respond = withMembership(crewedMembership);
    const respond = state.respond;
    state.respond = (call) =>
      call.table === "membership" && call.op === "update" ? pgError("57014") : respond(call);
    await expect(
      setIntentForm(form({ membership_id: "m1", intent: "watching", slug: "cs2110-thursdays" })),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me?error=failed");
    quiet.mockRestore();
  });
});

describe("integration against loop-test (task 4.2 verify; needs the hosted test project)", () => {
  it.todo("first tap-in via ?d=<token> creates one membership with that drop and one history row with prev null");
  it.todo("re-tap with a different drop token and intent records the previous intent and leaves tapped_in_at and drop_id unchanged");
  it.todo("an unknown drop token records no drop and the tap-in succeeds");
  it.todo("a person on another campus is rejected and no membership row exists");
  it.todo("signed-out round trip: ?intent=watching&d=<token> through /signin, /auth/confirm and /welcome ends on /l/<slug>/me with that intent and drop");
  it.todo("tapIn stores rsvp_source on insert and a re-tap without an answer leaves it unchanged");
});

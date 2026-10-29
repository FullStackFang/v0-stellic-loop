import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DROP_ID,
  LOOP_ID,
  PERSON_NAMES,
  SEED_LOOP,
  eqValue,
  fakeAdmin,
  pgError,
  seedResponder,
  type Call,
  type Responder,
} from "@/app/l/[slug]/__tests__/fake-admin";

type Person = { id: string; campus_id: string; email: string; first_name: string | null };

const SARAH: Person = {
  id: "a0000000-0000-4000-8000-000000000002",
  campus_id: SEED_LOOP.campus_id,
  email: "sarah@cornell.edu",
  first_name: "Sarah",
};

const state = vi.hoisted(() => ({
  respond: (() => null) as Responder,
  calls: [] as Call[],
  rlsCalls: [] as Call[],
  person: null as Person | null,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const fake = fakeAdmin((call) => state.respond(call));
    state.calls = fake.calls;
    return fake.client;
  },
}));
// The real requirePerson / safeNext run against this session client.
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getClaims: async () =>
        state.person
          ? { data: { claims: { sub: state.person.id, email: state.person.email } }, error: null }
          : { data: null, error: null },
    },
    // person reads (requirePerson) answer the session person; the own-membership
    // read goes through the same responder as the admin client, recorded apart.
    from: fakeAdmin((call) => {
      if (call.table === "person") return state.person;
      state.rlsCalls.push(call);
      return state.respond(call);
    }).client.from,
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { LeaveConfirm } from "@/app/l/[slug]/leave/leave-confirm";
import { confirmLeave } from "@/app/l/[slug]/leave/actions";

const SLUG = SEED_LOOP.slug;
const NOW = new Date("2030-10-20T12:00:00.000Z");

const membership = (left_at: string | null, crew_id: string | null = "crew-1") => ({
  id: "m-own",
  loop_id: LOOP_ID,
  person_id: SARAH.id,
  intent: "crew_conditional",
  tapped_in_at: "2030-10-01T00:00:00.000Z",
  crewed_at: crew_id === null ? null : "2030-10-02T00:00:00.000Z",
  crew_id,
  left_at,
  drop_id: DROP_ID,
  rsvp_source: null,
});

/** Seed loop plus the caller's own membership (only for an `eq("person_id", SARAH)` read). */
function withOwn(own: ReturnType<typeof membership> | null): Responder {
  return seedResponder((call) => {
    if (call.table === "membership" && call.op === "select") {
      return eqValue(call, "person_id") === SARAH.id && eqValue(call, "loop_id") === LOOP_ID
        ? own
        : null;
    }
    return null;
  });
}

const props = (slug: string, query: Record<string, string> = {}) => ({
  params: Promise.resolve({ slug }),
  searchParams: Promise.resolve(query),
});
const CREWED_COPY =
  "You'll leave your crew and stop getting email for this loop. If you tap back in later, you'll go back into the pool for a new crew.";
const UNCREWED_COPY =
  "You'll stop getting email for this loop and won't be placed in a crew. You can tap back in later.";
const writes = () => state.calls.filter((c) => c.op !== "select");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  state.respond = withOwn(membership(null));
  state.calls = [];
  state.rlsCalls = [];
  state.person = SARAH;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("/l/[slug]/leave confirm page", () => {
  it("sends a signed-out visitor to sign-in with next back to the leave page", async () => {
    state.person = null;
    await expect(LeaveConfirm(props(SLUG))).rejects.toThrow(
      `NEXT_REDIRECT:/signin?next=${encodeURIComponent(`/l/${SLUG}/leave`)}`,
    );
    expect(state.calls).toHaveLength(0);
  });

  it("404s for an unknown slug", async () => {
    await expect(LeaveConfirm(props("no-such-loop"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("sends a non-member to the tap-in page", async () => {
    state.respond = withOwn(null);
    await expect(LeaveConfirm(props(SLUG))).rejects.toThrow(`NEXT_REDIRECT:/l/${SLUG}`);
  });

  it("sends a member who already left to the tap-in page", async () => {
    state.respond = withOwn(membership("2030-10-10T00:00:00.000Z"));
    await expect(LeaveConfirm(props(SLUG))).rejects.toThrow(`NEXT_REDIRECT:/l/${SLUG}`);
  });

  it("shows an active member the confirm form, with no other member's name and no write", async () => {
    const { container } = render(await LeaveConfirm(props(SLUG)));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(SEED_LOOP.title);
    expect(container.textContent).toContain(`Leave ${SEED_LOOP.title}?`);
    expect(container.textContent).not.toMatch(/advis|counsel/i);

    const button = screen.getByRole("button", { name: "Leave loop" });
    const formEl = button.closest("form") as HTMLFormElement;
    expect(formEl).toBeTruthy();
    expect(formEl.querySelector('input[name="slug"]')?.getAttribute("value")).toBe(SLUG);
    expect(formEl.querySelector('input[name="membership_id"]')).toBeNull();
    expect(screen.getByRole("link", { name: "Stay" }).getAttribute("href")).toBe(`/l/${SLUG}/me`);

    const html = container.innerHTML;
    for (const name of PERSON_NAMES) expect(html).not.toContain(name);
    expect(writes()).toHaveLength(0);
  });

  it("reads only the loop's public columns, and the caller's own membership through RLS", async () => {
    render(await LeaveConfirm(props(SLUG)));
    for (const call of [...state.calls, ...state.rlsCalls]) {
      expect(call.op).toBe("select");
      expect(call.columns).not.toContain("*");
    }
    expect(state.calls.some((c) => c.table === "membership" || c.table === "person")).toBe(false);
    const own = state.rlsCalls.filter((c) => c.table === "membership");
    expect(own).toHaveLength(1);
    expect(eqValue(own[0], "person_id")).toBe(SARAH.id);
    expect(eqValue(own[0], "loop_id")).toBe(LOOP_ID);
  });

  it("tells a crewed member they leave their crew and rejoin through the pool", async () => {
    render(await LeaveConfirm(props(SLUG)));
    const text = screen.getByText(/stop getting email/).textContent?.replace(/\s+/g, " ").trim();
    expect(text).toBe(`Leave ${SEED_LOOP.title}? ${CREWED_COPY}`);
  });

  it("keeps the pool copy for an uncrewed member", async () => {
    state.respond = withOwn(membership(null, null));
    render(await LeaveConfirm(props(SLUG)));
    const text = screen.getByText(/stop getting email/).textContent?.replace(/\s+/g, " ").trim();
    expect(text).toBe(`Leave ${SEED_LOOP.title}? ${UNCREWED_COPY}`);
  });

  it("shows fixed copy for ?error=failed and nothing for any other error value", async () => {
    render(await LeaveConfirm(props(SLUG, { error: "failed" })));
    expect(screen.getByRole("alert").textContent).toBe("That didn't save. Try again.");
    cleanup();
    render(await LeaveConfirm(props(SLUG, { error: "<b>pwned</b>" })));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("confirmLeave", () => {
  it("sets left_at on the session's own membership, ignoring a membership id in the form", async () => {
    await expect(
      confirmLeave(form({ slug: SLUG, membership_id: "someone-elses-membership" })),
    ).rejects.toThrow(`NEXT_REDIRECT:/l/${SLUG}?left=1`);
    const updates = writes();
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe("membership");
    expect(updates[0].op).toBe("update");
    expect(updates[0].payload).toEqual({ left_at: NOW.toISOString() });
    expect(eqValue(updates[0], "id")).toBe("m-own");
    // only an active row, so a double submit cannot move left_at later
    expect(updates[0].filters).toContainEqual({ method: "is", args: ["left_at", null] });
  });

  it("logs a failed write and returns to the confirm page with ?error=failed", async () => {
    const own = withOwn(membership(null));
    state.respond = (call) => (call.op === "update" ? pgError("57014") : own(call));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(confirmLeave(form({ slug: SLUG }))).rejects.toThrow(
      `NEXT_REDIRECT:/l/${SLUG}/leave?error=failed`,
    );
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("redirects an already-left member to the tap-in page with no write", async () => {
    state.respond = withOwn(membership("2030-10-10T00:00:00.000Z"));
    await expect(confirmLeave(form({ slug: SLUG }))).rejects.toThrow(`NEXT_REDIRECT:/l/${SLUG}`);
    expect(writes()).toHaveLength(0);
  });

  it("redirects a non-member to the tap-in page with no write", async () => {
    state.respond = withOwn(null);
    await expect(confirmLeave(form({ slug: SLUG, membership_id: "m-own" }))).rejects.toThrow(
      `NEXT_REDIRECT:/l/${SLUG}`,
    );
    expect(writes()).toHaveLength(0);
  });

  it("sends a signed-out poster to sign-in with next back to the leave page", async () => {
    state.person = null;
    await expect(confirmLeave(form({ slug: SLUG }))).rejects.toThrow(
      `NEXT_REDIRECT:/signin?next=${encodeURIComponent(`/l/${SLUG}/leave`)}`,
    );
    expect(writes()).toHaveLength(0);
  });

  it("404s for a malformed slug", async () => {
    await expect(confirmLeave(form({ slug: "../x" }))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

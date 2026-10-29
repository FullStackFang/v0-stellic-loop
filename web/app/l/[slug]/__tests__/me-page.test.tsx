import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DROP_LABEL,
  DROP_TOKEN,
  ONE_OFF_LOOP,
  ONE_OFF_OCCURRENCES,
  PERSON_NAMES,
  SEED_LOOP,
  fakeAdmin,
  seedResponder,
  withLeakBait,
  type Responder,
} from "@/app/l/[slug]/__tests__/fake-admin";

type OwnMembership = { id: string; intent: string; crew_id: string | null; left_at: string | null };

const admin = vi.hoisted(() => ({ respond: (() => null) as Responder }));
const rls = vi.hoisted(() => ({ membership: null as OwnMembership | null }));
const auth = vi.hoisted(() => ({
  requirePerson: vi.fn(async () => ({
    id: "a0000000-0000-4000-8000-000000000002",
    campus_id: "c0000000-0000-4000-8000-000000000001",
    email: "sarah@cornell.edu",
    first_name: "Sarah",
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fakeAdmin((call) => admin.respond(call)).client,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => fakeAdmin(withLeakBait(() => rls.membership)).client,
}));
vi.mock("@/lib/auth", () => ({
  requirePerson: auth.requirePerson,
  getPerson: vi.fn(),
  getSession: vi.fn(),
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

import { Member } from "@/app/l/[slug]/me/member";

const NOW = new Date("2030-10-20T12:00:00.000Z");

function props(slug: string, query: Record<string, string> = {}) {
  return { params: Promise.resolve({ slug }), searchParams: Promise.resolve(query) };
}

const radio = (name: RegExp) => screen.getByRole("radio", { name }) as HTMLInputElement;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  admin.respond = seedResponder();
  rls.membership = { id: "m1", intent: "crew_conditional", crew_id: null, left_at: null };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("/l/[slug]/me waiting state", () => {
  it("requires sign-in with next back to the member page", async () => {
    await Member(props("cs2110-thursdays"));
    expect(auth.requirePerson).toHaveBeenCalledWith("/l/cs2110-thursdays/me");
  });

  it("renders the facts, the waiting line, the intent control and the leave control", async () => {
    const { container } = render(await Member(props("cs2110-thursdays")));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(SEED_LOOP.title);
    expect(container.textContent).toContain("Thu, Oct 24, 7:00 PM");
    expect(container.textContent).toContain(SEED_LOOP.place);
    expect(container.textContent).toContain(
      "You're in the pool. Crews are set by the organizer before each week.",
    );
    expect(radio(/In if there's a crew/).checked).toBe(true);
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Leave this loop" })).toBeTruthy();
    const membershipInput = container.querySelector('input[name="membership_id"]') as HTMLInputElement;
    expect(membershipInput.value).toBe("m1");
  });

  it("contains no first names, no counts, no RSVP controls, and nothing organizer-only", async () => {
    const { container } = render(await Member(props("cs2110-thursdays")));
    const html = container.innerHTML;
    for (const name of PERSON_NAMES) expect(html).not.toContain(name);
    expect(html).not.toMatch(/\d\s*(member|people|crew|in the pool)/i);
    expect(html).not.toContain("I'm in");
    expect(html).not.toContain("I&#x27;m in");
    expect(html).not.toContain("Can't this week");
    expect(html).not.toContain(DROP_LABEL);
    expect(html).not.toContain(DROP_TOKEN);
    expect(html).not.toContain("rsvp_source");
    expect(html).not.toContain("Already RSVPed somewhere");
  });

  it("focuses the intent control when opened with ?focus=intent", async () => {
    render(await Member(props("cs2110-thursdays", { focus: "intent" })));
    expect(document.activeElement).toBe(radio(/In if there's a crew/));
  });

  it("redirects a non-member to the tap-in page", async () => {
    rls.membership = null;
    await expect(Member(props("cs2110-thursdays"))).rejects.toThrow(
      "NEXT_REDIRECT:/l/cs2110-thursdays",
    );
  });

  it("redirects a member who left to the tap-in page", async () => {
    rls.membership = {
      id: "m1",
      intent: "watching",
      crew_id: null,
      left_at: "2030-10-19T00:00:00.000Z",
    };
    await expect(Member(props("cs2110-thursdays"))).rejects.toThrow(
      "NEXT_REDIRECT:/l/cs2110-thursdays",
    );
  });

  it("404s for an unknown loop", async () => {
    await expect(Member(props("nope"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("never renders raw ?error= text", async () => {
    // searchParams arrive decoded: ?error=Your%20session%20expired
    const { container } = render(
      await Member(props("cs2110-thursdays", { error: "Your session expired" })),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.textContent).not.toContain("Your session expired");
  });

  it("maps a known ?error= code to fixed copy", async () => {
    render(await Member(props("cs2110-thursdays", { error: "not_yours" })));
    expect(screen.getByRole("alert").textContent).toBe("That membership isn't yours.");
  });

  // The crewed state is covered in me-crewed.test.tsx.

  it("shows a cancelled one-off as cancelled, with only leave", async () => {
    admin.respond = seedResponder(() => null, {
      loop: ONE_OFF_LOOP,
      occurrences: [{ ...ONE_OFF_OCCURRENCES[0], cancelled: true }],
    });
    const { container } = render(await Member(props("halloween-skate")));
    expect(container.textContent).toContain("Cancelled · Thu, Oct 31, 7:30 PM");
    expect(container.textContent).not.toContain("You're in the pool");
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByRole("button", { name: "Leave this loop" })).toBeTruthy();
  });

  it("offers only leave once a one-off loop has ended", async () => {
    vi.setSystemTime(new Date("2030-11-05T12:00:00.000Z"));
    admin.respond = seedResponder(() => null, {
      loop: ONE_OFF_LOOP,
      occurrences: ONE_OFF_OCCURRENCES,
    });
    const { container } = render(await Member(props("halloween-skate")));
    expect(container.textContent).toContain("Thu, Oct 31, 7:30 PM");
    expect(container.textContent).not.toMatch(/Thursdays|Weekly/);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByRole("button", { name: "Leave this loop" })).toBeTruthy();
  });
});

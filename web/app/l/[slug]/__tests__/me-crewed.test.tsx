import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DROP_LABEL,
  DROP_TOKEN,
  SEED_OCCURRENCES,
  eqValue,
  fakeAdmin,
  seedResponder,
  withLeakBait,
  type Call,
  type Responder,
} from "@/app/l/[slug]/__tests__/fake-admin";
import { INTENTS, INTENT_LABELS } from "@/lib/loops";

type OwnMembership = { id: string; intent: string; crew_id: string | null; left_at: string | null };

const admin = vi.hoisted(() => ({ respond: (() => null) as Responder, calls: [] as Call[] }));
const rls = vi.hoisted(() => ({
  membership: null as OwnMembership | null,
  crew: [] as unknown[],
  calls: [] as Call[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  // Calls are recorded as they resolve, across every client the page creates.
  createAdminClient: () =>
    fakeAdmin((call) => {
      admin.calls.push(call);
      return admin.respond(call);
    }).client,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () =>
    fakeAdmin((call) => {
      rls.calls.push(call);
      return withLeakBait((c) => (c.table === "v_crew_members" ? rls.crew : rls.membership))(call);
    }).client,
}));
vi.mock("@/lib/auth", () => ({
  requirePerson: vi.fn(async () => ({
    id: "a0000000-0000-4000-8000-000000000002",
    campus_id: "c0000000-0000-4000-8000-000000000001",
    email: "sarah@cornell.edu",
    first_name: "Sarah",
  })),
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

/**
 * Crew rows as the view would return them, plus organizer-only and private
 * fields a sloppy render could leak (the view never returns these).
 */
const bait = {
  email: "leak@cornell.edu",
  intent: "going_want_crew",
  label: DROP_LABEL,
  token: DROP_TOKEN,
  rsvp_source: "luma",
};
const CREW = [
  { membership_id: "m2", first_name: "Josh", is_you: false, rsvp_status: "out", ...bait },
  { membership_id: "m1", first_name: "Sarah", is_you: true, rsvp_status: "no_reply", ...bait },
  { membership_id: "m3", first_name: "Maya", is_you: false, rsvp_status: "in", ...bait },
  { membership_id: "m4", first_name: "Lydia", is_you: false, rsvp_status: "no_reply", ...bait },
];

/** Last week's Thursday meeting, ended before NOW, ahead of the seed's o1 and o2. */
const ENDED_OCCURRENCE = {
  id: "o0",
  starts_at: "2030-10-17T23:00:00.000Z",
  linked_url: null,
  cancelled: false,
};

/** The viewer's own answer for the next occurrence, as `v_crew_members` reports it. */
function withMine(status: string) {
  rls.crew = CREW.map((m) => (m.is_you ? { ...m, rsvp_status: status } : m));
}

function props(query: Record<string, string> = {}) {
  return { params: Promise.resolve({ slug: "cs2110-thursdays" }), searchParams: Promise.resolve(query) };
}

const crewRegion = () => screen.getByRole("region", { name: "Your crew" });

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  admin.respond = seedResponder();
  admin.calls = [];
  rls.calls = [];
  rls.membership = { id: "m1", intent: "crew_conditional", crew_id: "crew-1", left_at: null };
  rls.crew = CREW;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("/l/[slug]/me crewed state", () => {
  it("reads crewmates only from v_crew_members with explicit columns, filtered to the viewer's crew", async () => {
    await Member(props());
    const reads = rls.calls.filter((c) => c.table === "v_crew_members");
    expect(reads).toHaveLength(1);
    expect(reads[0].columns).toBe("membership_id, first_name, is_you, rsvp_status");
    expect(eqValue(reads[0], "crew_id")).toBe("crew-1");
    expect(reads[0].filters.filter((f) => f.method === "order").map((f) => f.args[0])).toEqual([
      "first_name",
      "membership_id",
    ]);
    expect(admin.calls.some((c) => c.table === "v_crew_members" || c.table === "person")).toBe(false);
  });

  it("lists crewmates by first name, the viewer first with (you), and this week's answer", async () => {
    render(await Member(props()));
    const rows = within(crewRegion())
      .getAllByRole("listitem")
      .map((li) => Array.from(li.children).map((c) => c.textContent).join(" · "));
    expect(rows).toEqual(["Sarah (you) · No reply", "Josh · Out", "Maya · In", "Lydia · No reply"]);
    expect(screen.queryByText(/You're in the pool/)).toBeNull();
  });

  it("renders no email, no intent in the crew list, no drop, and no RSVP source", async () => {
    const { container } = render(await Member(props()));
    const html = container.innerHTML;
    expect(html).not.toContain("@cornell.edu");
    expect(html).not.toContain("Dana");
    expect(html).not.toContain(DROP_LABEL);
    expect(html).not.toContain(DROP_TOKEN);
    expect(html).not.toContain("rsvp_source");
    expect(html).not.toContain("luma");
    expect(html).not.toContain("crew-1");
    const region = crewRegion().innerHTML;
    for (const intent of INTENTS) {
      expect(region).not.toContain(intent);
      expect(region).not.toContain(INTENT_LABELS[intent]);
    }
  });

  it("offers I'm in and Can't this week for the next occurrence, with the current answer pressed", async () => {
    rls.crew = CREW.map((m) => (m.is_you ? { ...m, rsvp_status: "in" } : m));
    const { container } = render(await Member(props()));
    const inButton = screen.getByRole("button", { name: "I'm in" });
    const outButton = screen.getByRole("button", { name: "Can't this week" });
    expect(inButton.getAttribute("aria-pressed")).toBe("true");
    expect(outButton.getAttribute("aria-pressed")).toBe("false");
    const form = inButton.closest("form") as HTMLFormElement;
    expect((form.querySelector('input[name="occurrence_id"]') as HTMLInputElement).value).toBe("o1");
    expect((form.querySelector('input[name="status"]') as HTMLInputElement).value).toBe("in");
    expect((form.querySelector('input[name="slug"]') as HTMLInputElement).value).toBe("cs2110-thursdays");
    expect(form.querySelector('input[name="membership_id"]')).toBeNull();
    // Intent and leave controls stay.
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Leave this loop" })).toBeTruthy();
    expect(container.textContent).toContain("Thu, Oct 24, 7:00 PM");
  });

  it("maps ?error=rsvp_refused to fixed copy", async () => {
    render(await Member(props({ error: "rsvp_refused" })));
    expect(screen.getByRole("alert").textContent).toBe("You can't answer for this week.");
  });

  it("an uncrewed member gets the waiting state with no RSVP controls and no crew read", async () => {
    rls.membership = { id: "m1", intent: "crew_conditional", crew_id: null, left_at: null };
    withMine("in");
    const { container } = render(await Member(props({ marked: "in", occ: "o1" })));
    expect(container.textContent).toContain("You're in the pool.");
    expect(screen.queryByRole("button", { name: "I'm in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Can't this week" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Your crew" })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(rls.calls.some((c) => c.table === "v_crew_members")).toBe(false);
  });
});


describe("leave copy on the member page", () => {
  const CREWED_COPY =
    "You'll leave your crew and stop getting email for this loop. If you tap back in later, you'll go back into the pool for a new crew.";
  const UNCREWED_COPY =
    "You'll stop getting email for this loop and won't be placed in a crew. You can tap back in later.";

  it("a crewed member is told they leave their crew and rejoin through the pool", async () => {
    render(await Member(props()));
    fireEvent.click(screen.getByRole("button", { name: "Leave this loop" }));
    const copy = screen.getByText(/stop getting email/).textContent?.replace(/\s+/g, " ").trim();
    expect(copy).toBe(CREWED_COPY);
  });

  it("an uncrewed member keeps the waiting-state copy", async () => {
    rls.membership = { id: "m1", intent: "crew_conditional", crew_id: null, left_at: null };
    render(await Member(props()));
    fireEvent.click(screen.getByRole("button", { name: "Leave this loop" }));
    const copy = screen.getByText(/stop getting email/).textContent?.replace(/\s+/g, " ").trim();
    expect(copy).toBe(UNCREWED_COPY);
  });
});

describe("?marked= banner", () => {
  it("shows Marked you as In for Thursday for the next occurrence when the viewer's answer matches", async () => {
    withMine("in");
    render(await Member(props({ marked: "in", occ: "o1" })));
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("Marked you as In for Thursday");
    const form = within(banner).getByRole("button", { name: "Undo" }).closest("form") as HTMLFormElement;
    expect((form.querySelector('input[name="occurrence_id"]') as HTMLInputElement).value).toBe("o1");
    expect((form.querySelector('input[name="marked"]') as HTMLInputElement).value).toBe("in");
    expect(form.querySelector('input[name="membership_id"]')).toBeNull();
  });

  it("shows Out for an Out mark on the next occurrence", async () => {
    withMine("out");
    render(await Member(props({ marked: "out", occ: "o1" })));
    expect(screen.getByRole("status").textContent).toContain("Marked you as Out for Thursday");
  });

  it("reads the answer only from the v_crew_members row: no admin occurrence-by-id or rsvp read", async () => {
    withMine("in");
    render(await Member(props({ marked: "in", occ: "o1" })));
    expect(admin.calls.some((c) => c.table === "rsvp")).toBe(false);
    expect(admin.calls.some((c) => c.table === "occurrence" && c.single)).toBe(false);
  });

  it("shows nothing for a later week's occurrence, even when the stored answer matches", async () => {
    withMine("out");
    render(await Member(props({ marked: "out", occ: "o2" })));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows nothing for an ended occurrence, even when the answer matches", async () => {
    admin.respond = seedResponder(() => null, { occurrences: [ENDED_OCCURRENCE, ...SEED_OCCURRENCES] });
    withMine("in");
    render(await Member(props({ marked: "in", occ: "o0" })));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows nothing when the viewer's answer does not match the URL", async () => {
    withMine("out");
    render(await Member(props({ marked: "in", occ: "o1" })));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/Marked you as/)).toBeNull();
  });

  it("shows nothing when the viewer has not answered", async () => {
    render(await Member(props({ marked: "in", occ: "o1" })));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows nothing when occ belongs to another loop", async () => {
    withMine("in");
    render(await Member(props({ marked: "in", occ: "o-other" })));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows nothing for a junk marked value", async () => {
    withMine("in");
    render(await Member(props({ marked: "maybe", occ: "o1" })));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

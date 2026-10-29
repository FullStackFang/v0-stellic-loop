import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/app/org/__tests__/fake-supabase";

const requirePerson = vi.fn();
let server = fakeSupabase();
let admin = fakeSupabase();
const revalidatePath = vi.fn();

vi.mock("@/lib/auth", () => ({ requirePerson: (...args: unknown[]) => requirePerson(...args) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => server.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin.client }));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(),
}));

import { DashboardGate } from "@/app/org/[slug]/dashboard";
import { addDrop, removeMember, updateLoopSettings } from "@/app/org/[slug]/actions";
import type { Loop } from "@/lib/organizer";
import { PARTIFUL_NOTE } from "@/lib/organizer-shared";

const organizer = { id: "org-1", campus_id: "campus-1", email: "dana@cornell.edu", first_name: "Dana" };

const loop: Loop = {
  id: "loop-1",
  campus_id: "campus-1",
  organizer_id: "org-1",
  slug: "cs2110-thursdays",
  title: "CS 2110 Thursday problem sets",
  weekday: 4,
  start_local: "19:00:00",
  single_occurrence_at: null,
  duration_min: 90,
  place: "Olin Library",
  linked_url: null,
};

const drops = [{ id: "d1", loop_id: "loop-1", token: "tok_donlon", label: "Donlon 2F GroupMe", kind: "group_chat" }];

function member(
  n: number,
  intent: string,
  extra: Partial<{ drop_id: string | null; crew_id: string | null; rsvp_source: string | null; left_at: string | null }> = {},
) {
  return {
    id: `m${n}`,
    loop_id: "loop-1",
    person_id: `p${n}`,
    intent,
    tapped_in_at: "2026-10-16T23:02:00.000Z",
    crew_id: null,
    drop_id: null,
    left_at: null,
    rsvp_source: null,
    ...extra,
  };
}

// 5 via the GroupMe drop, 2 with no drop; 3 conditional, 2 going anyway, 2 watching;
// 3 answered Luma, 4 unanswered; one conditional member is already crewed.
const memberships = [
  member(1, "crew_conditional", { drop_id: "d1", rsvp_source: "luma" }),
  member(2, "crew_conditional", { drop_id: "d1", rsvp_source: "luma", crew_id: "11111111-2222-4333-8444-555555555555" }),
  member(3, "crew_conditional", { drop_id: "d1" }),
  member(4, "going_want_crew", { drop_id: "d1", rsvp_source: "luma" }),
  member(5, "going_want_crew", { drop_id: "d1" }),
  member(6, "watching"),
  member(7, "watching"),
];

const persons = memberships.map((m, i) => ({
  id: m.person_id,
  first_name: ["Sarah", "Josh", "Maya", "Priya", "Leo", "Ana", "Tom"][i],
  email: `${m.person_id}@cornell.edu`,
}));

function setClients(overrides: { loop?: Partial<Loop>; memberships?: unknown[] } = {}) {
  server = fakeSupabase({
    tables: {
      loop: [{ ...loop, ...overrides.loop }],
      membership: overrides.memberships ?? memberships,
      drop: drops,
    },
  });
  admin = fakeSupabase({
    tables: {
      person: persons,
      campus: [{ id: "campus-1", tz: "America/New_York" }],
      membership: overrides.memberships ?? memberships,
    },
  });
}

const params = Promise.resolve({ slug: "cs2110-thursdays" });
const noQuery = Promise.resolve({});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

const originalEnv = { ...process.env };
beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://loop.example";
  requirePerson.mockResolvedValue(organizer);
  setClients();
});
afterEach(() => {
  cleanup();
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

function sectionNamed(name: string | RegExp): HTMLElement {
  const heading = screen.getByRole("heading", { name });
  const section = heading.closest("section");
  if (!section) throw new Error(`no section for ${name}`);
  return section;
}

function countBeside(section: HTMLElement, label: string): string {
  const li = within(section).getByText(label).closest("li");
  if (!li) throw new Error(`no row for ${label}`);
  return li.querySelector(".pls-mono")?.textContent ?? "";
}

describe("/org/[slug] dashboard", () => {
  it("shows not found to a signed-in person who is not the organizer", async () => {
    requirePerson.mockResolvedValue({ ...organizer, id: "someone-else" });
    await expect(DashboardGate({ params, searchParams: noQuery })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(requirePerson).toHaveBeenCalledWith("/org/cs2110-thursdays");
    expect(admin.calls).toEqual([]);
  });

  it("shows not found when the loop is not visible to the caller", async () => {
    server = fakeSupabase({ tables: { loop: [] } });
    await expect(DashboardGate({ params, searchParams: noQuery })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(admin.calls).toEqual([]);
  });

  it("fails loudly instead of guessing a zone when the campus row is missing", async () => {
    admin = fakeSupabase({ tables: { person: persons, campus: [] } });
    await expect(DashboardGate({ params, searchParams: noQuery })).rejects.toThrow(
      "No campus row for campus-1",
    );
  });

  it("groups active members by intent with counts and a waiting-for-a-crew count", async () => {
    render(await DashboardGate({ params, searchParams: noQuery }));

    expect(screen.getByRole("heading", { name: /^In if there's a crew · 3$/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^Going anyway · 2$/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^Watching · 2$/ })).toBeTruthy();

    // 5 eligible (3 + 2) minus the one already crewed
    expect(screen.getByText("waiting for a crew").textContent).toBe("4 waiting for a crew");

    const members = sectionNamed(/^Members by intent/);
    expect(within(members).getByText("Sarah")).toBeTruthy();
    expect(within(members).getByText("p1@cornell.edu")).toBeTruthy();
    const josh = within(members).getByText("Josh").closest("li");
    expect(josh?.textContent).toContain("via Donlon 2F GroupMe");
    expect(josh?.textContent).toContain("crew 11111111");
    expect(josh?.textContent).toContain("RSVP source Luma");
    const ana = within(members).getByText("Ana").closest("li");
    expect(ana?.textContent).toContain("via no drop");
    expect(ana?.textContent).toContain("RSVP source Unanswered");
  });

  it("leaves out members who left, from the groups but not from the drop counts", async () => {
    setClients({
      memberships: [...memberships, member(8, "watching", { drop_id: "d1", left_at: "2026-10-17T00:00:00.000Z" })],
    });
    render(await DashboardGate({ params, searchParams: noQuery }));
    expect(screen.getByRole("heading", { name: /^Watching · 2$/ })).toBeTruthy();
    expect(countBeside(sectionNamed("Taps-in by drop"), "Donlon 2F GroupMe")).toBe("6");
  });

  it("counts taps-in by drop and by RSVP source", async () => {
    render(await DashboardGate({ params, searchParams: noQuery }));

    const byDrop = sectionNamed("Taps-in by drop");
    expect(countBeside(byDrop, "Donlon 2F GroupMe")).toBe("5");
    expect(countBeside(byDrop, "no drop")).toBe("2");

    const bySource = sectionNamed("Taps-in by RSVP source");
    expect(countBeside(bySource, "Luma")).toBe("3");
    expect(countBeside(bySource, "Unanswered")).toBe("4");
    expect(countBeside(bySource, "Partiful")).toBe("0");
  });

  it("shows the public URL, the read-only slot, each drop URL, and the occurrence, attendance, and crew sections", async () => {
    render(await DashboardGate({ params, searchParams: Promise.resolve({ created: "1" }) }));

    expect(screen.getByRole("link", { name: "https://loop.example/l/cs2110-thursdays" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/Your loop is live/);
    expect(screen.getByText("Thursdays · 7:00 PM · 90 min")).toBeTruthy();
    expect(screen.getByText("https://loop.example/l/cs2110-thursdays?d=tok_donlon")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Copy" }).length).toBeGreaterThanOrEqual(2);
    for (const title of [/^Occurrences/, /^Attendance/, /^Crews/]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeTruthy();
    }
  });

  it("shows the one-off date-time instead of a weekday for a single-occurrence loop", async () => {
    setClients({
      loop: { weekday: null, start_local: null, single_occurrence_at: "2026-11-06T00:00:00.000Z" },
    });
    render(await DashboardGate({ params, searchParams: noQuery }));
    expect(screen.getByText("Thu, Nov 5, 7:00 PM · 90 min")).toBeTruthy();
    expect(screen.queryByText(/Thursdays/)).toBeNull();
  });

  it("shows the Partiful note only for a partiful.com default URL", async () => {
    setClients({ loop: { linked_url: "https://partiful.com/e/abc" } });
    render(await DashboardGate({ params, searchParams: noQuery }));
    expect(screen.getByText(PARTIFUL_NOTE)).toBeTruthy();
    cleanup();

    setClients({ loop: { linked_url: "https://lu.ma/abc" } });
    render(await DashboardGate({ params, searchParams: noQuery }));
    expect(screen.queryByText(PARTIFUL_NOTE)).toBeNull();
  });
});

describe("dashboard actions", () => {
  it("addDrop inserts a random token for the verified loop and returns its URL", async () => {
    const state = await addDrop(
      { status: "idle" },
      form({ slug: "cs2110-thursdays", label: " Donlon 2F  GroupMe ", kind: "group_chat" }),
    );

    expect(state.status).toBe("added");
    const url = (state as { url: string }).url;
    expect(url).toMatch(/^https:\/\/loop\.example\/l\/cs2110-thursdays\?d=[A-Za-z0-9_-]{24,}$/);

    const insert = admin.calls.find((c) => c.table === "drop" && c.op === "insert");
    expect(insert?.payload).toMatchObject({ loop_id: "loop-1", label: "Donlon 2F GroupMe", kind: "group_chat" });
    expect((insert?.payload as { token: string }).token).toBe(url.split("?d=")[1]);
    expect(revalidatePath).toHaveBeenCalledWith("/org/cs2110-thursdays");
  });

  it("addDrop rejects an unknown kind and never writes", async () => {
    const state = await addDrop({ status: "idle" }, form({ slug: "cs2110-thursdays", label: "x", kind: "sms" }));
    expect(state.status).toBe("error");
    expect(admin.calls).toEqual([]);
  });

  it("updateLoopSettings writes only place and linked_url for the organizer's loop", async () => {
    const state = await updateLoopSettings(
      { status: "idle" },
      form({ slug: "cs2110-thursdays", place: " Olin 2nd floor ", linked_url: "https://partiful.com/e/x" }),
    );
    expect(state).toEqual({ status: "saved" });
    expect(admin.calls).toEqual([
      {
        table: "loop",
        op: "update",
        payload: { place: "Olin 2nd floor", linked_url: "https://partiful.com/e/x" },
        filters: [
          ["eq", "id", "loop-1"],
          ["eq", "organizer_id", "org-1"],
        ],
      },
    ]);
  });

  it("removeMember looks up the active membership of the verified loop, then sets left_at only", async () => {
    const state = await removeMember({ status: "idle" }, form({ slug: "cs2110-thursdays", membership_id: "m3" }));
    expect(state).toEqual({ status: "removed" });
    const [lookup, update, ...rest] = admin.calls;
    expect(lookup).toEqual({
      table: "membership",
      op: "select",
      filters: [
        ["eq", "id", "m3"],
        ["eq", "loop_id", "loop-1"],
        ["is", "left_at", null],
      ],
    });
    expect(update.table).toBe("membership");
    expect(update.op).toBe("update");
    expect(update.filters).toEqual([
      ["eq", "id", "m3"],
      ["is", "left_at", null],
    ]);
    expect(Object.keys(update.payload as object)).toEqual(["left_at"]);
    expect(rest.filter((c) => c.op !== "select")).toEqual([]);
    expect(revalidatePath).toHaveBeenCalledWith("/org/cs2110-thursdays");
  });

  it("removeMember reports not active and writes nothing when no active row of this loop matches", async () => {
    setClients({
      memberships: [
        ...memberships,
        member(8, "watching", { left_at: "2026-10-17T00:00:00.000Z" }),
        { ...member(9, "watching"), loop_id: "other-loop" },
      ],
    });
    for (const membershipId of ["m8", "m9", "nope"]) {
      const state = await removeMember(
        { status: "idle" },
        form({ slug: "cs2110-thursdays", membership_id: membershipId }),
      );
      expect(state).toEqual({ status: "error", message: "That member is not active in this loop." });
    }
    expect(admin.calls.map((c) => c.op)).toEqual(["select", "select", "select"]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("every action refuses a non-organizer before writing", async () => {
    requirePerson.mockResolvedValue({ ...organizer, id: "someone-else" });
    const f = form({ slug: "cs2110-thursdays", label: "x", kind: "pin", place: "x", membership_id: "m1" });
    await expect(addDrop({ status: "idle" }, f)).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(updateLoopSettings({ status: "idle" }, f)).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(removeMember({ status: "idle" }, f)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(admin.calls).toEqual([]);
  });
});

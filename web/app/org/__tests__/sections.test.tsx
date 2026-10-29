import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOptions } from "@/app/org/__tests__/fake-supabase";

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

import { AttendanceSection } from "@/app/org/[slug]/attendance-section";
import { CrewsSection } from "@/app/org/[slug]/crews-section";
import { OccurrencesSection } from "@/app/org/[slug]/occurrences-section";
import { cancelOccurrence, setAttendance, setOccurrenceUrl } from "@/app/org/[slug]/sections-actions";
import { pickNextOccurrence } from "@/lib/occurrences";
import type { Loop } from "@/lib/organizer";
import { PARTIFUL_NOTE } from "@/lib/organizer-shared";

const NOW = new Date("2026-10-17T16:00:00.000Z"); // Sat Oct 17, noon in Ithaca
const TZ = "America/New_York";
const SLUG = "cs2110-thursdays";

const organizer = { id: "org-1", campus_id: "campus-1", email: "dana@cornell.edu", first_name: "Dana" };

const loop: Loop = {
  id: "loop-1",
  campus_id: "campus-1",
  organizer_id: "org-1",
  slug: SLUG,
  title: "CS 2110 Thursday problem sets",
  weekday: 4,
  start_local: "19:00:00",
  single_occurrence_at: null,
  duration_min: 90,
  place: "Olin Library",
  linked_url: null,
};

type Occ = { id: string; loop_id: string; starts_at: string; linked_url: string | null; cancelled: boolean };
const occ = (id: string, startsAt: string, extra: Partial<Occ> = {}): Occ => ({
  id,
  loop_id: "loop-1",
  starts_at: startsAt,
  linked_url: null,
  cancelled: false,
  ...extra,
});

// Thursdays 7 PM EDT = 23:00Z. o1, o2 past; o3 past and cancelled; o4 is this week
// (Partiful override); o5 future; o6 future and cancelled.
const occurrences = [
  occ("o1", "2026-10-01T23:00:00.000Z"),
  occ("o2", "2026-10-08T23:00:00.000Z"),
  occ("o3", "2026-10-15T23:00:00.000Z", { cancelled: true }),
  occ("o4", "2026-10-22T23:00:00.000Z", { linked_url: "https://partiful.com/e/abc" }),
  occ("o5", "2026-10-29T23:00:00.000Z"),
  occ("o6", "2026-11-05T23:00:00.000Z", { cancelled: true }),
];

const CREW = "c1c1c1c1-2222-4333-8444-555555555555";
const CREWED = "2026-09-25T00:00:00.000Z";
const membership = (id: string, personId: string, extra: Record<string, unknown> = {}) => ({
  id,
  loop_id: "loop-1",
  person_id: personId,
  crew_id: null,
  crewed_at: null,
  left_at: null,
  tapped_in_at: "2026-09-20T12:00:00.000Z",
  ...extra,
});

const memberships = [
  membership("m1", "p1", { crew_id: CREW, crewed_at: CREWED }), // Sarah
  membership("m2", "p2", { crew_id: CREW, crewed_at: "2026-10-05T00:00:00.000Z" }), // Josh, crewed after Oct 1
  membership("m3", "p3"), // Maya, not crewed
  membership("m4", "p4", { crew_id: CREW, crewed_at: CREWED, left_at: "2026-10-05T00:00:00.000Z" }), // Leo left after Oct 1, has a mark
  membership("m5", "p5", { left_at: "2026-10-05T00:00:00.000Z" }), // Ana left, no marks
];

const persons = ["Sarah", "Josh", "Maya", "Leo", "Ana"].map((first_name, i) => ({
  id: `p${i + 1}`,
  first_name,
  email: `p${i + 1}@cornell.edu`,
}));

const rsvps = [
  { occurrence_id: "o4", membership_id: "m1", status: "in" },
  { occurrence_id: "o4", membership_id: "m2", status: "in" },
  { occurrence_id: "o4", membership_id: "m3", status: "out" },
  { occurrence_id: "o4", membership_id: "m4", status: "in" }, // left: not counted
  { occurrence_id: "o1", membership_id: "m1", status: "in" },
];

const attendance = [
  { id: "a1", occurrence_id: "o1", membership_id: "m1", status: "present" },
  { id: "a2", occurrence_id: "o1", membership_id: "m4", status: "absent" },
];

// v_crew_stats row matching crew C1 of supabase/tests/stats.test.sql.
const crewStats = [
  {
    crew_id: CREW,
    loop_id: "loop-1",
    formed_at: "2026-09-25T00:00:00.000Z",
    anchored: true,
    active_members: 4,
    single_drop: true,
    met_count: 2,
    reached_third: false,
    present: 7,
    denominator: 8,
    said_in: 2,
    said_in_and_came: 1,
  },
];

function setClients(
  overrides: { loop?: Partial<Loop>; occurrences?: Occ[]; attendance?: unknown[] } = {},
  adminOptions: Omit<FakeOptions, "tables"> = {},
) {
  const occs = overrides.occurrences ?? occurrences;
  const marks = overrides.attendance ?? attendance;
  server = fakeSupabase({
    tables: {
      loop: [{ ...loop, ...overrides.loop }],
      occurrence: occs,
      membership: memberships,
      rsvp: rsvps,
      attendance: marks,
      v_crew_stats: crewStats,
    },
  });
  admin = fakeSupabase({
    ...adminOptions,
    tables: { person: persons, occurrence: occs, membership: memberships, attendance: marks },
  });
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  requirePerson.mockResolvedValue(organizer);
  setClients();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const writes = () => admin.calls.filter((c) => c.op !== "select");

function occurrenceRow(id: string): HTMLElement {
  const li = document.querySelector<HTMLElement>(`[data-occurrence-id="${id}"]`);
  if (!li) throw new Error(`no row for ${id}`);
  return li;
}

describe("Occurrences section (6.3)", () => {
  it("lists recent and upcoming occurrences with this week's In count from active members", async () => {
    render(await OccurrencesSection({ loop, tz: TZ }));
    const ids = [...document.querySelectorAll("[data-occurrence-id]")].map((li) => li.getAttribute("data-occurrence-id"));
    expect(ids).toEqual(["o1", "o2", "o3", "o4", "o5", "o6"]);

    const thisWeek = occurrenceRow("o4");
    expect(thisWeek.textContent).toContain("Thu, Oct 22, 7:00 PM");
    expect(thisWeek.textContent).toContain("this week");
    // Sarah and Josh said In; Maya Out; Leo's In does not count (left)
    expect(thisWeek.textContent).toMatch(/2 In/);
    expect(occurrenceRow("o5").textContent).toMatch(/0 In/);
  });

  it("offers Cancel only for future, non-cancelled occurrences and shows cancelled rows as cancelled", async () => {
    render(await OccurrencesSection({ loop, tz: TZ }));
    for (const id of ["o4", "o5"]) {
      expect(within(occurrenceRow(id)).getByRole("button", { name: "Cancel" })).toBeTruthy();
    }
    for (const id of ["o1", "o2", "o3", "o6"]) {
      expect(within(occurrenceRow(id)).queryByRole("button", { name: "Cancel" })).toBeNull();
    }
    for (const id of ["o3", "o6"]) {
      expect(within(occurrenceRow(id)).getByText("Cancelled")).toBeTruthy();
      expect(within(occurrenceRow(id)).getByText(/Thu, /).className).toContain("line-through");
    }
  });

  it("shows the Partiful note only beside an occurrence whose effective link is on partiful.com", async () => {
    render(await OccurrencesSection({ loop, tz: TZ }));
    expect(within(occurrenceRow("o4")).getByText(PARTIFUL_NOTE)).toBeTruthy();
    expect(within(occurrenceRow("o5")).queryByText(PARTIFUL_NOTE)).toBeNull();
    expect(screen.getAllByText(PARTIFUL_NOTE)).toHaveLength(1);
    cleanup();

    // Default on Partiful, o4 overridden to Luma: the note moves to o5.
    setClients({
      loop: { linked_url: "https://partiful.com/e/default" },
      occurrences: occurrences.map((o) => (o.id === "o4" ? { ...o, linked_url: "https://lu.ma/x" } : o)),
    });
    render(await OccurrencesSection({ loop: { ...loop, linked_url: "https://partiful.com/e/default" }, tz: TZ }));
    expect(within(occurrenceRow("o4")).queryByText(PARTIFUL_NOTE)).toBeNull();
    expect(within(occurrenceRow("o5")).getByText(PARTIFUL_NOTE)).toBeTruthy();
  });

  it("marks a row cancelled once the occurrence is cancelled", async () => {
    setClients({ occurrences: occurrences.map((o) => (o.id === "o5" ? { ...o, cancelled: true } : o)) });
    render(await OccurrencesSection({ loop, tz: TZ }));
    const row = occurrenceRow("o5");
    expect(within(row).getByText("Cancelled")).toBeTruthy();
    expect(within(row).queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("skips a cancelled occurrence when picking the member page's next one", () => {
    const withO4Cancelled = occurrences.map((o) => ({
      ...o,
      cancelled: o.id === "o4" ? true : o.cancelled,
      startsAt: new Date(o.starts_at),
    }));
    expect(pickNextOccurrence(withO4Cancelled, loop.duration_min, NOW)?.id).toBe("o5");
  });
});

const NOW_ISO = NOW.toISOString();

describe("cancelOccurrence", () => {
  it("cancels a future occurrence, filtered by id, loop_id, and a future start", async () => {
    const state = await cancelOccurrence({ status: "idle" }, form({ slug: SLUG, occurrence_id: "o5" }));
    expect(state).toEqual({ status: "cancelled" });
    expect(admin.calls).toEqual([
      {
        table: "occurrence",
        op: "select",
        filters: [
          ["eq", "id", "o5"],
          ["eq", "loop_id", "loop-1"],
        ],
      },
      {
        table: "occurrence",
        op: "update",
        payload: { cancelled: true },
        filters: [
          ["eq", "id", "o5"],
          ["eq", "loop_id", "loop-1"],
          ["gt", "starts_at", NOW_ISO],
        ],
      },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith(`/org/${SLUG}`);
  });

  it("refuses a past or started occurrence and one of another loop, writing nothing", async () => {
    // o2 is past; a meeting in progress has started too
    setClients({
      occurrences: [...occurrences, occ("o7", "2026-10-17T15:30:00.000Z"), { ...occ("x1", "2026-12-01T00:00:00.000Z"), loop_id: "other" }],
    });
    for (const id of ["o2", "o7"]) {
      const state = await cancelOccurrence({ status: "idle" }, form({ slug: SLUG, occurrence_id: id }));
      expect(state.status).toBe("error");
      expect((state as { message: string }).message).toMatch(/already started/);
    }
    const other = await cancelOccurrence({ status: "idle" }, form({ slug: SLUG, occurrence_id: "x1" }));
    expect(other).toEqual({ status: "error", message: "That occurrence is not part of this loop." });
    expect(writes()).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("treats an update that matches no row (started meanwhile) as already started", async () => {
    setClients({}, { zeroRowUpdates: ["occurrence"] });
    const state = await cancelOccurrence({ status: "idle" }, form({ slug: SLUG, occurrence_id: "o5" }));
    expect(state.status).toBe("error");
    expect((state as { message: string }).message).toMatch(/already started/);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("setOccurrenceUrl", () => {
  it("rejects anything but http(s) without writing", async () => {
    for (const bad of ["javascript:alert(1)", "ftp://example.com/x", "not a url"]) {
      const state = await setOccurrenceUrl(
        { status: "idle" },
        form({ slug: SLUG, occurrence_id: "o5", linked_url: bad }),
      );
      expect(state.status).toBe("error");
    }
    expect(admin.calls).toEqual([]);
  });

  it("saves a normalized URL and clears the override when empty, only on an upcoming, non-cancelled row", async () => {
    await setOccurrenceUrl(
      { status: "idle" },
      form({ slug: SLUG, occurrence_id: "o5", linked_url: " https://partiful.com/e/new " }),
    );
    const cleared = await setOccurrenceUrl(
      { status: "idle" },
      form({ slug: SLUG, occurrence_id: "o4", linked_url: "  " }),
    );
    expect(cleared).toEqual({ status: "saved" });
    const lookup = (id: string) => ({
      table: "occurrence",
      op: "select",
      filters: [
        ["eq", "id", id],
        ["eq", "loop_id", "loop-1"],
      ],
    });
    const guard = (id: string) => [
      ["eq", "id", id],
      ["eq", "loop_id", "loop-1"],
      ["eq", "cancelled", false],
      ["gt", "starts_at", NOW_ISO],
    ];
    expect(admin.calls).toEqual([
      lookup("o5"),
      { table: "occurrence", op: "update", payload: { linked_url: "https://partiful.com/e/new" }, filters: guard("o5") },
      lookup("o4"),
      { table: "occurrence", op: "update", payload: { linked_url: null }, filters: guard("o4") },
    ]);
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });

  it("refuses an occurrence of another loop without writing", async () => {
    setClients({ occurrences: [...occurrences, { ...occ("x1", "2026-12-01T00:00:00.000Z"), loop_id: "other" }] });
    const state = await setOccurrenceUrl(
      { status: "idle" },
      form({ slug: SLUG, occurrence_id: "x1", linked_url: "https://lu.ma/x" }),
    );
    expect(state).toEqual({ status: "error", message: "That occurrence is not part of this loop." });
    expect(writes()).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports not editable when the update matches no row", async () => {
    setClients({}, { zeroRowUpdates: ["occurrence"] });
    const state = await setOccurrenceUrl(
      { status: "idle" },
      form({ slug: SLUG, occurrence_id: "o2", linked_url: "https://lu.ma/x" }),
    );
    expect(state.status).toBe("error");
    expect((state as { message: string }).message).toMatch(/can't be edited/);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

const joshOct8 = /^Josh, Oct 8: /;

describe("setAttendance", () => {
  it("two taps on an unmarked cell (client cycle) leave it absent; after reload a third clears it", async () => {
    setClients({ attendance: [] });
    render(await AttendanceSection({ loop, tz: TZ }));

    fireEvent.click(screen.getByRole("button", { name: joshOct8 }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Josh, Oct 8: Present/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: joshOct8 }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Josh, Oct 8: Absent/ })).toBeTruthy());

    const upserts = writes();
    expect(upserts.map((c) => [c.table, c.op, (c.payload as { status: string }).status, c.options])).toEqual([
      ["attendance", "upsert", "present", { onConflict: "occurrence_id,membership_id" }],
      ["attendance", "upsert", "absent", { onConflict: "occurrence_id,membership_id" }],
    ]);
    expect(upserts[1].payload).toEqual({
      occurrence_id: "o2",
      membership_id: "m2",
      status: "absent",
      marked_at: NOW_ISO,
    });
    cleanup();

    // reload: the grid reads the persisted absent mark, and the next tap clears it
    setClients({ attendance: [{ id: "a9", occurrence_id: "o2", membership_id: "m2", status: "absent" }] });
    render(await AttendanceSection({ loop, tz: TZ }));
    fireEvent.click(screen.getByRole("button", { name: /^Josh, Oct 8: Absent/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Josh, Oct 8: Unmarked/ })).toBeTruthy());
    expect(writes()).toEqual([
      {
        table: "attendance",
        op: "delete",
        filters: [
          ["eq", "occurrence_id", "o2"],
          ["eq", "membership_id", "m2"],
        ],
      },
    ]);
  });

  it("puts a failed save in the cell's accessible name", async () => {
    render(await AttendanceSection({ loop, tz: TZ }));
    admin = fakeSupabase({ tables: {} }); // the occurrence lookup now finds nothing
    fireEvent.click(screen.getByRole("button", { name: joshOct8 }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Josh, Oct 8: Unmarked, RSVP —. Couldn't save, tap to retry." }),
      ).toBeTruthy(),
    );
  });

  it("verifies the occurrence and membership belong to this loop", async () => {
    await setAttendance(SLUG, "o2", "m2", "present");
    const lookups = admin.calls.filter((c) => c.table !== "attendance");
    expect(lookups).toEqual([
      { table: "occurrence", op: "select", filters: [["eq", "id", "o2"], ["eq", "loop_id", "loop-1"]] },
      { table: "membership", op: "select", filters: [["eq", "id", "m2"], ["eq", "loop_id", "loop-1"]] },
    ]);
  });

  it("refuses uncrewed members, cells outside the crew window, and bad occurrences without writing", async () => {
    const cases: Array<[string, string, "present" | "absent" | null]> = [
      ["o2", "m3", "present"], // Maya was never crewed
      ["o2", "m4", "present"], // Leo left Oct 5; Oct 8 is after
      ["o1", "m2", "absent"], // Josh crewed Oct 5; Oct 1 is before
      ["o4", "m1", "present"], // future
      ["o3", "m1", "present"], // cancelled
      ["x1", "m1", "present"], // not this loop
      ["o2", "m-other", null], // not this loop's member
    ];
    for (const [occurrenceId, membershipId, mark] of cases) {
      const result = await setAttendance(SLUG, occurrenceId, membershipId, mark);
      expect(result.status).toBe("error");
    }
    const bogus = await setAttendance(SLUG, "o2", "m2", "maybe" as unknown as "present");
    expect(bogus.status).toBe("error");
    expect(writes()).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("every section action refuses a non-organizer", () => {
  it("throws not found with zero admin ops", async () => {
    requirePerson.mockResolvedValue({ ...organizer, id: "someone-else" });
    const f = form({ slug: SLUG, occurrence_id: "o5", linked_url: "https://lu.ma/x" });
    await expect(setOccurrenceUrl({ status: "idle" }, f)).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(cancelOccurrence({ status: "idle" }, f)).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(setAttendance(SLUG, "o2", "m2", "present")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(admin.calls).toEqual([]);
  });
});

describe("Attendance grid (6.4)", () => {
  it("rows are crew members (left ones only with marks), grouped by crew; columns are started, non-cancelled", async () => {
    render(await AttendanceSection({ loop, tz: TZ }));
    const table = screen.getByRole("table");
    const rowNames = within(table)
      .getAllByRole("rowheader")
      .map((th) => th.textContent);
    // Maya is not crewed; Ana left without marks
    expect(rowNames).toEqual(["Sarah", "Josh", "Leo (left)"]);
    expect(table.querySelector(`[data-crew-group="${CREW}"]`)?.textContent).toBe("crew c1c1c1c1");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headers).toEqual(["Member", "Oct 1", "Oct 8", "Oct 22 (not started)"]);

    // Sarah: Oct 1 + Oct 8; Josh: Oct 8 only (crewed Oct 5); Leo: Oct 1 only (left Oct 5)
    expect(within(table).getAllByRole("button")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Sarah, Oct 1: Present, RSVP In. Tap to change." })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Leo, Oct 1: Absent, RSVP —. Tap to change." })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Josh, Oct 8: Unmarked, RSVP —. Tap to change." })).toBeTruthy();
  });

  it("cells outside a member's crew window are not buttons", async () => {
    render(await AttendanceSection({ loop, tz: TZ }));
    const leo = document.querySelector<HTMLElement>('[data-membership-id="m4"]');
    const josh = document.querySelector<HTMLElement>('[data-membership-id="m2"]');
    if (!leo || !josh) throw new Error("rows missing");
    expect(within(leo).queryByRole("button", { name: /Oct 8/ })).toBeNull();
    expect(within(josh).queryByRole("button", { name: /Oct 1/ })).toBeNull();
    expect(leo.querySelectorAll("[data-outside-window]")).toHaveLength(1);
    expect(josh.querySelectorAll("[data-outside-window]")).toHaveLength(1);
  });

  it("future cells show the RSVP and have no button", async () => {
    render(await AttendanceSection({ loop, tz: TZ }));
    const cells = [...document.querySelectorAll<HTMLElement>("[data-upcoming-cell]")];
    expect(cells.map((c) => c.textContent)).toEqual(["In", "In", "In"]);
    for (const cell of cells) {
      expect(cell.closest("td")?.querySelector("button")).toBeNull();
    }
    expect(screen.queryByRole("button", { name: /Oct 22/ })).toBeNull();
  });
});

describe("Crews section (6.5)", () => {
  it("renders the stats.test.sql C1 row as 7 of 8 and 2 → 1, with flags and this week's RSVPs", async () => {
    render(await CrewsSection({ loop }));
    const crew = document.querySelector<HTMLElement>(`[data-crew-id="${CREW}"]`);
    if (!crew) throw new Error("no crew row");
    expect(within(crew).getByText("7 of 8")).toBeTruthy();
    expect(within(crew).getByText("2 → 1")).toBeTruthy();
    expect(within(crew).getByText("c1c1c1c1")).toBeTruthy();
    expect(within(crew).getByText("anchored")).toBeTruthy();
    expect(within(crew).getByText("single drop")).toBeTruthy();
    expect(within(crew).getByText("met 2×")).toBeTruthy();

    // active crew members only, each with this week's (o4) RSVP
    const members = within(crew)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(members).toEqual(["Sarah In", "Josh In"]);
    expect(crew.textContent).not.toContain("Leo");
    expect(crew.textContent).not.toContain("Maya");
  });

  it("reads v_crew_stats through the RLS client with the view's columns, scoped to the loop", async () => {
    render(await CrewsSection({ loop }));
    expect(server.calls.find((c) => c.table === "v_crew_stats")).toEqual({
      table: "v_crew_stats",
      op: "select",
      filters: [["eq", "loop_id", "loop-1"]],
    });
    expect(admin.calls.every((c) => c.table === "person")).toBe(true);
  });

  it("shows mixed and the third-meeting check from the view's flags", async () => {
    server = fakeSupabase({
      tables: {
        occurrence: occurrences,
        membership: memberships,
        rsvp: rsvps,
        attendance,
        v_crew_stats: [{ ...crewStats[0], single_drop: false, anchored: false, reached_third: true, met_count: 3 }],
      },
    });
    render(await CrewsSection({ loop }));
    expect(screen.getByText("mixed")).toBeTruthy();
    expect(screen.getByText("not anchored")).toBeTruthy();
    expect(screen.getByText("3rd meeting ✓")).toBeTruthy();
  });
});

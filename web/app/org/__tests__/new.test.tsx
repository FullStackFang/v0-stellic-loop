// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOptions } from "@/app/org/__tests__/fake-supabase";

const requirePerson = vi.fn();
let admin = fakeSupabase();

vi.mock("@/lib/auth", () => ({ requirePerson: (...args: unknown[]) => requirePerson(...args) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin.client }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

import { NewLoopGate } from "@/app/org/new/new-loop-gate";
import { createLoop } from "@/app/org/new/actions";

const organizer = {
  id: "org-1",
  campus_id: "campus-1",
  email: "dana@cornell.edu",
  first_name: "Dana",
};

const idle = { status: "idle" } as const;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

const weekly = {
  title: "CS 2110 Thursday problem sets",
  schedule: "weekly",
  weekday: "4",
  start_local: "19:00",
  duration_min: "90",
  place: "Olin Library",
  slug: "cs2110-thursdays",
  linked_url: "",
};

function setAdmin(options: FakeOptions) {
  admin = fakeSupabase({
    tables: { campus: [{ id: "campus-1", tz: "America/New_York" }], loop: [], ...options.tables },
    insertErrors: options.insertErrors,
    deleteErrors: options.deleteErrors,
  });
}

const originalEnv = { ...process.env };
beforeEach(() => {
  process.env.ORGANIZER_EMAILS = "dana@cornell.edu";
  process.env.NEXT_PUBLIC_APP_URL = "https://loop.example";
  requirePerson.mockResolvedValue(organizer);
  setAdmin({});
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe("/org/new gate", () => {
  it("shows not found to a signed-in person who is not on the allowlist", async () => {
    requirePerson.mockResolvedValue({ ...organizer, email: "student@cornell.edu" });
    await expect(NewLoopGate()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(requirePerson).toHaveBeenCalledWith("/org/new");
  });

  it("renders the form for an allowlisted organizer", async () => {
    await expect(NewLoopGate()).resolves.toBeTruthy();
  });
});

describe("createLoop", () => {
  it("refuses a non-allowlisted caller before touching the database", async () => {
    requirePerson.mockResolvedValue({ ...organizer, email: "student@cornell.edu" });
    await expect(createLoop(idle, form(weekly))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(admin.calls).toEqual([]);
  });

  it("creates a weekly loop with its secret and the next 4 occurrences, then redirects", async () => {
    await expect(createLoop(idle, form(weekly))).rejects.toThrow(
      "NEXT_REDIRECT:/org/cs2110-thursdays?created=1",
    );

    const inserts = admin.calls.filter((c) => c.op === "insert");
    expect(inserts.map((c) => c.table)).toEqual(["loop", "loop_secret", "occurrence"]);

    const loop = inserts[0].payload as Record<string, unknown>;
    expect(loop).toMatchObject({
      campus_id: "campus-1",
      organizer_id: "org-1",
      slug: "cs2110-thursdays",
      weekday: 4,
      start_local: "19:00",
      single_occurrence_at: null,
      duration_min: 90,
      linked_url: null,
    });

    const secret = inserts[1].payload as { loop_id: string; ics_token: string };
    expect(secret.loop_id).toBe("loop-new");
    expect(secret.ics_token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const occurrences = inserts[2].payload as Array<{ loop_id: string; starts_at: string }>;
    expect(occurrences).toHaveLength(4);
    for (const o of occurrences) {
      expect(o.loop_id).toBe("loop-new");
      expect(new Date(o.starts_at).getTime()).toBeGreaterThan(Date.now());
    }
    expect(admin.calls.some((c) => c.op === "delete")).toBe(false);
  });

  it("creates a one-off loop with a null slot and exactly one occurrence", async () => {
    await expect(
      createLoop(
        idle,
        form({ ...weekly, schedule: "once", starts_at: "2030-03-05T18:30", slug: "kickoff" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/org/kickoff?created=1");

    const inserts = admin.calls.filter((c) => c.op === "insert");
    const loop = inserts[0].payload as Record<string, unknown>;
    // 18:30 in New York on 2030-03-05 (EST, UTC-5)
    expect(loop).toMatchObject({
      weekday: null,
      start_local: null,
      single_occurrence_at: "2030-03-05T23:30:00.000Z",
    });
    const occurrences = inserts[2].payload as Array<{ starts_at: string }>;
    expect(occurrences).toEqual([{ loop_id: "loop-new", starts_at: "2030-03-05T23:30:00.000Z" }]);
  });

  it("rejects a one-off date-time in the past without creating anything", async () => {
    const state = await createLoop(
      idle,
      form({ ...weekly, schedule: "once", starts_at: "2020-01-01T10:00" }),
    );
    expect(state).toEqual({ status: "error", message: "Pick a date and time in the future." });
    expect(admin.calls.filter((c) => c.op === "insert")).toEqual([]);
  });

  it("reports a taken slug from the pre-check and inserts nothing", async () => {
    setAdmin({ tables: { loop: [{ id: "existing", slug: "cs2110-thursdays" }] } });
    const state = await createLoop(idle, form(weekly));
    expect(state).toEqual({ status: "error", message: "that link is taken" });
    expect(admin.calls.filter((c) => c.op !== "select")).toEqual([]);
    expect(admin.calls.at(-1)).toEqual({
      table: "loop",
      op: "select",
      filters: [["eq", "slug", "cs2110-thursdays"]],
    });
  });

  it("reports a taken slug when the insert loses the race on the unique index", async () => {
    setAdmin({
      insertErrors: { loop: { code: "23505", message: "duplicate key value violates unique constraint" } },
    });
    const state = await createLoop(idle, form(weekly));
    expect(state).toEqual({ status: "error", message: "that link is taken" });
    expect(admin.calls.filter((c) => c.op !== "select").map((c) => c.table)).toEqual(["loop"]);
  });

  for (const failing of ["loop_secret", "occurrence"]) {
    it(`undoes exactly the new loop when the ${failing} insert fails`, async () => {
      setAdmin({ insertErrors: { [failing]: { code: "XX000", message: "boom" } } });
      const state = await createLoop(idle, form(weekly));
      expect(state).toEqual({
        status: "error",
        message: "We couldn't create the loop just now. Try again.",
      });
      expect(admin.calls.filter((c) => c.op === "delete")).toEqual([
        { table: "loop", op: "delete", filters: [["eq", "id", "loop-new"]] },
      ]);
    });
  }

  it("logs a failed compensating delete with the loop id and still returns the generic error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    setAdmin({
      insertErrors: { occurrence: { code: "XX000", message: "boom" } },
      deleteErrors: { loop: { code: "XX000", message: "delete failed" } },
    });
    const state = await createLoop(idle, form(weekly));
    expect(state).toEqual({
      status: "error",
      message: "We couldn't create the loop just now. Try again.",
    });
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(String(consoleError.mock.calls[0][0])).toContain("loop-new");
    consoleError.mockRestore();
  });

  it("validates the slug, the link, and the time before any database call", async () => {
    expect(await createLoop(idle, form({ ...weekly, slug: "CS 2110" }))).toMatchObject({
      status: "error",
      message: expect.stringMatching(/lower-case letters/),
    });
    expect(await createLoop(idle, form({ ...weekly, slug: "new" }))).toMatchObject({
      status: "error",
    });
    expect(await createLoop(idle, form({ ...weekly, linked_url: "javascript:alert(1)" }))).toEqual({
      status: "error",
      message: "The event link must start with http:// or https://.",
    });
    expect(await createLoop(idle, form({ ...weekly, start_local: "25:00" }))).toEqual({
      status: "error",
      message: "Enter a start time.",
    });
    expect(await createLoop(idle, form({ ...weekly, weekday: "0" }))).toEqual({
      status: "error",
      message: "Pick a weekday.",
    });
    expect(admin.calls).toEqual([]);
  });
});

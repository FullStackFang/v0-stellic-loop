// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSentEmails, sentEmails } from "@/lib/email";
import { createFakeAdmin, type FakeTables } from "@/lib/__tests__/fakeAdmin";
import type { AdminClient } from "@/lib/loops";
import { sendPlacementEmails } from "@/lib/placementEmails";

const NOW = new Date("2026-10-20T12:00:00.000Z");

function m(id: string, person: string, crew: string | null, extra: Record<string, unknown> = {}) {
  return {
    id,
    loop_id: "loop-1",
    person_id: person,
    intent: "crew_conditional",
    tapped_in_at: `2026-10-16T23:0${id.slice(1)}:00+00:00`,
    crew_id: crew,
    left_at: null,
    ...extra,
  };
}

function seed(overrides: Partial<FakeTables> = {}): FakeTables {
  return {
    loop: [
      {
        id: "loop-1",
        slug: "cs2110",
        title: "CS 2110",
        organizer_id: "org",
        campus_id: "campus-1",
        weekday: 4,
        start_local: "19:00:00",
        single_occurrence_at: null,
        duration_min: 90,
        place: "Olin Library",
        linked_url: "https://lu.ma/default",
      },
    ],
    campus: [{ id: "campus-1", tz: "America/New_York" }],
    person: [
      { id: "org", first_name: "Dana", email: "dana@cornell.edu" },
      ...["Sarah", "Josh", "Maya", "Lydia", "Priya", "Leo", "Ana"].map((first_name, i) => ({
        id: `p${i + 1}`,
        first_name,
        email: `p${i + 1}@cornell.edu`,
      })),
    ],
    membership: [
      m("m1", "p1", "crew-a"),
      m("m2", "p2", "crew-a"),
      m("m3", "p3", "crew-a", { left_at: "2026-10-18T00:00:00+00:00" }),
      m("m4", "p4", "crew-b"),
      m("m5", "p5", "crew-b"),
      m("m6", "p6", "crew-b"),
      m("m7", "p7", null),
    ],
    occurrence: [
      { id: "o1", loop_id: "loop-1", starts_at: "2026-10-15T23:00:00+00:00", linked_url: null, cancelled: false },
      { id: "o2", loop_id: "loop-1", starts_at: "2026-10-22T23:00:00+00:00", linked_url: "https://lu.ma/week2", cancelled: false },
    ],
    ...overrides,
  };
}

const originalEnv = { ...process.env };
beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://loop.example";
  process.env.EMAIL_FROM = "Loop <loop@example.com>";
  resetSentEmails();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("sendPlacementEmails", () => {
  it("sends one email per placed member naming only that member's active crew", async () => {
    const { client } = createFakeAdmin(seed());
    const result = await sendPlacementEmails(client, "loop-1", ["m1", "m4"], NOW);
    expect(result).toEqual({ sent: 2, failed: 0, failedFirstNames: [] });
    expect(sentEmails.map((e) => e.to)).toEqual(["p1@cornell.edu", "p4@cornell.edu"]);

    const [toSarah, toLydia] = sentEmails;
    expect(toSarah.text).toContain("Your crew: Sarah (you) and Josh.");
    expect(toLydia.text).toContain("Your crew: Lydia (you), Priya and Leo.");
    for (const name of ["Maya", "Lydia", "Priya", "Leo", "Ana"]) expect(toSarah.html).not.toContain(name);
    for (const name of ["Sarah", "Josh", "Maya", "Ana"]) expect(toLydia.html).not.toContain(name);
  });

  it("uses the next occurrence in the campus zone, its link override, and the footer links", async () => {
    const { client } = createFakeAdmin(seed());
    await sendPlacementEmails(client, "loop-1", ["m1"], NOW);
    const { subject, text, html } = sentEmails[0];
    expect(subject).toBe("You're in a crew for CS 2110");
    expect(text).toContain("Next meeting: Thu, Oct 22, 7:00 PM");
    expect(text).toContain("Meets: Thursdays · 7:00 PM");
    expect(text).toContain("Event: https://lu.ma/week2");
    expect(text).not.toContain("lu.ma/default");
    expect(text).toContain("https://loop.example/l/cs2110/me");
    expect(text).toContain("organized by Dana");
    expect(text).toContain("Leave this loop: https://loop.example/l/cs2110/leave");
    for (const body of [text, html]) {
      expect(body).not.toContain("@cornell.edu");
      expect(body).not.toMatch(/crew_conditional|going_want_crew|watching/);
    }
  });

  it("counts a membership with no crew, or not in this loop, as failed", async () => {
    const { client } = createFakeAdmin(seed());
    const result = await sendPlacementEmails(client, "loop-1", ["m7", "nope", "m2"], NOW);
    // m7 has no crew yet, so it fails but its name is known; "nope" has none.
    expect(result).toEqual({ sent: 1, failed: 2, failedFirstNames: ["Ana"] });
    expect(sentEmails.map((e) => e.to)).toEqual(["p2@cornell.edu"]);
  });

  it("counts every member as failed when a read throws, without throwing", async () => {
    const fake = createFakeAdmin(seed());
    const client = {
      from: (table: string) => {
        if (table === "campus") throw new Error("down");
        return fake.client.from(table);
      },
    } as unknown as AdminClient;
    await expect(sendPlacementEmails(client, "loop-1", ["m1", "m4"], NOW)).resolves.toEqual({
      sent: 0,
      failed: 2,
      failedFirstNames: [],
    });
    expect(sentEmails).toEqual([]);
  });

  it("sends nothing for an empty list", async () => {
    const { client } = createFakeAdmin(seed());
    expect(await sendPlacementEmails(client, "loop-1", [], NOW)).toEqual({ sent: 0, failed: 0, failedFirstNames: [] });
  });

  it("batches the in-filters 100 ids at a time", async () => {
    const extra = Array.from({ length: 250 }, (_, i) => i + 10);
    const tables = seed();
    for (const n of extra) {
      tables.membership.push({ ...m(`m${n}`, `p${n}`, `crew-${Math.floor(n / 5)}`), tapped_in_at: "2026-10-16T23:00:00+00:00" });
      tables.person.push({ id: `p${n}`, first_name: `N${n}`, email: `p${n}@cornell.edu` });
    }
    const fake = createFakeAdmin(tables);
    const inSizes: number[] = [];
    const client = {
      from: (table: string) => {
        type InQuery = { in: (c: string, v: unknown[]) => unknown };
        const q = fake.client.from(table) as unknown as InQuery;
        const original = q.in.bind(q);
        q.in = (c: string, v: unknown[]) => {
          inSizes.push(v.length);
          return original(c, v);
        };
        return q;
      },
    } as unknown as AdminClient;
    const result = await sendPlacementEmails(client, "loop-1", extra.map((n) => `m${n}`), NOW);
    expect(result).toEqual({ sent: 250, failed: 0, failedFirstNames: [] });
    expect(Math.max(...inSizes)).toBeLessThanOrEqual(100);
    expect(sentEmails).toHaveLength(250);
  });
});

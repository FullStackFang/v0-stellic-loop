// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeAdmin, type FakeAdmin } from "@/lib/__tests__/fakeAdmin";
import { getRsvpStatus, setRsvp, undoRsvp } from "@/lib/rsvp";

const NOW = new Date("2026-10-21T23:00:00Z");
const HOUR = 60 * 60 * 1000;

const LOOP = "loop-a";
const OTHER_LOOP = "loop-b";
const CREW = "crew-1";
const CREWED = "m-crewed";
const UNCREWED = "m-uncrewed";
const LEFT = "m-left";
const OCC = "occ-next";
const OCC_CANCELLED = "occ-cancelled";
const OCC_ENDED = "occ-ended";
const OCC_OTHER = "occ-other-loop";

let fake: FakeAdmin;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  fake = createFakeAdmin({
    loop: [
      { id: LOOP, duration_min: 90, slug: "a" },
      { id: OTHER_LOOP, duration_min: 60, slug: "b" },
    ],
    membership: [
      { id: CREWED, loop_id: LOOP, crew_id: CREW, left_at: null },
      { id: UNCREWED, loop_id: LOOP, crew_id: null, left_at: null },
      { id: LEFT, loop_id: LOOP, crew_id: CREW, left_at: "2026-10-01T00:00:00Z" },
    ],
    occurrence: [
      { id: OCC, loop_id: LOOP, starts_at: new Date(NOW.getTime() + 24 * HOUR).toISOString(), cancelled: false },
      { id: OCC_CANCELLED, loop_id: LOOP, starts_at: new Date(NOW.getTime() + 24 * HOUR).toISOString(), cancelled: true },
      // Started 3 h ago with a 90 min duration: over.
      { id: OCC_ENDED, loop_id: LOOP, starts_at: new Date(NOW.getTime() - 3 * HOUR).toISOString(), cancelled: false },
      { id: OCC_OTHER, loop_id: OTHER_LOOP, starts_at: new Date(NOW.getTime() + 24 * HOUR).toISOString(), cancelled: false },
    ],
    rsvp: [],
  });
});

function attempt(membershipId: string, occurrenceId: string, status: "in" | "out" = "in") {
  return setRsvp(fake.client, { membershipId, occurrenceId, status, now: NOW });
}

describe("setRsvp refusals", () => {
  it.each([
    ["uncrewed member", UNCREWED, OCC, "uncrewed"],
    ["member who left", LEFT, OCC, "left"],
    ["cancelled occurrence", CREWED, OCC_CANCELLED, "cancelled"],
    ["ended occurrence", CREWED, OCC_ENDED, "ended"],
    ["occurrence of another loop", CREWED, OCC_OTHER, "wrong_loop"],
    ["unknown membership", "nope", OCC, "membership_not_found"],
    ["unknown occurrence", CREWED, "nope", "occurrence_not_found"],
  ])("refuses %s and stores nothing", async (_label, membershipId, occurrenceId, reason) => {
    expect(await attempt(membershipId, occurrenceId)).toEqual({ ok: false, reason });
    expect(fake.tables.rsvp).toEqual([]);
  });

  it("accepts an answer while the meeting is still running", async () => {
    fake.tables.occurrence.push({
      id: "occ-running",
      loop_id: LOOP,
      starts_at: new Date(NOW.getTime() - 30 * 60 * 1000).toISOString(),
      cancelled: false,
    });
    expect(await attempt(CREWED, "occ-running", "out")).toEqual({ ok: true });
  });
});

describe("setRsvp happy path", () => {
  it("upserts one row with the response time and overwrites on a second answer", async () => {
    expect(await attempt(CREWED, OCC, "in")).toEqual({ ok: true });
    expect(fake.tables.rsvp).toEqual([
      { occurrence_id: OCC, membership_id: CREWED, status: "in", responded_at: NOW.toISOString() },
    ]);

    const later = new Date(NOW.getTime() + HOUR);
    expect(
      await setRsvp(fake.client, { membershipId: CREWED, occurrenceId: OCC, status: "out", now: later }),
    ).toEqual({ ok: true });
    expect(fake.tables.rsvp).toEqual([
      { occurrence_id: OCC, membership_id: CREWED, status: "out", responded_at: later.toISOString() },
    ]);
  });

  it("reports no_reply until answered, then the stored status", async () => {
    expect(await getRsvpStatus(fake.client, CREWED, OCC)).toBe("no_reply");
    await attempt(CREWED, OCC, "in");
    expect(await getRsvpStatus(fake.client, CREWED, OCC)).toBe("in");
  });

  it("undoRsvp flips the marked status under the same checks", async () => {
    await attempt(CREWED, OCC, "in");
    expect(
      await undoRsvp(fake.client, { membershipId: CREWED, occurrenceId: OCC, status: "in", now: NOW }),
    ).toEqual({ ok: true });
    expect(await getRsvpStatus(fake.client, CREWED, OCC)).toBe("out");

    expect(
      await undoRsvp(fake.client, { membershipId: UNCREWED, occurrenceId: OCC, status: "in", now: NOW }),
    ).toEqual({ ok: false, reason: "uncrewed" });
  });

  it("turns a database failure into a refusal instead of throwing", async () => {
    const broken = {
      from() {
        throw new Error("connection refused");
      },
    } as unknown as typeof fake.client;
    expect(
      await setRsvp(broken, { membershipId: CREWED, occurrenceId: OCC, status: "in", now: NOW }),
    ).toEqual({ ok: false, reason: "error" });
  });
});

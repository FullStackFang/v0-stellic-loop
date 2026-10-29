// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeAdmin, type FakeAdmin, type FakeTables } from "@/lib/__tests__/fakeAdmin";
import { resetSentEmails, sentEmails, type EmailMessage } from "@/lib/email";
import { sendReminders } from "@/lib/reminders";
import { verifyRsvpLink } from "@/lib/signedLink";

// sendEmail delegates to the real in-memory stub unless a test makes it fail.
const emailControl = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...actual,
    sendEmail: async (message: EmailMessage) => {
      if (emailControl.fail) throw new Error("Resend: application_error: down");
      return actual.sendEmail(message);
    },
  };
});

const SECRET = "test-reminder-secret";
const APP = "https://loop.example";
const HOUR = 60 * 60 * 1000;

// The daily run: Wed Oct 21 2026 14:00 UTC (10:00 AM EDT). The base
// occurrence is Thu Oct 22 7:00 PM EDT (23:00 UTC), 33 h later.
const NOW = new Date("2026-10-21T14:00:00Z");
const OCC_STARTS_AT = "2026-10-22T23:00:00.000Z";
const OCC = "occ-thu";
const CREW = "crew-1";
const CREW_2 = "crew-2";

const SARAH = { membership: "m-sarah", person: "p-sarah", email: "sarah@cornell.edu" };
const JOSH = { membership: "m-josh", person: "p-josh", email: "josh@cornell.edu" };
const MAYA = { membership: "m-maya", person: "p-maya", email: "maya@cornell.edu" };
const ANA = { membership: "m-ana", person: "p-ana", email: "ana@cornell.edu" };
const BEN = { membership: "m-ben", person: "p-ben", email: "ben@cornell.edu" };
const WATCHER = { membership: "m-lee", person: "p-lee", email: "lee@cornell.edu" };

const CREW_1_NAMES = ["Sarah", "Josh", "Maya"];
const CREW_2_NAMES = ["Ana", "Ben"];

type Overrides = Partial<Record<string, unknown>>;

function fixture(occurrence: Overrides = {}, loop: Overrides = {}): FakeTables {
  return {
    campus: [{ id: "campus-1", tz: "America/New_York" }],
    person: [
      { id: "p-dana", first_name: "Dana", email: "dana@cornell.edu" },
      { id: SARAH.person, first_name: "Sarah", email: SARAH.email },
      { id: JOSH.person, first_name: "Josh", email: JOSH.email },
      { id: MAYA.person, first_name: "Maya", email: MAYA.email },
      { id: ANA.person, first_name: "Ana", email: ANA.email },
      { id: BEN.person, first_name: "Ben", email: BEN.email },
      { id: WATCHER.person, first_name: "Lee", email: WATCHER.email },
    ],
    loop: [
      {
        id: "loop-1",
        slug: "cs-2110",
        title: "CS 2110 study",
        organizer_id: "p-dana",
        campus_id: "campus-1",
        weekday: 4,
        start_local: "19:00:00",
        single_occurrence_at: null,
        duration_min: 90,
        place: "Olin 245",
        linked_url: "https://lu.ma/cs2110",
        ...loop,
      },
    ],
    occurrence: [
      {
        id: OCC,
        loop_id: "loop-1",
        starts_at: OCC_STARTS_AT,
        linked_url: null,
        cancelled: false,
        ...occurrence,
      },
    ],
    membership: [
      { id: SARAH.membership, loop_id: "loop-1", person_id: SARAH.person, crew_id: CREW, left_at: null, intent: "crew_conditional" },
      { id: JOSH.membership, loop_id: "loop-1", person_id: JOSH.person, crew_id: CREW, left_at: null, intent: "going_want_crew" },
      { id: MAYA.membership, loop_id: "loop-1", person_id: MAYA.person, crew_id: CREW, left_at: null, intent: "crew_conditional" },
      { id: ANA.membership, loop_id: "loop-1", person_id: ANA.person, crew_id: CREW_2, left_at: null, intent: "crew_conditional" },
      { id: BEN.membership, loop_id: "loop-1", person_id: BEN.person, crew_id: CREW_2, left_at: null, intent: "going_want_crew" },
      { id: WATCHER.membership, loop_id: "loop-1", person_id: WATCHER.person, crew_id: null, left_at: null, intent: "watching" },
    ],
    rsvp: [
      { occurrence_id: OCC, membership_id: SARAH.membership, status: "in", responded_at: NOW.toISOString() },
      { occurrence_id: OCC, membership_id: ANA.membership, status: "in", responded_at: NOW.toISOString() },
    ],
    reminder_send: [{ membership_id: JOSH.membership, occurrence_id: OCC, sent_at: NOW.toISOString() }],
  };
}

/** Whole-word match, so "Ana" does not match inside "Dana". */
function hasName(body: string, name: string): boolean {
  return new RegExp(`\\b${name}\\b`).test(body);
}

const env = { ...process.env };
let fake: FakeAdmin;

beforeEach(() => {
  process.env.REMINDER_LINK_SECRET = SECRET;
  process.env.NEXT_PUBLIC_APP_URL = APP;
  process.env.EMAIL_FROM = "Loop <loop@example.edu>";
  emailControl.fail = false;
  resetSentEmails();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...env };
  vi.restoreAllMocks();
});

describe("sendReminders", () => {
  it("sends one reminder per crewed member not yet reminded, with every required fact (Wed 14:00 UTC run, Thu 7 PM ET meeting 33 h out)", async () => {
    fake = createFakeAdmin(fixture());

    const result = await sendReminders(fake.client, NOW);

    expect(result).toEqual({ sent: 4, skipped: 1, failed: 0, failedOccurrences: 0 });
    expect(sentEmails.map((e) => e.to).sort()).toEqual(
      [ANA.email, BEN.email, MAYA.email, SARAH.email].sort(),
    );
    expect(fake.tables.reminder_send.map((r) => r.membership_id).sort()).toEqual(
      [ANA.membership, BEN.membership, JOSH.membership, MAYA.membership, SARAH.membership].sort(),
    );

    for (const email of sentEmails) {
      expect(email.subject).toBe("Tomorrow: CS 2110 study at 7:00 PM");
      for (const body of [email.html, email.text]) {
        expect(body).toContain("CS 2110 study is tomorrow");
        expect(hasName(body, "Lee")).toBe(false);
        expect(body).toContain("Thu, Oct 22, 7:00 PM");
        expect(body).toContain("Meets:");
        expect(body).toContain("Olin 245");
        expect(body).toContain("https://lu.ma/cs2110");
        expect(body).toContain("CS 2110 study");
        expect(body).toContain("Dana");
        expect(body).toContain(`${APP}/l/cs-2110`);
        expect(body).toContain(`${APP}/l/cs-2110/leave`);
        expect(body.match(new RegExp(`${APP}/r/`, "g"))).toHaveLength(2);
      }
    }

    // The links are real tokens bound to the recipient, the occurrence, and one status each.
    const sarah = sentEmails.find((e) => e.to === SARAH.email)!;
    const tokens = [...sarah.text.matchAll(/https:\/\/loop\.example\/r\/(\S+)/g)].map((m) => m[1]);
    expect(tokens.map((t) => verifyRsvpLink(t, SECRET, NOW))).toEqual([
      expect.objectContaining({ membershipId: SARAH.membership, occurrenceId: OCC, status: "in" }),
      expect.objectContaining({ membershipId: SARAH.membership, occurrenceId: OCC, status: "out" }),
    ]);
  });

  it("names only the recipient's own crew and counts In per crew", async () => {
    fake = createFakeAdmin(fixture());
    await sendReminders(fake.client, NOW);

    const byCrew = [
      { recipients: [SARAH.email, MAYA.email], own: CREW_1_NAMES, other: CREW_2_NAMES },
      { recipients: [ANA.email, BEN.email], own: CREW_2_NAMES, other: CREW_1_NAMES },
    ];
    for (const { recipients, own, other } of byCrew) {
      for (const to of recipients) {
        const email = sentEmails.find((e) => e.to === to)!;
        for (const body of [email.html, email.text]) {
          for (const name of own) expect(hasName(body, name), `${to} names ${name}`).toBe(true);
          for (const name of other) expect(hasName(body, name), `${to} omits ${name}`).toBe(false);
          // One In per crew (Sarah, Ana); a loop-wide count would say 2.
          expect(body).toContain("1 person is in so far");
          expect(body).not.toContain("2 people are in so far");
        }
      }
    }
  });

  it("says Tonight for a meeting later the same campus day (12 h out: Wed 10 PM ET)", async () => {
    fake = createFakeAdmin(
      fixture({ starts_at: new Date(NOW.getTime() + 12 * HOUR).toISOString() }),
    );
    expect((await sendReminders(fake.client, NOW)).sent).toBe(4);
    for (const email of sentEmails) {
      expect(email.subject).toBe("Tonight: CS 2110 study at 10:00 PM");
      expect(email.text).toContain("CS 2110 study is tonight.");
    }
  });

  it("prefers the occurrence's linked URL over the loop default", async () => {
    fake = createFakeAdmin(fixture({ linked_url: "https://partiful.com/e/override" }));
    await sendReminders(fake.client, NOW);
    expect(sentEmails[0].text).toContain("https://partiful.com/e/override");
    expect(sentEmails[0].text).not.toContain("https://lu.ma/cs2110");
  });

  it("gives a one-off loop (no weekday, no start time) no Meets line", async () => {
    fake = createFakeAdmin(
      fixture({}, { weekday: null, start_local: null, single_occurrence_at: OCC_STARTS_AT }),
    );
    expect((await sendReminders(fake.client, NOW)).sent).toBe(4);
    for (const email of sentEmails) {
      expect(email.html).not.toContain("Meets:");
      expect(email.text).not.toContain("Meets:");
      expect(email.text).toContain("When: Thu, Oct 22, 7:00 PM");
    }
  });

  it("sends nothing for an occurrence 36 h out (next day's run takes it)", async () => {
    fake = createFakeAdmin(
      fixture({ starts_at: new Date(NOW.getTime() + 36 * HOUR).toISOString() }),
    );
    expect(await sendReminders(fake.client, NOW)).toEqual({
      sent: 0,
      skipped: 0,
      failed: 0,
      failedOccurrences: 0,
    });
    expect(sentEmails).toEqual([]);
    expect(fake.tables.reminder_send).toHaveLength(1);
  });

  it("sends nothing for an occurrence 10 h out (yesterday's run took it)", async () => {
    fake = createFakeAdmin(
      fixture({ starts_at: new Date(NOW.getTime() + 10 * HOUR).toISOString() }),
    );
    expect(await sendReminders(fake.client, NOW)).toEqual({
      sent: 0,
      skipped: 0,
      failed: 0,
      failedOccurrences: 0,
    });
    expect(sentEmails).toEqual([]);
  });

  it("sends nothing for a cancelled occurrence", async () => {
    fake = createFakeAdmin(fixture({ cancelled: true }));
    expect(await sendReminders(fake.client, NOW)).toEqual({
      sent: 0,
      skipped: 0,
      failed: 0,
      failedOccurrences: 0,
    });
    expect(sentEmails).toEqual([]);
  });

  it("sends nothing on a second run", async () => {
    fake = createFakeAdmin(fixture());
    await sendReminders(fake.client, NOW);
    resetSentEmails();

    expect(await sendReminders(fake.client, new Date(NOW.getTime() + HOUR))).toEqual({
      sent: 0,
      skipped: 5,
      failed: 0,
      failedOccurrences: 0,
    });
    expect(sentEmails).toEqual([]);
    expect(fake.tables.reminder_send).toHaveLength(5);
  });

  it("releases every claim when sending fails, so the next run sends them", async () => {
    fake = createFakeAdmin(fixture());
    emailControl.fail = true;

    expect(await sendReminders(fake.client, NOW)).toEqual({
      sent: 0,
      skipped: 1,
      failed: 4,
      failedOccurrences: 0,
    });
    expect(sentEmails).toEqual([]);
    expect(fake.tables.reminder_send.map((r) => r.membership_id)).toEqual([JOSH.membership]);

    emailControl.fail = false;
    expect(await sendReminders(fake.client, NOW)).toEqual({
      sent: 4,
      skipped: 1,
      failed: 0,
      failedOccurrences: 0,
    });
    expect(sentEmails.map((e) => e.to).sort()).toEqual(
      [ANA.email, BEN.email, MAYA.email, SARAH.email].sort(),
    );
    expect(fake.tables.reminder_send).toHaveLength(5);
  });

  it("skips a member whose row appears between the pre-read and the claim", async () => {
    fake = createFakeAdmin(fixture());
    const realFrom = fake.client.from.bind(fake.client);
    let preRead = true;
    (fake.client as unknown as { from: (table: string) => unknown }).from = (table: string) => {
      if (table === "reminder_send" && preRead) {
        preRead = false;
        // The pre-read sees no rows; meanwhile a concurrent run claims Maya.
        fake.tables.reminder_send.push({
          membership_id: MAYA.membership,
          occurrence_id: OCC,
          sent_at: NOW.toISOString(),
        });
        return createFakeAdmin({ reminder_send: [] }).client.from("reminder_send");
      }
      return realFrom(table);
    };

    const result = await sendReminders(fake.client, NOW);

    // Josh (already reminded) and Maya (raced) both lose the claim.
    expect(result).toEqual({ sent: 3, skipped: 2, failed: 0, failedOccurrences: 0 });
    expect(sentEmails.map((e) => e.to).sort()).toEqual([ANA.email, BEN.email, SARAH.email].sort());
    expect(sentEmails.some((e) => e.to === MAYA.email || e.to === JOSH.email)).toBe(false);
    expect(fake.tables.reminder_send).toHaveLength(5);
  });

  it("counts a failing occurrence and still processes the others", async () => {
    const tables = fixture();
    tables.occurrence.push({
      id: "occ-orphan",
      loop_id: "loop-1",
      starts_at: "2026-10-22T20:00:00.000Z",
      linked_url: null,
      cancelled: false,
    });
    fake = createFakeAdmin(tables);
    const realFrom = fake.client.from.bind(fake.client);
    let loopReads = 0;
    (fake.client as unknown as { from: (table: string) => unknown }).from = (table: string) => {
      // The first occurrence (occ-orphan, earlier) fails on its loop read.
      if (table === "loop" && loopReads++ === 0) throw new Error("connection reset");
      return realFrom(table);
    };

    const result = await sendReminders(fake.client, NOW);

    expect(result).toEqual({ sent: 4, skipped: 1, failed: 0, failedOccurrences: 1 });
    expect(console.error).toHaveBeenCalled();
  });

  it("throws a configuration error when REMINDER_LINK_SECRET is missing, before touching data", async () => {
    delete process.env.REMINDER_LINK_SECRET;
    const untouched = {
      from() {
        throw new Error("should not query");
      },
    } as unknown as FakeAdmin["client"];
    await expect(sendReminders(untouched, NOW)).rejects.toThrow(
      "Missing environment variable REMINDER_LINK_SECRET",
    );
  });
});

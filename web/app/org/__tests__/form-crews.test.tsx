import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/app/org/__tests__/fake-supabase";
import { createFakeAdmin, type FakeAdmin, type FakeRpcHandler, type FakeTables } from "@/lib/__tests__/fakeAdmin";
import type { EmailMessage } from "@/lib/email";
import type { AdminClient } from "@/lib/loops";

const requirePerson = vi.fn();
const revalidatePath = vi.fn();
const failFor = new Set<string>();
let server = fakeSupabase();
let fake: FakeAdmin;
/** Every admin `from`/`rpc` call, to prove the organizer check runs first. */
let adminOps: string[] = [];

function countedAdmin(f: FakeAdmin): AdminClient {
  return {
    from: (table: string) => {
      adminOps.push(`from:${table}`);
      return f.client.from(table);
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      adminOps.push(`rpc:${fn}`);
      return f.client.rpc(fn as never, args as never);
    },
  } as unknown as AdminClient;
}

vi.mock("@/lib/auth", () => ({ requirePerson: (...args: unknown[]) => requirePerson(...args) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => server.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => countedAdmin(fake) }));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(),
}));
vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...actual,
    sendEmail: async (message: EmailMessage) => {
      if (failFor.has(message.to)) throw new Error("Resend: rejected");
      return actual.sendEmail(message);
    },
  };
});

import { confirmFormCrews, previewFormCrews, type FormCrewsState } from "@/app/org/[slug]/form-crews-actions";
import { FormCrews } from "@/app/org/[slug]/form-crews";
import { resetSentEmails, sentEmails } from "@/lib/email";
import { previewFormation } from "@/lib/formationRun";
import { INTENT_LABELS } from "@/lib/loops";

const SLUG = "cs2110-thursdays";
const organizer = { id: "org-1", campus_id: "campus-1", email: "dana@cornell.edu", first_name: "Dana" };
const loopRow = {
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
  linked_url: "https://lu.ma/default",
};

const at = (minute: number) => `2026-10-16T23:${String(minute).padStart(2, "0")}:00.123456+00:00`;

const NAMES = ["Sarah", "Josh", "Maya", "Lydia", "Priya", "Leo", "Ana", "Tom", "Zoe"];

function m(n: number, intent: string, crew: string | null) {
  return {
    id: `m${n}`,
    loop_id: "loop-1",
    person_id: `p${n}`,
    intent,
    tapped_in_at: at(n),
    crew_id: crew,
    crewed_at: crew ? at(0) : null,
    left_at: null,
  };
}

/**
 * crew-a has Sarah, Josh, Maya, Lydia (4). Eligible: Priya (going anyway),
 * then Leo, Ana, Tom, Zoe (conditional). Step 1 puts Priya into crew-a;
 * step 2 forms one new crew of Leo, Ana, Tom, Zoe. Two crews get emails.
 */
function seed(memberships = [
  m(1, "crew_conditional", "crew-a"),
  m(2, "crew_conditional", "crew-a"),
  m(3, "crew_conditional", "crew-a"),
  m(4, "going_want_crew", "crew-a"),
  m(5, "going_want_crew", null),
  m(6, "crew_conditional", null),
  m(7, "crew_conditional", null),
  m(8, "crew_conditional", null),
  m(9, "crew_conditional", null),
]): FakeTables {
  return {
    loop: [loopRow],
    campus: [{ id: "campus-1", tz: "America/New_York" }],
    person: [
      { id: "org-1", first_name: "Dana", email: "dana@cornell.edu" },
      ...NAMES.map((first_name, i) => ({ id: `p${i + 1}`, first_name, email: `p${i + 1}@cornell.edu` })),
    ],
    membership: memberships,
    crew: [{ id: "crew-a", loop_id: "loop-1", formed_at: at(0), anchored: true }],
    occurrence: [
      { id: "o1", loop_id: "loop-1", starts_at: "2026-10-22T23:00:00+00:00", linked_url: null, cancelled: false },
    ],
  };
}

/** Applies placements to the fake tables the way apply_formation does. */
const applyOk: FakeRpcHandler = (_fn, args, tables) => {
  const p = args.p_placements as {
    fills: { crew_id: string; membership_id: string }[];
    new_crews: { membership_ids: string[] }[];
  };
  const place = (id: string, crewId: string) => {
    const row = tables.membership.find((r) => r.id === id)!;
    row.crew_id = crewId;
    row.crewed_at = "2026-10-20T12:00:00+00:00";
  };
  for (const f of p.fills) place(f.membership_id, f.crew_id);
  p.new_crews.forEach((c, i) => {
    const id = `new-${i + 1}`;
    tables.crew.push({ id, loop_id: args.p_loop_id, formed_at: "2026-10-20T12:00:00+00:00", anchored: false });
    for (const mid of c.membership_ids) place(mid, id);
  });
  return { data: { crews_created: p.new_crews.length }, error: null };
};

function setup(tables: FakeTables = seed(), rpc: FakeRpcHandler = applyOk) {
  fake = createFakeAdmin(tables, { rpc });
  server = fakeSupabase({ tables: { loop: [loopRow] } });
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

const idle: FormCrewsState = { status: "idle" };

async function currentHash(): Promise<string> {
  return (await previewFormation(fake.client, "loop-1")).inputHash;
}

const originalEnv = { ...process.env };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
  process.env.NEXT_PUBLIC_APP_URL = "https://loop.example";
  process.env.EMAIL_FROM = "Loop <loop@example.com>";
  requirePerson.mockResolvedValue(organizer);
  resetSentEmails();
  failFor.clear();
  adminOps = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  setup();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  process.env = { ...originalEnv };
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function countFor(label: string): string {
  const li = screen.getByText(label).closest("li");
  if (!li) throw new Error(`no row for ${label}`);
  return li.querySelector(".pls-mono")?.textContent ?? "";
}

const SARAH_CREW = {
  kind: "existing",
  members: [
    { firstName: "Sarah", joining: false },
    { firstName: "Josh", joining: false },
    { firstName: "Maya", joining: false },
    { firstName: "Lydia", joining: false },
    { firstName: "Priya", joining: true },
  ],
};

describe("Form crews idle step", () => {
  it("shows the waiting count and a Form crews button, with no hash and no Confirm", () => {
    render(<FormCrews slug={SLUG} waiting={5} />);
    const section = screen.getByRole("region", { name: "Form crews" });
    expect(section.textContent).toContain("5 eligible and not yet in a crew");
    expect(within(section).getByRole("button", { name: "Form crews" })).toBeTruthy();
    expect(within(section).queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(section.querySelector('input[name="input_hash"]')).toBeNull();
    expect(section.querySelector<HTMLInputElement>('input[name="slug"]')?.value).toBe(SLUG);
    for (const name of NAMES) expect(section.textContent).not.toContain(name);
  });

  it("offers no button when nobody is waiting", () => {
    render(<FormCrews slug={SLUG} waiting={0} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("Form crews shows the named preview with Confirm carrying the hash; Cancel returns to idle", async () => {
    render(<FormCrews slug={SLUG} waiting={5} />);
    fireEvent.click(screen.getByRole("button", { name: "Form crews" }));

    const confirm = await screen.findByRole("button", { name: "Confirm" });
    const section = screen.getByRole("region", { name: "Form crews" });
    expect(countFor("Joining existing crews")).toBe("1");
    expect(countFor("New crews")).toBe("1 (4 members)");
    expect(countFor("Still waiting")).toBe("0");
    const crews = within(section).getByRole("list", { name: "Proposed crews" }).querySelectorAll(":scope > li");
    expect([...crews].map((li) => li.textContent)).toEqual([
      "Existing crew, now 5Sarah, Josh, Maya, Lydia, Priya (joining)",
      "New crew of 4Leo, Ana, Tom, Zoe",
    ]);
    expect(section.querySelector<HTMLInputElement>('input[name="input_hash"]')?.value).toBe(await currentHash());
    expect(confirm).toBeTruthy();
    expect(fake.rpcCalls).toEqual([]);
    expect(sentEmails).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByRole("button", { name: "Form crews" });
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(section.querySelector('input[name="input_hash"]')).toBeNull();
  });
});

describe("previewFormCrews", () => {
  it("returns counts, placements named per crew, and the hash, with no writes or emails", async () => {
    const before = JSON.stringify(fake.tables);
    const state = await previewFormCrews(idle, form({ slug: SLUG }));
    expect(state).toEqual({
      status: "preview",
      counts: { placedIntoExisting: 1, newCrewSizes: [4], waiting: 0 },
      placements: [
        SARAH_CREW,
        {
          kind: "new",
          members: ["Leo", "Ana", "Tom", "Zoe"].map((firstName) => ({ firstName, joining: true })),
        },
      ],
      inputHash: await currentHash(),
    });
    expect(JSON.stringify(fake.tables)).toBe(before);
    expect(fake.rpcCalls).toEqual([]);
    expect(sentEmails).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns an empty preview when nothing would change", async () => {
    setup({
      ...seed([m(5, "crew_conditional", null), m(6, "crew_conditional", null), m(7, "watching", null)]),
      crew: [],
    });
    const state = await previewFormCrews(idle, form({ slug: SLUG }));
    expect(state).toMatchObject({
      status: "preview",
      counts: { placedIntoExisting: 0, newCrewSizes: [], waiting: 2 },
      placements: [],
    });
  });

  it("refuses a non-organizer with not found before any admin call", async () => {
    requirePerson.mockResolvedValue({ ...organizer, id: "someone-else" });
    await expect(previewFormCrews(idle, form({ slug: SLUG }))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(adminOps).toEqual([]);
  });
});

describe("confirmFormCrews", () => {
  it("refuses a non-organizer with not found before any admin call", async () => {
    requirePerson.mockResolvedValue({ ...organizer, id: "someone-else" });
    await expect(confirmFormCrews(idle, form({ slug: SLUG, input_hash: "x" }))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(adminOps).toEqual([]);
    expect(fake.rpcCalls).toEqual([]);
    expect(sentEmails).toEqual([]);
  });

  it("forms crews and sends exactly one email per placed member, each naming only its own crew", async () => {
    const hash = await currentHash();
    const state = await confirmFormCrews(idle, form({ slug: SLUG, input_hash: hash }));

    expect(state).toEqual({ status: "formed", placed: 5, emailed: 5, emailFailed: 0, emailFailedFirstNames: [] });
    expect(fake.rpcCalls.map((c) => c.fn)).toEqual(["apply_formation"]);
    expect(revalidatePath).toHaveBeenCalledWith(`/org/${SLUG}`);

    expect(sentEmails.map((e) => e.to).sort()).toEqual(
      ["p5", "p6", "p7", "p8", "p9"].map((p) => `${p}@cornell.edu`),
    );

    const byTo = new Map(sentEmails.map((e) => [e.to, e]));
    const priya = byTo.get("p5@cornell.edu")!;
    expect(priya.text).toContain("Your crew: Sarah, Josh, Maya, Lydia and Priya (you).");
    for (const other of ["Leo", "Ana", "Tom", "Zoe"]) expect(priya.html).not.toContain(other);

    const leo = byTo.get("p6@cornell.edu")!;
    expect(leo.text).toContain("Your crew: Leo (you), Ana, Tom and Zoe.");
    for (const other of ["Sarah", "Josh", "Maya", "Lydia", "Priya"]) expect(leo.html).not.toContain(other);

    for (const e of sentEmails) {
      for (const body of [e.html, e.text]) {
        expect(body).toContain(`https://loop.example/l/${SLUG}/leave`);
        expect(body).toContain(`https://loop.example/l/${SLUG}/me`);
        expect(body).toContain("Thu, Oct 22, 7:00 PM");
        expect(body).not.toContain("@cornell.edu");
        expect(body).not.toMatch(/crew_conditional|going_want_crew|watching/);
        for (const label of Object.values(INTENT_LABELS)) expect(body).not.toContain(label);
      }
    }
    // Members already in crew-a were not newly placed and get nothing.
    for (const p of ["p1", "p2", "p3", "p4"]) expect(byTo.has(`${p}@cornell.edu`)).toBe(false);
  });

  it("returns a fresh preview and sends nothing when the pool changed since the preview", async () => {
    const staleHash = await currentHash();
    fake.tables.membership.push(m(10, "crew_conditional", null));
    fake.tables.person.push({ id: "p10", first_name: "Nia", email: "p10@cornell.edu" });
    const freshHash = await currentHash();
    expect(freshHash).not.toBe(staleHash);

    const state = await confirmFormCrews(idle, form({ slug: SLUG, input_hash: staleHash }));
    expect(state).toEqual({
      status: "preview",
      message: "The pool changed since the preview. Here's the fresh one.",
      counts: { placedIntoExisting: 1, newCrewSizes: [5], waiting: 0 },
      placements: [
        SARAH_CREW,
        {
          kind: "new",
          members: ["Leo", "Ana", "Tom", "Zoe", "Nia"].map((firstName) => ({ firstName, joining: true })),
        },
      ],
      inputHash: freshHash,
    });
    expect(fake.rpcCalls).toEqual([]);
    expect(sentEmails).toEqual([]);
    expect(revalidatePath).toHaveBeenCalledWith(`/org/${SLUG}`);
  });

  it("a second confirm with the same hash applies nothing and says crews are already formed", async () => {
    const hash = await currentHash();
    const first = await confirmFormCrews(idle, form({ slug: SLUG, input_hash: hash }));
    const second = await confirmFormCrews(first, form({ slug: SLUG, input_hash: hash }));

    expect(first.status).toBe("formed");
    expect(fake.rpcCalls.map((c) => c.fn)).toEqual(["apply_formation"]);
    expect(sentEmails).toHaveLength(5);
    expect(second).toMatchObject({
      status: "preview",
      placements: [],
      message: "Crews are already formed.",
      counts: { placedIntoExisting: 0, newCrewSizes: [], waiting: 0 },
    });
  });

  it("says the pool changed, not already formed, when it shrank below a crew after the preview", async () => {
    // No crews; four conditional members preview as one new crew of 4.
    setup({
      ...seed([6, 7, 8, 9].map((n) => m(n, "crew_conditional", null))),
      crew: [],
    });
    const staleHash = await currentHash();
    fake.tables.membership = fake.tables.membership.filter((r) => r.id !== "m9");

    const state = await confirmFormCrews(idle, form({ slug: SLUG, input_hash: staleHash }));
    expect(state).toMatchObject({
      status: "preview",
      message: "The pool changed since the preview. Here's the fresh one.",
      counts: { placedIntoExisting: 0, newCrewSizes: [], waiting: 3 },
      placements: [],
    });
    expect(fake.rpcCalls).toEqual([]);
    expect(sentEmails).toEqual([]);
  });

  it("reports a generic error and sends nothing when apply_formation fails", async () => {
    setup(seed(), () => ({ data: null, error: { code: "XX000", message: "boom" } }));
    const state = await confirmFormCrews(idle, form({ slug: SLUG, input_hash: await currentHash() }));
    expect(state.status).toBe("error");
    expect(sentEmails).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("still reports formed when one member's email fails, counting it", async () => {
    failFor.add("p7@cornell.edu");
    const state = await confirmFormCrews(idle, form({ slug: SLUG, input_hash: await currentHash() }));
    expect(state).toEqual({
      status: "formed",
      placed: 5,
      emailed: 4,
      emailFailed: 1,
      emailFailedFirstNames: ["Ana"],
    });
    expect(sentEmails).toHaveLength(4);
    expect(fake.tables.membership.find((r) => r.id === "m7")?.crew_id).toBe("new-1");
    expect(revalidatePath).toHaveBeenCalledWith(`/org/${SLUG}`);
  });
});

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
  type Call,
  type Responder,
} from "@/app/l/[slug]/__tests__/fake-admin";

type Person = { id: string; campus_id: string; email: string; first_name: string | null };

const admin = vi.hoisted(() => ({ respond: (() => null) as Responder, calls: [] as Call[] }));
const auth = vi.hoisted(() => ({ getPerson: vi.fn(async (): Promise<Person | null> => null) }));
const rls = vi.hoisted(() => ({ membership: null as null | { id: string; left_at: string | null } }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const fake = fakeAdmin((call) => admin.respond(call));
    admin.calls = fake.calls;
    return fake.client;
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => fakeAdmin(withLeakBait(() => rls.membership)).client,
}));
vi.mock("@/lib/auth", () => ({
  getPerson: auth.getPerson,
  requirePerson: vi.fn(),
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

import { TapIn } from "@/app/l/[slug]/tap-in";

const NOW = new Date("2030-10-20T12:00:00.000Z");
const SARAH: Person = {
  id: "p1",
  campus_id: SEED_LOOP.campus_id,
  email: "sarah@cornell.edu",
  first_name: "Sarah",
};

function props(slug: string, query: Record<string, string> = {}) {
  return { params: Promise.resolve({ slug }), searchParams: Promise.resolve(query) };
}

const radio = (name: RegExp) => screen.getByRole("radio", { name }) as HTMLInputElement;
const input = (container: HTMLElement, name: string) =>
  container.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  admin.respond = seedResponder();
  admin.calls = [];
  auth.getPerson.mockResolvedValue(null);
  rls.membership = null;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("/l/[slug] tap-in page", () => {
  it("renders the facts, the next meeting in the campus zone, and the effective link", async () => {
    const { container } = render(await TapIn(props("cs2110-thursdays")));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(SEED_LOOP.title);
    expect(container.textContent).toContain("Thursdays · 7:00 PM · 90 min");
    expect(container.textContent).toContain("Thu, Oct 24, 7:00 PM");
    expect(container.textContent).toContain(SEED_LOOP.place);
    // Next occurrence (o1) has no override, so the loop default is the link.
    expect(screen.getByRole("link").getAttribute("href")).toBe(SEED_LOOP.linked_url);
  });

  it("uses the occurrence's own URL when the next occurrence overrides it", async () => {
    admin.respond = seedResponder(() => null, {
      occurrences: [
        {
          id: "o1",
          starts_at: "2030-10-24T23:00:00.000Z",
          linked_url: "https://lu.ma/override",
          cancelled: false,
        },
      ],
    });
    render(await TapIn(props("cs2110-thursdays")));
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://lu.ma/override");
  });

  it("reads the loop with explicit columns only, never *", async () => {
    render(await TapIn(props("cs2110-thursdays")));
    for (const call of admin.calls) {
      expect(call.op).toBe("select");
      expect(call.columns).toBeDefined();
      expect(call.columns).not.toContain("*");
    }
    const loopRead = admin.calls.find((c) => c.table === "loop");
    expect(loopRead?.columns).toBe(
      "id, slug, title, weekday, start_local, single_occurrence_at, duration_min, place, linked_url, campus_id",
    );
  });

  it("defaults to crew_conditional, carries the cleaned d, and offers the optional RSVP-source dropdown", async () => {
    const { container } = render(await TapIn(props("cs2110-thursdays", { d: DROP_TOKEN })));
    expect(radio(/In if there's a crew/).checked).toBe(true);
    expect(screen.getByRole("button", { name: "In if there's a crew" })).toBeTruthy();
    expect(input(container, "d")?.value).toBe(DROP_TOKEN);
    expect(input(container, "slug")?.value).toBe("cs2110-thursdays");

    const select = screen.getByLabelText("Already RSVPed somewhere?") as HTMLSelectElement;
    expect(select.required).toBe(false);
    expect(select.value).toBe("");
    const options = Array.from(select.options).map((o) => [o.value, o.textContent]);
    expect(options).toEqual([
      ["", "Optional"],
      ["luma", "Luma"],
      ["partiful", "Partiful"],
      ["campusgroups", "CampusGroups"],
      ["other", "Other"],
      ["none", "None"],
    ]);
  });

  it("puts an empty d in the form when ?d= is malformed", async () => {
    const { container } = render(await TapIn(props("cs2110-thursdays", { d: "bad token" })));
    expect(input(container, "d")?.value).toBe("");
  });

  it("contains no first names, no member counts, and no drop label, with or without ?d=", async () => {
    const queries: Record<string, string>[] = [{}, { d: DROP_TOKEN }];
    for (const query of queries) {
      const { container } = render(await TapIn(props("cs2110-thursdays", query)));
      const html = container.innerHTML;
      for (const name of PERSON_NAMES) expect(html).not.toContain(name);
      expect(html).not.toMatch(/\d\s*member/i);
      expect(html).not.toMatch(/\d\s*(people|crew|in the pool)/i);
      expect(html).not.toContain(DROP_LABEL);
      expect(html).not.toContain("Olin 2nd floor pin");
      cleanup();
    }
  });

  it("404s for an unknown slug", async () => {
    await expect(TapIn(props("nope"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("redirects a signed-in active member to the member page", async () => {
    auth.getPerson.mockResolvedValue(SARAH);
    rls.membership = { id: "m1", left_at: null };
    await expect(TapIn(props("cs2110-thursdays"))).rejects.toThrow(
      "NEXT_REDIRECT:/l/cs2110-thursdays/me",
    );
  });

  it("completes the sign-in round trip (?intent=&d=&src=) for a signed-in, named non-member", async () => {
    auth.getPerson.mockResolvedValue(SARAH);
    admin.respond = seedResponder((call) => {
      if (call.table === "membership" && call.op === "insert") return { id: "m-new" };
      return null;
    });
    await expect(
      TapIn(props("cs2110-thursdays", { intent: "watching", d: DROP_TOKEN, src: "luma" })),
    ).rejects.toThrow("NEXT_REDIRECT:/l/cs2110-thursdays/me");
    const inserts = admin.calls.filter((c) => c.table === "membership" && c.op === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toMatchObject({
      intent: "watching",
      drop_id: "d0000000-0000-4000-8000-000000000001",
      rsvp_source: "luma",
    });
  });

  it("sends a signed-in person without a first name to /welcome with next back to the same tap-in", async () => {
    auth.getPerson.mockResolvedValue({ ...SARAH, first_name: null });
    const back = `/l/cs2110-thursdays?intent=watching&d=${DROP_TOKEN}&src=luma`;
    await expect(
      TapIn(props("cs2110-thursdays", { intent: "watching", d: DROP_TOKEN, src: "luma" })),
    ).rejects.toThrow(`NEXT_REDIRECT:/welcome?next=${encodeURIComponent(back)}`);
    expect(admin.calls.filter((c) => c.op !== "select")).toHaveLength(0);
  });

  it("shows the other-campus message after a rejected tap-in", async () => {
    render(await TapIn(props("cs2110-thursdays", { error: "other_campus" })));
    expect(screen.getByRole("alert").textContent).toContain("another campus");
  });

  it("renders a one-off loop with its single date and no weekday line", async () => {
    admin.respond = seedResponder(() => null, {
      loop: ONE_OFF_LOOP,
      occurrences: ONE_OFF_OCCURRENCES,
    });
    const { container } = render(await TapIn(props("halloween-skate")));
    expect(container.textContent).toContain("Thu, Oct 31, 7:30 PM");
    expect(container.textContent).not.toMatch(
      /Mondays|Tuesdays|Wednesdays|Thursdays|Fridays|Saturdays|Sundays|Weekly/,
    );
    expect(screen.getByRole("button", { name: "In if there's a crew" })).toBeTruthy();
  });

  it("shows a one-off loop whose occurrence has ended as past, with no tap-in form", async () => {
    vi.setSystemTime(new Date("2030-11-05T12:00:00.000Z"));
    admin.respond = seedResponder(() => null, {
      loop: ONE_OFF_LOOP,
      occurrences: ONE_OFF_OCCURRENCES,
    });
    const { container } = render(await TapIn(props("halloween-skate")));
    expect(container.textContent).toContain("Happened");
    expect(container.textContent).toContain("Thu, Oct 31, 7:30 PM");
    expect(screen.queryByRole("radio")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });

  it("shows a cancelled one-off as cancelled with its date, no tap-in form, and no round-trip write", async () => {
    auth.getPerson.mockResolvedValue(SARAH);
    admin.respond = seedResponder(() => null, {
      loop: ONE_OFF_LOOP,
      occurrences: [{ ...ONE_OFF_OCCURRENCES[0], cancelled: true }],
    });
    const { container } = render(await TapIn(props("halloween-skate", { intent: "watching" })));
    expect(container.textContent).toContain("Cancelled · Thu, Oct 31, 7:30 PM");
    expect(container.textContent).not.toContain("Happened");
    expect(container.textContent).not.toContain("already happened");
    expect(screen.queryByRole("radio")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(admin.calls.filter((c) => c.op !== "select")).toHaveLength(0);
  });

  it("shows a cancelled one-off whose time has passed as ended, not cancelled", async () => {
    vi.setSystemTime(new Date("2030-11-05T12:00:00.000Z"));
    admin.respond = seedResponder(() => null, {
      loop: ONE_OFF_LOOP,
      occurrences: [{ ...ONE_OFF_OCCURRENCES[0], cancelled: true }],
    });
    const { container } = render(await TapIn(props("halloween-skate")));
    expect(container.textContent).toContain("Happened");
    expect(container.textContent).not.toContain("Cancelled");
    expect(container.querySelector("form")).toBeNull();
  });

  it("keeps a future one-off open even when no occurrence row is pending", async () => {
    admin.respond = seedResponder(() => null, { loop: ONE_OFF_LOOP, occurrences: [] });
    const { container } = render(await TapIn(props("halloween-skate")));
    expect(container.textContent).not.toContain("Happened");
    expect(container.textContent).not.toContain("Cancelled");
    expect(container.querySelector("form")).not.toBeNull();
  });
});

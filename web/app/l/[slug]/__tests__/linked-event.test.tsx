import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SEED_LOOP,
  SEED_OCCURRENCES,
  eqValue,
  fakeAdmin,
  seedResponder,
  withLeakBait,
  type Call,
  type Responder,
} from "@/app/l/[slug]/__tests__/fake-admin";

/**
 * Task 7.3 (linked-events "Preview never blocks render"): tap-in and member
 * pages show the effective URL (next occurrence's override, else the loop
 * default) as a plain link, with the cached `link_preview` title when a row
 * exists, and never touch the network.
 */

type OwnMembership = { id: string; intent: string; crew_id: string | null; left_at: string | null };

const admin = vi.hoisted(() => ({ respond: (() => null) as Responder, calls: [] as Call[] }));
const rls = vi.hoisted(() => ({
  membership: null as OwnMembership | null,
  crew: [] as unknown[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () =>
    fakeAdmin((call) => {
      admin.calls.push(call);
      return admin.respond(call);
    }).client,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () =>
    fakeAdmin(
      withLeakBait((c) => (c.table === "v_crew_members" ? rls.crew : rls.membership)),
    ).client,
}));
vi.mock("@/lib/auth", () => ({
  getPerson: vi.fn(async () => null),
  requirePerson: vi.fn(async () => ({
    id: "a0000000-0000-4000-8000-000000000002",
    campus_id: "c0000000-0000-4000-8000-000000000001",
    email: "sarah@cornell.edu",
    first_name: "Sarah",
  })),
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
import { TapIn } from "@/app/l/[slug]/tap-in";

const NOW = new Date("2030-10-20T12:00:00.000Z");
const OVERRIDE = "https://lu.ma/cs2110-week1?ref=loop";

function props(slug = "cs2110-thursdays") {
  return { params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) };
}

/** Seed responder plus a `link_preview` table keyed by URL. */
function withPreviews(
  previews: Record<string, { title: string | null; image_url: string | null }>,
  occurrences: unknown[] = SEED_OCCURRENCES,
): Responder {
  return seedResponder(
    (call) => {
      if (call.table !== "link_preview") return null;
      const url = eqValue(call, "url") as string;
      return Object.hasOwn(previews, url) ? { url, ...previews[url] } : null;
    },
    { occurrences },
  );
}

const fetchSpy = vi.fn(() => {
  throw new Error("network access during a page request");
});

const PAGES = [
  ["tap-in", () => TapIn(props())],
  ["member (waiting)", () => Member(props())],
  [
    "member (crewed)",
    () => {
      rls.membership = { id: "m1", intent: "crew_conditional", crew_id: "crew-1", left_at: null };
      rls.crew = [{ membership_id: "m1", first_name: "Sarah", is_you: true, rsvp_status: "no_reply" }];
      return Member(props());
    },
  ],
] as const;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockClear();
  admin.respond = seedResponder();
  admin.calls = [];
  rls.membership = { id: "m1", intent: "crew_conditional", crew_id: null, left_at: null };
  rls.crew = [];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe.each(PAGES)("linked event on the %s page", (_name, renderPage) => {
  it("renders with a cached preview and makes no network call", async () => {
    admin.respond = withPreviews({
      [SEED_LOOP.linked_url]: {
        title: "CS 2110 study night",
        image_url: "https://images.lu.ma/cover.png",
      },
    });
    const { container } = render(await renderPage());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.textContent).toContain("CS 2110 study night");
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(SEED_LOOP.linked_url);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.textContent).toBe("lu.ma/cs2110-default");
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://images.lu.ma/cover.png");
  });

  it("reads link_preview through the service role with explicit columns, by the effective URL", async () => {
    render(await renderPage());
    const reads = admin.calls.filter((c) => c.table === "link_preview");
    expect(reads).toHaveLength(1);
    expect(reads[0].op).toBe("select");
    expect(reads[0].columns).toBe("url, title, image_url");
    expect(eqValue(reads[0], "url")).toBe(SEED_LOOP.linked_url);
  });

  it("shows only the plain link when no preview row exists", async () => {
    const { container } = render(await renderPage());
    expect(fetchSpy).not.toHaveBeenCalled();
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(SEED_LOOP.linked_url);
    expect(link.textContent).toBe("lu.ma/cs2110-default");
    expect(container.querySelector("img")).toBeNull();
    const event = link.closest("dd")!;
    expect(event.textContent).toBe("lu.ma/cs2110-default");
  });

  it("uses the next occurrence's override URL and its preview, not the loop default's", async () => {
    admin.respond = withPreviews(
      {
        [OVERRIDE]: { title: "Week 1 kickoff", image_url: null },
        [SEED_LOOP.linked_url]: { title: "Default page title", image_url: null },
      },
      [{ ...SEED_OCCURRENCES[0], linked_url: OVERRIDE }, SEED_OCCURRENCES[1]],
    );
    const { container } = render(await renderPage());
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(OVERRIDE);
    expect(link.textContent).toBe("lu.ma/cs2110-week1");
    expect(container.textContent).toContain("Week 1 kickoff");
    expect(container.textContent).not.toContain("Default page title");
    expect(container.innerHTML).not.toContain(SEED_LOOP.linked_url);
  });

  it("never renders a javascript: URL from the database as a link, and does not look it up", async () => {
    admin.respond = seedResponder(() => ({ url: "javascript:alert(1)", title: "x", image_url: null }), {
      occurrences: [{ ...SEED_OCCURRENCES[0], linked_url: "javascript:alert(1)" }],
    });
    const { container } = render(await renderPage());
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector('[href^="javascript"]')).toBeNull();
    expect(container.textContent).toContain("javascript:alert(1)");
    expect(admin.calls.filter((c) => c.table === "link_preview")).toHaveLength(0);
  });

  it("escapes the cached title and drops a non-https image", async () => {
    admin.respond = withPreviews({
      [SEED_LOOP.linked_url]: {
        title: '<img src=x onerror="alert(1)">Study',
        image_url: "http://images.example/cover.png",
      },
    });
    const { container } = render(await renderPage());
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">Study');
  });

  it("still renders the plain link when the preview read fails", async () => {
    admin.respond = seedResponder((call) => {
      if (call.table === "link_preview") throw new Error("db down");
      return null;
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(await renderPage());
    spy.mockRestore();
    expect(screen.getByRole("link").getAttribute("href")).toBe(SEED_LOOP.linked_url);
  });
});

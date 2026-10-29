// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeAdmin, type FakeAdmin } from "@/lib/__tests__/fakeAdmin";
import { signRsvpLink } from "@/lib/signedLink";

let fake: FakeAdmin;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fake.client,
}));

import { GET, POST } from "@/app/r/[token]/route";

const SECRET = "test-reminder-secret";
const NOW = new Date();
const HOUR = 60 * 60 * 1000;
const CREWED = "m-crewed";
const UNCREWED = "m-uncrewed";
const OCC = "occ-1";

const env = { ...process.env };

beforeEach(() => {
  process.env.REMINDER_LINK_SECRET = SECRET;
  fake = createFakeAdmin({
    loop: [{ id: "loop-1", slug: "cs-2110", duration_min: 90 }],
    membership: [
      { id: CREWED, loop_id: "loop-1", crew_id: "crew-1", left_at: null },
      { id: UNCREWED, loop_id: "loop-1", crew_id: null, left_at: null },
    ],
    occurrence: [
      { id: OCC, loop_id: "loop-1", starts_at: new Date(NOW.getTime() + 24 * HOUR).toISOString(), cancelled: false },
    ],
    rsvp: [],
  });
});

afterEach(() => {
  process.env = { ...env };
  vi.restoreAllMocks();
});

function get(token: string) {
  return GET(new Request(`https://loop.example/r/${token}`), {
    params: Promise.resolve({ token }),
  });
}

function post(token: string) {
  return POST(new Request(`https://loop.example/r/${token}`, { method: "POST" }), {
    params: Promise.resolve({ token }),
  });
}

function validToken(status: "in" | "out" = "in", membershipId = CREWED) {
  return signRsvpLink({ membershipId, occurrenceId: OCC, status }, SECRET, NOW);
}

function badTokens() {
  const tampered = `${validToken().slice(0, -3)}xyz`;
  const expired = signRsvpLink(
    { membershipId: CREWED, occurrenceId: OCC, status: "in" },
    SECRET,
    new Date(NOW.getTime() - 49 * HOUR),
  );
  return { tampered, expired };
}

describe.each([
  ["GET", get],
  ["POST", post],
] as const)("%s /r/[token] with a bad token", (_method, call) => {
  it("shows the same expired page for a tampered and for an expired token, writing nothing", async () => {
    const { tampered, expired } = badTokens();

    const a = await call(tampered);
    const b = await call(expired);
    const [bodyA, bodyB] = await Promise.all([a.text(), b.text()]);

    expect(a.status).toBe(410);
    expect(b.status).toBe(410);
    expect(bodyA).toBe(bodyB);
    expect(bodyA).toContain("This link has expired.");
    expect(bodyA).toContain('href="/signin"');
    expect(a.headers.get("content-type")).toContain("text/html");
    expect(a.headers.get("set-cookie")).toBeNull();
    expect(b.headers.get("set-cookie")).toBeNull();
    expect(fake.tables.rsvp).toEqual([]);
  });

  it("never verifies when the secret is unset", async () => {
    delete process.env.REMINDER_LINK_SECRET;
    const res = await call(validToken());
    expect(res.status).toBe(410);
    expect(fake.tables.rsvp).toEqual([]);
  });
});

describe("GET /r/[token] with a valid token", () => {
  it("writes nothing and returns a no-store page whose form POSTs the token back", async () => {
    const token = validToken("in");
    const res = await get(token);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(html).toContain(`<form method="post" action="/r/${token}">`);
    expect(html).toContain(">Mark me In</button>");
    expect(html).toContain("<script>document.forms[0].submit()</script>");
    expect(fake.tables.rsvp).toEqual([]);
  });

  it("labels the button Out for an Out token", async () => {
    const html = await (await get(validToken("out"))).text();
    expect(html).toContain(">Mark me Out</button>");
    expect(html).not.toContain("Mark me In");
    expect(fake.tables.rsvp).toEqual([]);
  });
});

describe("POST /r/[token] with a valid token", () => {
  it("records the RSVP and redirects to the member page with marked=in", async () => {
    const res = await post(validToken("in"));

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      `https://loop.example/l/cs-2110/me?marked=in&occ=${OCC}`,
    );
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.text()).toBe("");
    expect(fake.tables.rsvp).toHaveLength(1);
    expect(fake.tables.rsvp[0]).toMatchObject({ occurrence_id: OCC, membership_id: CREWED, status: "in" });
  });

  it("records out from the Out link", async () => {
    const res = await post(validToken("out"));
    expect(res.headers.get("location")).toContain("marked=out");
    expect(fake.tables.rsvp).toHaveLength(1);
    expect(fake.tables.rsvp[0]).toMatchObject({ status: "out" });
  });

  it("redirects without `marked` when the RSVP is refused", async () => {
    const res = await post(validToken("in", UNCREWED));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://loop.example/l/cs-2110/me");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(fake.tables.rsvp).toEqual([]);
  });

  it("treats a valid token for a membership that no longer exists as expired", async () => {
    const res = await post(validToken("in", "gone"));
    expect(res.status).toBe(410);
    expect(await res.text()).toContain("This link has expired.");
  });

  it("shows the expired page, not a 500, when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    (fake.client as unknown as { from: () => never }).from = () => {
      throw new Error("connection refused");
    };
    const res = await post(validToken("in"));
    expect(res.status).toBe(410);
    expect(await res.text()).toContain("This link has expired.");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { topUpOccurrences, adminClient } = vi.hoisted(() => ({
  topUpOccurrences: vi.fn(),
  adminClient: { stub: "admin" },
}));

vi.mock("@/lib/occurrenceTopUp", () => ({ topUpOccurrences }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => adminClient) }));

import { connection } from "next/server"; // the vitest.setup mock
import { GET } from "@/app/api/cron/occurrences/route";

const SECRET = "test-cron-secret";
const original = process.env.CRON_SECRET;

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://loop.example/api/cron/occurrences", { headers });
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  topUpOccurrences.mockResolvedValue({ loops: 2, inserted: 3, failed: [] });
});
afterEach(() => {
  process.env.CRON_SECRET = original;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("GET /api/cron/occurrences", () => {
  it("returns 401 without the bearer and never runs the job", async () => {
    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(topUpOccurrences).not.toHaveBeenCalled();
  });

  it("returns 200 with the job counts when the bearer matches", async () => {
    const res = await GET(request({ authorization: `Bearer ${SECRET}` }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      job: "occurrences",
      loops: 2,
      inserted: 3,
      failed: [],
    });
    expect(topUpOccurrences).toHaveBeenCalledTimes(1);
    expect(topUpOccurrences.mock.calls[0][0]).toBe(adminClient);
    expect(topUpOccurrences.mock.calls[0][1]).toBeInstanceOf(Date);
    // Required under cacheComponents before reading request headers.
    expect(connection).toHaveBeenCalledTimes(1);
  });

  it("returns 200 listing failed loop ids when only some loops fail", async () => {
    topUpOccurrences.mockResolvedValue({
      loops: 2,
      inserted: 4,
      failed: [{ loopId: "a", message: "select occurrences of loop a: connection refused" }],
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(request({ authorization: `Bearer ${SECRET}` }));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(JSON.parse(body)).toEqual({
      ok: true,
      job: "occurrences",
      loops: 2,
      inserted: 4,
      failed: ["a"],
    });
    expect(body).not.toContain("connection refused");
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it("returns 500 without leaking detail when every loop failed", async () => {
    topUpOccurrences.mockResolvedValue({
      loops: 1,
      inserted: 0,
      failed: [{ loopId: "a", message: "select occurrences of loop a: connection refused" }],
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(request({ authorization: `Bearer ${SECRET}` }));
    const body = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(body)).toEqual({ ok: false, job: "occurrences", error: "failed" });
    expect(body).not.toContain("connection refused");
  });

  it("returns 500 without leaking the error when the job throws", async () => {
    topUpOccurrences.mockRejectedValue(new Error("select weekly loops: connection refused"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(request({ authorization: `Bearer ${SECRET}` }));
    const body = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(body)).toEqual({ ok: false, job: "occurrences", error: "failed" });
    expect(body).not.toContain("connection refused");
    expect(logged).toHaveBeenCalledTimes(1);
  });
});

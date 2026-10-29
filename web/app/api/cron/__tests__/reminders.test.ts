// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendReminders, adminClient } = vi.hoisted(() => ({
  sendReminders: vi.fn(),
  adminClient: { stub: "admin" },
}));

vi.mock("@/lib/reminders", () => ({ sendReminders }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => adminClient) }));

import { connection } from "next/server"; // the vitest.setup mock
import { GET } from "@/app/api/cron/reminders/route";

const SECRET = "test-cron-secret";
const original = process.env.CRON_SECRET;
const counts = { sent: 2, skipped: 1, failed: 0, failedOccurrences: 0 };

function authorized(): Request {
  return new Request("https://loop.example/api/cron/reminders", {
    headers: { authorization: `Bearer ${SECRET}` },
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  sendReminders.mockResolvedValue(counts);
});
afterEach(() => {
  process.env.CRON_SECRET = original;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("GET /api/cron/reminders", () => {
  it("returns 401 without the bearer and never runs the job", async () => {
    const res = await GET(new Request("https://loop.example/api/cron/reminders"));
    expect(res.status).toBe(401);
    expect(sendReminders).not.toHaveBeenCalled();
  });

  it("passes `now` floored to the start of the UTC hour, so a late fire leaves no gap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T14:07:33.456Z"));

    const res = await GET(authorized());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, job: "reminders", ...counts });
    expect(sendReminders.mock.calls[0][0]).toBe(adminClient);
    const now = sendReminders.mock.calls[0][1] as Date;
    expect(now).toBeInstanceOf(Date);
    expect(now.getUTCMinutes()).toBe(0);
    expect(now.getUTCSeconds()).toBe(0);
    expect(now.getUTCMilliseconds()).toBe(0);
    expect(now.toISOString()).toBe("2026-10-21T14:00:00.000Z");
    // Required under cacheComponents before reading request headers.
    expect(connection).toHaveBeenCalledTimes(1);
  });

  it("returns 500 without detail when any occurrence failed", async () => {
    sendReminders.mockResolvedValue({ ...counts, failedOccurrences: 1 });
    const res = await GET(authorized());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, job: "reminders", error: "failed" });
  });

  it("returns 500 without detail when the job throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    sendReminders.mockRejectedValue(new Error("db password is hunter2"));
    const res = await GET(authorized());
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("hunter2");
  });
});

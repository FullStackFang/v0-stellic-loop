import { connection, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { sendReminders } from "@/lib/reminders";
import { createAdminClient } from "@/lib/supabase/admin";

const JOB = "reminders";

// Sends are throttled to one per 550 ms (lib/email.ts), so a 300 s run tops
// out near 500 reminders; more than that and a run gets cut off mid-way.
export const maxDuration = 300;

/** Daily at 14:00 UTC (vercel.json): reminders for occurrences 12–36 h out. */
export async function GET(request: Request) {
  // Required under cacheComponents (route segment `dynamic` is not allowed there):
  // reading `request.headers` during prerender without `await connection()` is a
  // build-time error. This is what makes the handler request-time.
  await connection();
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  // Floor to the start of the UTC hour: a late cron fire must not open a gap
  // between consecutive daily windows (each run covers exactly [+12 h, +36 h)
  // from 14:00 UTC, so yesterday's end is today's start).
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  try {
    const counts = await sendReminders(createAdminClient(), now);
    if (counts.failedOccurrences > 0) {
      return NextResponse.json({ ok: false, job: JOB, error: "failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, job: JOB, ...counts });
  } catch (err) {
    console.error(`cron ${JOB} failed`, err);
    return NextResponse.json({ ok: false, job: JOB, error: "failed" }, { status: 500 });
  }
}

import { connection, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { topUpOccurrences, type TopUpClient } from "@/lib/occurrenceTopUp";
import { createAdminClient } from "@/lib/supabase/admin";

const JOB = "occurrences";

export const maxDuration = 300;

export async function GET(request: Request) {
  // Required under cacheComponents (route segment `dynamic` is not allowed there):
  // reading `request.headers` during prerender without `await connection()` is a
  // build-time error. This is what makes the handler request-time.
  await connection();
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    // Cast: the structural check against SupabaseClient<any> hits TS2589 (see TopUpClient).
    const db = createAdminClient() as unknown as TopUpClient;
    const { loops, inserted, failed } = await topUpOccurrences(db, new Date());
    if (failed.length > 0) console.error(`cron ${JOB}: ${failed.length} loop(s) failed`, failed);
    if (loops > 0 && failed.length === loops) {
      return NextResponse.json({ ok: false, job: JOB, error: "failed" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      job: JOB,
      loops,
      inserted,
      failed: failed.map((f) => f.loopId),
    });
  } catch (err) {
    console.error(`cron ${JOB} failed`, err);
    return NextResponse.json({ ok: false, job: JOB, error: "failed" }, { status: 500 });
  }
}

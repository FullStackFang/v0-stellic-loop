import { connection, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";

const JOB = "watching-digest";

// Deferred (task 8.4): stub that only verifies the bearer secret.
export const maxDuration = 300;

export async function GET(request: Request) {
  // Required under cacheComponents: reading request.headers during prerender
  // without `await connection()` is a build-time error.
  await connection();
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, job: JOB });
}

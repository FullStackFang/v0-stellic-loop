// Fixed-window rate limits, in memory per instance. Enough to stop a script
// hammering codes or minting shares; not a global quota.
import "server-only";
import { headers } from "next/headers";

type Bucket = "identify" | "verify" | "share" | "board";

export const LIMITS: Record<Bucket, { perIp: number; perPhone: number; windowMs: number }> = {
  identify: { perIp: 30, perPhone: 10, windowMs: 60_000 },
  verify: { perIp: 20, perPhone: 10, windowMs: 60_000 },
  share: { perIp: 20, perPhone: 20, windowMs: 60_000 },
  board: { perIp: 5, perPhone: 5, windowMs: 3_600_000 },
};

const hits = new Map<string, { n: number; reset: number }>();

function hit(key: string, max: number, windowMs: number, now: number): boolean {
  const h = hits.get(key);
  if (!h || h.reset <= now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  h.n++;
  return h.n > max;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Counts this call; true when the caller is over a limit for `bucket`. */
export async function limited(bucket: Bucket, phone?: string | null, now = Date.now()): Promise<boolean> {
  const l = LIMITS[bucket];
  if (hits.size > 50_000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  const byIp = hit(`${bucket}:ip:${await clientIp()}`, l.perIp, l.windowMs, now);
  const key = phone?.replace(/\D/g, "");
  const byPhone = key ? hit(`${bucket}:ph:${key}`, l.perPhone, l.windowMs, now) : false;
  return byIp || byPhone;
}

/** Tests start from a clean slate. */
export function resetLimits() {
  hits.clear();
}

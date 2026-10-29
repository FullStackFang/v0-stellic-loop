import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron calls each job with `Authorization: Bearer <CRON_SECRET>`.
 * Fails closed when CRON_SECRET is unset or empty so a misconfigured deploy
 * never exposes the job routes. Compares in constant time.
 */
export function isAuthorizedCron(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

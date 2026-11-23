// Where the app says a page was opened (components/seen.tsx), for the admin's Activity section. One row is kept: the
// part of the site, who opened it if they were signed in, the browser it was opened on, and when (lib/campus/stats.ts).
// The browser is a random number kept in a cookie, so that someone not signed in is counted as one visitor. The answer
// is always empty, and a count that could not be kept never troubles the page that sent it.
import { randomBytes } from 'node:crypto';
import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { recordOpen } from '@/lib/campus/stats';
import { clerkIssuer, clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { limited } from '@/lib/ratelimit';

const VISITOR = 'lp_v';
const done = () => new Response(null, { status: 204 });

export async function POST(request: Request) {
  // Only the app's own pages count: a request from another site is dropped.
  if ((request.headers.get('sec-fetch-site') ?? 'same-origin') !== 'same-origin' || await limited('seen')) return done();
  const body: unknown = await request.json().catch(() => null);
  const path = typeof body === 'object' && body !== null ? (body as { path?: unknown }).path : null;
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > 300) return new Response(null, { status: 400 });
  try {
    const subject = clerkPortalConfigured() ? (await auth()).userId : null, jar = await cookies();
    let visitor = jar.get(VISITOR)?.value;
    if (!visitor || !/^[0-9a-f]{32}$/.test(visitor)) {
      visitor = randomBytes(16).toString('hex');
      jar.set(VISITOR, visitor, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 31_536_000 });
    }
    await recordOpen(db(), path, clerkIssuer(), subject, visitor);
  } catch (error) {
    // 42P01: the table is not there yet (its migration is run by hand). Nothing is counted until it is.
    if ((error as { code?: string })?.code !== '42P01') console.error('page open not counted', error instanceof Error ? error.message : error);
  }
  return done();
}

// Where the app says a page was opened (components/seen.tsx), for the admin's Activity section. One row is kept: the
// part of the site, who opened it if they were signed in, and when (lib/campus/stats.ts). The answer is always empty,
// and a count that could not be kept never troubles the page that sent it.
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { recordOpen } from '@/lib/campus/stats';
import { clerkIssuer, clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { limited } from '@/lib/ratelimit';

const done = () => new Response(null, { status: 204 });

export async function POST(request: Request) {
  // Only the app's own pages count: a request from another site is dropped.
  if ((request.headers.get('sec-fetch-site') ?? 'same-origin') !== 'same-origin' || await limited('seen')) return done();
  const body: unknown = await request.json().catch(() => null);
  const path = typeof body === 'object' && body !== null ? (body as { path?: unknown }).path : null;
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > 300) return new Response(null, { status: 400 });
  try {
    const subject = clerkPortalConfigured() ? (await auth()).userId : null;
    await recordOpen(db(), path, clerkIssuer(), subject);
  } catch (error) {
    // 42P01: the table is not there yet (its migration is run by hand). Nothing is counted until it is.
    if ((error as { code?: string })?.code !== '42P01') console.error('page open not counted', error instanceof Error ? error.message : error);
  }
  return done();
}

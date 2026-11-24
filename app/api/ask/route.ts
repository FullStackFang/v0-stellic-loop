import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { listCampuses } from '@/lib/campus/listings';
import { ASK_WHEN, askWindow, eventPath, publicEvents, siteUrl, type AskWhen } from '@/lib/campus/public';

// The one address an assistant can ask (openspec campus-public-places, design D7): what is on near a campus, for this
// many people, at this time. The same public facts as the pages. No key, no cookies read, and the CDN keeps each
// answer for five minutes, keyed by its address.
export const dynamic = 'force-dynamic';

const ASK_MOST = 20;
const HOW = `GET /api/ask?near={campus}&for={people}&when={${ASK_WHEN.join('|')}}`;
const answer = (body: object) => Response.json(body, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } });

export async function GET(request: NextRequest) {
  const asked = request.nextUrl.searchParams, near = asked.get('near')?.trim().toLowerCase() || null;
  const people = Number(asked.get('for')), size = Number.isInteger(people) && people >= 1 && people <= 100 ? people : null;
  const when: AskWhen = (ASK_WHEN as readonly string[]).includes(asked.get('when') ?? '') ? asked.get('when') as AskWhen : 'week';
  const campuses = await listCampuses(db()), list = campuses.map(({ slug, name }) => ({ slug, name }));
  if (!near) return answer({ how: HOW, campuses: list });
  const campus = campuses.find(each => each.slug === near);
  if (!campus) return answer({ near, for: size, when, events: [], campuses: list, how: HOW });
  const now = new Date(), { from, to } = askWindow(when, campus.tz, now);
  // `for` is carried back: no place is marked for one person yet, so it filters nothing out (design D7).
  const events = await publicEvents(db(), campus, { from, to, now, limit: ASK_MOST });
  return answer({ near: campus.slug, campus: campus.name, for: size, when, from: from.toISOString(), to: to.toISOString(), made: now.toISOString(),
    events: events.map(event => ({ title: event.title, start: event.startsAt, end: event.endsAt, place: event.place?.name ?? null, page: siteUrl(eventPath(event.id)), going: event.going })) });
}

import { db } from '@/lib/db';
import { listCampuses } from '@/lib/campus/listings';
import { ASK_WHEN, publicEvents, siteUrl } from '@/lib/campus/public';

// The guide file for assistants (openspec campus-public-places, design D6): what Loopd is, what can be read, the one
// address to ask, and what is not here. The campuses come from the database, so a new one is named without a code change.
// Built when asked and kept by the CDN for five minutes.
export const dynamic = 'force-dynamic';

export async function GET() {
  const campuses = await listCampuses(db()), now = new Date(), week = new Date(now.getTime() + 7 * 86400000);
  // The example asks about a campus with something on this week, so trying it gives an answer.
  let example = campuses[0]?.slug ?? 'cornell';
  for (const campus of campuses) if ((await publicEvents(db(), campus, { from: now, to: week, now, limit: 1 })).length) { example = campus.slug; break; }
  const text = `# Loopd

> Where college students go out in groups. Loopd lists what is on near each campus: events from public calendars and
> ones its team enters, and how many students are going to each.

## Campuses

${campuses.map(campus => `- ${campus.name} (near=${campus.slug})`).join('\n')}

## What you can read

Pages need no sign-in and no script. Each carries schema.org Place or Event data, and the time its counts were read.

- ${siteUrl('/places/{campus}/{place}')}: a place, what is on there in the next seven days, and how many are going.
- ${siteUrl('/events/{id}')}: one event: its time, place, host, the calendar it came from, and how many are going.
- ${siteUrl('/places/{campus}/{place}/record')}: groups that came to a place, and came back, when the place made it public.
- ${siteUrl('/sitemap.xml')}: every page above that has something on.

## Ask one question

GET ${siteUrl('/api/ask')}?near={campus}&for={people}&when={${ASK_WHEN.join('|')}}

Returns JSON: up to 20 events, soonest first, each with its title, start and end (UTC, and on the campus clock as
startLocal and endLocal), place, the place's page, minutes on foot from campus, the event's page and how many are going.
"when" is on the campus clock: today is now to midnight, tonight is 5pm to 4am, tomorrow is the whole next day, week is
seven days; it defaults to week. "for" is carried back in the answer and does not filter anything yet.
No key and no sign-in. Answers can be up to five minutes old. Example:
${siteUrl(`/api/ask?near=${example}&for=4&when=week`)}

## What you will not find

Names, faces, who is going, groups, or plans students post. Those need a school email and stay inside Loopd.
`;
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } });
}

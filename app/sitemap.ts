import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { listCampuses } from '@/lib/campus/listings';
import { eventPath, placePath, PUBLIC_PLACE_DAYS, publicEvents, publicPlaces, siteUrl } from '@/lib/campus/public';

// The public place and event pages (openspec campus-public-places, design D8), and nothing from the campus area under
// /c. A record is listed only once the admin made it public. Read when asked, so it needs no database at build.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date(), to = new Date(now.getTime() + PUBLIC_PLACE_DAYS * 86400000), pages: MetadataRoute.Sitemap = [];
  for (const campus of await listCampuses(db())) {
    const [places, events] = await Promise.all([publicPlaces(db(), campus, now), publicEvents(db(), campus, { from: now, to, now })]);
    for (const place of places) {
      pages.push({ url: siteUrl(placePath(campus.slug, place.tag)), changeFrequency: 'hourly' });
      if (place.recordPublic) pages.push({ url: siteUrl(`${placePath(campus.slug, place.tag)}/record`), changeFrequency: 'weekly' });
    }
    for (const event of events) pages.push({ url: siteUrl(eventPath(event.id)), changeFrequency: 'hourly' });
  }
  return pages;
}

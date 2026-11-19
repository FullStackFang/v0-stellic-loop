'use client';

import { useEffect } from 'react';
import { AT_COOKIE } from '@/lib/campus/schools';

/**
 * Leaves word of the campus on screen, so the pages that are not a campus's own (Ink, the groups, the front door) lead
 * back to it and not to the person's own campus. A person looking at New York stays in New York. Draws nothing.
 */
export function LookingAt({ slug }: { slug: string }) {
  useEffect(() => { document.cookie = `${AT_COOKIE}=${encodeURIComponent(slug)}; path=/; samesite=lax`; }, [slug]);
  return null;
}

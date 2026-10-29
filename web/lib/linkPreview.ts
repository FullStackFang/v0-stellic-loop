import "server-only";
import type { AdminClient } from "@/lib/loops";

/**
 * Cached previews of a loop's linked event page (linked-events "Preview never
 * blocks render"). Pages read the `link_preview` cache only; nothing here
 * touches the network. The fetcher that fills the cache is deferred (7.1–7.2),
 * so until then rows exist only when inserted by hand.
 */

/** `link_preview` has no `authenticated` policy, so it is read through the service role. */
export const LINK_PREVIEW_COLUMNS = "url, title, image_url";

export type LinkPreview = {
  url: string;
  title: string | null;
  image_url: string | null;
};

/**
 * The URL parsed, when it is an absolute http(s) URL; null otherwise. Save
 * validates the scheme already; this is the render-side check, so a
 * `javascript:` (or any other) value in the database never becomes a link.
 */
export function httpUrl(raw: string | null | undefined): URL | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url : null;
}

/** "lu.ma/cs2110" for https://lu.ma/cs2110: host plus path, no scheme, no trailing "/". */
export function displayUrl(url: URL): string {
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  return `${url.host}${path}`;
}

/**
 * The cached preview row for `url`, or null when there is none, the URL is not
 * http(s), or the read fails (a preview is never worth failing a page for).
 */
export async function getLinkPreview(
  db: AdminClient,
  url: string | null,
): Promise<LinkPreview | null> {
  if (url === null || httpUrl(url) === null) return null;
  try {
    const { data, error } = await db
      .from("link_preview")
      .select(LINK_PREVIEW_COLUMNS)
      .eq("url", url)
      .maybeSingle();
    if (error) throw error;
    return (data as LinkPreview | null) ?? null;
  } catch (err) {
    console.error(err);
    return null;
  }
}

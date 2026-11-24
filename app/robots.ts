import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/campus/public";

/** Boards are unlisted: anyone with the link, nobody by search. The public place and event pages are in the sitemap. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: ["/b/", "/p/"] }, sitemap: siteUrl("/sitemap.xml") };
}

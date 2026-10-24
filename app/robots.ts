import type { MetadataRoute } from "next";

/** Boards are unlisted: anyone with the link, nobody by search. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: ["/b/", "/p/"] } };
}

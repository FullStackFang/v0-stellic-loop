import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The default corner (bottom-left) covers the account button at the foot of the side menu.
  devIndicators: { position: 'bottom-right' },
  // Restored Turbopack build caches have reused stale CSS across deployments.
  experimental: { turbopackFileSystemCacheForBuild: false, serverActions: { bodySizeLimit: '4mb' } },
  // A person's own animal is drawn after one of the set's, read from disk by the campus screen's action (lib/campus/custom-face.ts).
  // The pages of the games Conga and Seats are read from disk too, by the routes that serve them (app/conga, app/seats).
  outputFileTracingIncludes: { '/c/**': ['./public/animals/*.png'], '/conga': ['./public/conga/index.html'], '/seats': ['./public/seats/index.html'] },
  // Every page is per-viewer and live (counts, your answer); nothing is prerendered or cached.
  // The static demos live in public/demo/ and serve without .html: /demo/stellic, /demo/quorum, /demo/mockups-….
  // Links to the old static site (/index.html, /quorum.html, …) follow them there.
  async redirects() {
    return [
      { source: "/demo", destination: "/demo/stellic", permanent: false },
      { source: "/index.html", destination: "/demo/stellic", permanent: false },
      { source: "/:page([^/.]+)\\.html", destination: "/demo/:page", permanent: false },
      // Conga was first a mockup under /demo. Links to it follow it to its own address.
      { source: "/demo/mockups-conga", destination: "/conga", permanent: false },
      { source: "/demo/mockups-conga.html", destination: "/conga", permanent: false },
    ];
  },
  // A file under public/ is asked for again on every visit unless told otherwise. The Conga game's sprite sheets (public/conga) carry
  // a version in their name (scripts/conga-atlas.mjs), so a browser may keep one for good. So do the recordings and stills of the games on the Doodles page (public/doodles).
  async headers() {
    return [{ source: "/conga/:file(.+\\.v\\d+\\.webp)", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/doodles/:file(.+\\.v\\d+\\.(?:mp4|webp))", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // The animal faces are on every page. Their names carry no version and a face is redrawn now and then, so a browser keeps
      // one for a day, and may show the kept one for a week while it asks again.
      { source: "/animals/:file(\\d+\\.(?:png|webp))", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] }];
  },
  async rewrites() {
    // Conga's page is served by app/conga, with its scripts beside it in public/conga. Seats' page is served by app/seats.
    return [{ source: "/demo/:page([^/.]+)", destination: "/demo/:page.html" }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

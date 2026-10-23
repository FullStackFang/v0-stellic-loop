import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is per-viewer and live (counts, your answer); nothing is prerendered or cached.
  // The static demos live in public/demo/ and serve without .html: /demo/stellic, /demo/quorum, /demo/mockups-….
  // Links to the old static site (/index.html, /quorum.html, …) follow them there.
  async redirects() {
    return [
      { source: "/demo", destination: "/demo/stellic", permanent: false },
      { source: "/index.html", destination: "/demo/stellic", permanent: false },
      { source: "/:page([^/.]+)\\.html", destination: "/demo/:page", permanent: false },
    ];
  },
  async rewrites() {
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

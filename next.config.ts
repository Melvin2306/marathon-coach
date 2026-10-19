import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // German visitors often type the German names of the legal pages.
  async redirects() {
    return [
      { source: "/impressum", destination: "/de/imprint", permanent: true },
      { source: "/datenschutz", destination: "/de/privacy", permanent: true },
      { source: "/:lang(en|de)/impressum", destination: "/:lang/imprint", permanent: true },
      { source: "/:lang(en|de)/datenschutz", destination: "/:lang/privacy", permanent: true },
    ];
  },
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // The service worker must never be served from a cache, or updates stall.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
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

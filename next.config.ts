import type { NextConfig } from "next";

// Everything the app loads comes from its own origin: fonts are self-hosted and imports are read locally.
// Next.js inlines its bootstrap scripts (and the JSON-LD), hence 'unsafe-inline' for scripts; there is no eval.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // Dev mode needs eval for fast refresh, so the policy only applies to production builds.
          ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: CSP }] : []),
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

import type { MetadataRoute } from "next";
import { BRAND_COLOR, SITE_NAME } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} · Marathon training coach`,
    short_name: SITE_NAME,
    description: "A periodised marathon plan, personal paces, imports from Apple Health, Garmin, Strava and more, heart-rate zones and treadmill programs.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f5f2",
    theme_color: BRAND_COLOR,
    categories: ["sports", "health", "fitness"],
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { src: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
      { src: "/icons/icon-maskable-512.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
  };
}

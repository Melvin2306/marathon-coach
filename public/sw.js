// M42 service worker: keeps the app usable offline (all user data lives in
// localStorage, so only the site's own files need caching).
// - Pages: network first, falling back to the cached copy.
// - Hashed build assets (/_next/static), icons and fonts: cache first.
// Bump VERSION when this file's caching logic changes.
const VERSION = "v1";
const PAGES = `m42-pages-${VERSION}`;
const ASSETS = `m42-assets-${VERSION}`;

// Keep in sync with the app's routes (components/nav.tsx and the legal pages).
const LOCALES = ["en", "de"];
const PATHS = ["", "/plan", "/log", "/progress", "/import", "/paces", "/settings", "/about", "/privacy", "/imprint"];
const PAGE_URLS = LOCALES.flatMap((l) => PATHS.map((p) => `/${l}${p}`));

/** Old builds leave hashed files behind; keep the cache bounded. */
const MAX_ASSETS = 600;
async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((k) => cache.delete(k)));
}

const isAsset = (url) =>
  url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(?:svg|png|ico|woff2?)$/.test(url.pathname) || url.pathname === "/manifest.webmanifest";

/** Caches a page and the build assets it references, so it renders offline. */
async function precachePage(url, pages, assets) {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) return;
  await pages.put(url, res.clone());
  const html = await res.text();
  const refs = new Set([...html.matchAll(/["'(](\/_next\/static\/[^"')\s]+)/g)].map((m) => m[1].replace(/\\u0026/g, "&")));
  await Promise.all([...refs].map((ref) => assets.match(ref).then((hit) => hit || assets.add(ref).catch(() => {}))));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const [pages, assets] = await Promise.all([caches.open(PAGES), caches.open(ASSETS)]);
      await Promise.all(PAGE_URLS.map((url) => precachePage(url, pages, assets).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES, ASSETS]);
      await Promise.all((await caches.keys()).filter((k) => k.startsWith("m42-") && !keep.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const pages = await caches.open(PAGES);
        try {
          const res = await fetch(request);
          const locale = new URL(res.url).pathname.match(/^\/(en|de)(\/|$)/)?.[1];
          if (res.ok && !res.redirected) pages.put(url.pathname, res.clone());
          // Remember the language, so "/" (the home-screen start URL) opens it offline too.
          if (res.ok && locale) pages.put("/__locale", new Response(locale));
          return res;
        } catch {
          const locale = (await (await pages.match("/__locale"))?.text()) || (self.navigator.language.startsWith("de") ? "de" : "en");
          const path = url.pathname === "/" ? `/${locale}` : url.pathname.replace(/\/$/, "");
          return (await pages.match(path)) || (await pages.match(`/${locale}`)) || Response.error();
        }
      })(),
    );
    return;
  }

  if (isAsset(url)) {
    event.respondWith(
      (async () => {
        const assets = await caches.open(ASSETS);
        const hit = await assets.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) assets.put(request, res.clone()).then(() => trim(assets));
        return res;
      })(),
    );
  }
});

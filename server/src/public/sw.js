// Minimal service worker: exists only to satisfy PWA installability
// criteria. It deliberately does no caching so the app never serves stale
// HTML/JS while it's under active development — every request just goes
// straight to the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

// Offline shell: the app files come from cache, the hackathon list from the
// network first so it is fresh, falling back to the last copy when offline.
const SHELL = 'hackathon-bud-v2';
const FILES = ['/', '/explore', 'landing.css', 'app.css', 'tokens.css', 'base.css', 'app.js', 'core/index.mjs', 'core/score.mjs', 'core/sources.mjs', 'icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  if (url.pathname.endsWith('/data/hackathons.json')) {
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(SHELL).then((c) => c.put('data/hackathons.json', copy)); return r; }).catch(() => caches.match('data/hackathons.json')));
    return;
  }
  // Network first for the app too, so edits show up; cache keeps it working offline.
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request)));
});

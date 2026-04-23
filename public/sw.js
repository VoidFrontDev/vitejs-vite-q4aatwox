// This is a minimal Service Worker to enable PWA installation
const CACHE_NAME = 'mtg-nexus-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // Just a pass-through to satisfy the browser's PWA requirement
  event.respondWith(fetch(event.request));
});
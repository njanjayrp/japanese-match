// Offline cache. Bump CACHE_NAME whenever you ship changed code or data —
// the old cache is dropped on activate, so the next load picks everything up.

const CACHE_NAME = 'japanese-match-v1';

const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './css/app.css',
    './js/romaji.js',
    './js/store.js',
    './js/audio.js',
    './js/furigana.js',
    './js/words.js',
    './js/kana-game.js',
    './js/strokes.js',
    './js/browse.js',
    './js/app.js',
    './data/kana.json',
    './data/words.json',
    './data/strokes.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;

    // words.json is the file you edit most, so always try the network first and
    // fall back to cache when offline. Everything else is cache-first.
    const isWords = new URL(e.request.url).pathname.endsWith('/data/words.json');

    if (isWords) {
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
                    return res;
                })
                .catch(() => caches.match(e.request))
        );
        return;
    }

    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});

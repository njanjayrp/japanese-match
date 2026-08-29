// Offline cache. Bump CACHE_NAME whenever you ship changed code or data —
// the old cache is dropped on activate, so the next load picks everything up.

const CACHE_NAME = 'japanese-match-v15';

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
    './js/cheat.js',
    './js/app.js',
    './data/kana.json',
    './data/words.json',
    './data/strokes.json',
    './data/sheets.json',
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

// index.html asks for assets with a ?v= cache-buster, but ASSETS stores them
// bare. Cache API matching is query-sensitive, so every lookup must ignore the
// search string or the whole cache misses and the app dies when offline.
const MATCH = { ignoreSearch: true };

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;

    // words.json and sheets.json are the files you edit by hand, so always try
    // the network first and fall back to cache when offline. The rest, including
    // the generated datasets, is cache-first.
    const path = new URL(e.request.url).pathname;
    const isHandEdited = path.endsWith('/data/words.json') ||
                         path.endsWith('/data/sheets.json');

    if (isHandEdited) {
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
                    return res;
                })
                .catch(() => caches.match(e.request, MATCH))
        );
        return;
    }

    e.respondWith(
        caches.match(e.request, MATCH).then(cached => cached || fetch(e.request))
    );
});

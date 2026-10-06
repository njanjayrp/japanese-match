// Offline cache.
//
// Code is network-first: index.html, the JS and the CSS are fetched fresh
// whenever the network answers, and the cache is only the offline fallback.
// Cache-first was making every change need a CACHE_NAME bump plus two reloads,
// and forgetting either one served a stale app that looked like a bug in the
// app rather than in the cache. The icons never change, so they stay
// cache-first — that's where offline speed actually comes from.
//
// strokes.json is generated, but it is regenerated every time a kanji is added,
// and a kanji with no stroke data is dropped from the picker without a word. So
// a stale copy of it doesn't look like a cache problem, it looks like the kanji
// were never added. It goes on the network-first list with the rest.

const CACHE_NAME = 'japanese-match-v32';

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
    './js/adjective-forms.js',
    './js/adj-game.js',
    './js/kana-game.js',
    './js/strokes.js',
    './js/browse.js',
    './js/cheat.js',
    './js/revise.js',
    './js/app.js',
    './data/kana.json',
    './data/words.json',
    './data/strokes.json',
    './data/sheets.json',
    './data/kanji.json',
    './data/revision.json',
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

    // Everything you edit by hand — the page, the code, the two data files you
    // type words into — comes off the network when there is one.
    const path = new URL(e.request.url).pathname;
    const isLive = path.endsWith('/') ||
                   path.endsWith('.html') ||
                   path.endsWith('.js') ||
                   path.endsWith('.css') ||
                   path.endsWith('/data/words.json') ||
                   path.endsWith('/data/strokes.json') ||
                   path.endsWith('/data/sheets.json') ||
                   path.endsWith('/data/kanji.json') ||
                   path.endsWith('/data/revision.json');

    if (isLive) {
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

const SHELL_CACHE = 'hp-reader-shell-v3';
const AUDIO_CACHE = 'hp-reader-audio-v1';
const RUNTIME_CACHE = 'hp-reader-runtime-v1';
const ACTIVE_CACHES = new Set([SHELL_CACHE, AUDIO_CACHE, RUNTIME_CACHE]);

const SHELL_ASSETS = [
  './',
  './index.html',
  './reader.css?v=11',
  './chapter.js?v=4',
  './chapter2.js?v=1',
  './word-audio.js?v=4',
  './sentence-parts.js?v=7',
  './sentence-parts2.js?v=1',
  './reader.js?v=10',
  './notes_speech.js?v=11',
  './config.js',
  './pwa-install.js?v=2',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
];

const inFlightAudio = new Set();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('hp-reader-') && !ACTIVE_CACHES.has(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function buildRangeResponse(cachedResponse, rangeHeader) {
  return cachedResponse.arrayBuffer().then((buffer) => {
    const total = buffer.byteLength;
    const match = /bytes=(\d*)-(\d*)/i.exec(rangeHeader || '');
    if (!match) {
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': cachedResponse.headers.get('Content-Type') || 'audio/mpeg',
          'Content-Length': String(total),
          'Accept-Ranges': 'bytes',
        },
      });
    }

    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : total - 1;

    if (!match[1] && match[2]) {
      const suffixLength = Number(match[2]);
      start = Math.max(0, total - suffixLength);
      end = total - 1;
    }

    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start >= total || end < start) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${total}` },
      });
    }

    end = Math.min(end, total - 1);
    const sliced = buffer.slice(start, end + 1);
    return new Response(sliced, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Type': cachedResponse.headers.get('Content-Type') || 'audio/mpeg',
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Length': String(sliced.byteLength),
        'Accept-Ranges': 'bytes',
      },
    });
  });
}

function cacheAudioInBackground(cleanUrl) {
  if (inFlightAudio.has(cleanUrl)) return Promise.resolve();
  inFlightAudio.add(cleanUrl);
  return fetch(cleanUrl)
    .then((response) => {
      if (response.ok && response.status === 200) {
        return caches.open(AUDIO_CACHE).then((cache) => cache.put(cleanUrl, response));
      }
      return undefined;
    })
    .catch(() => undefined)
    .finally(() => {
      inFlightAudio.delete(cleanUrl);
    });
}

function handleAudioRequest(event, cleanUrl) {
  const rangeHeader = event.request.headers.get('range');
  return caches.open(AUDIO_CACHE).then((cache) =>
    cache.match(cleanUrl).then((cached) => {
      if (cached) {
        return rangeHeader ? buildRangeResponse(cached, rangeHeader) : cached;
      }
      event.waitUntil(cacheAudioInBackground(cleanUrl));
      return fetch(event.request);
    })
  );
}

function handleNavigate(request) {
  return caches.open(SHELL_CACHE).then((cache) =>
    cache.match('./index.html').then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok && response.status === 200) {
            cache.put('./index.html', response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
}

function handleStaticAsset(request) {
  return caches.match(request).then((cached) => {
    const networkFetch = fetch(request)
      .then((response) => {
        if (response.ok && response.status === 200) {
          const targetCache = SHELL_CACHE;
          caches.open(targetCache).then((shell) =>
            shell.match(request).then((inShell) => {
              if (inShell) {
                shell.put(request, response.clone());
              } else {
                caches.open(RUNTIME_CACHE).then((runtime) => runtime.put(request, response.clone()));
              }
            })
          );
        }
        return response;
      })
      .catch(() => cached);
    return cached || networkFetch;
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (
    url.pathname.includes('/speech_assets/') ||
    url.pathname.includes('/models/') ||
    url.pathname.includes('/speech_option1/')
  ) {
    return;
  }

  if (url.pathname.includes('/audio/')) {
    const cleanUrl = url.origin + url.pathname;
    event.respondWith(handleAudioRequest(event, cleanUrl));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(request));
    return;
  }

  if (request.headers.has('range')) return;

  event.respondWith(handleStaticAsset(request));
});

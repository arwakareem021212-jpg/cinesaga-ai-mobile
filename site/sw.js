const ROOT = new URL('./', self.location.href);
const CACHE_PREFIX = 'cinesaga-shell-' + encodeURIComponent(ROOT.pathname) + '-';
const CACHE_NAME = CACHE_PREFIX + 'v8-static-5cd204b34ff8b993';
// Only the separately prepared static release sets this true. Desktop API semantics remain unchanged.
const STATIC_RELEASE = true;
const APP_SHELL = [
  'static-pwa.js','static-policy.js',
  'icon-192.png', 'icon-512.png',
  'mobile-support.js',
  'chatgpt-bridge.js','chatgpt-bridge-contract.js','chatgpt-bridge-parser.js','chatgpt-bridge-ui.js','chatgpt-bridge-i18n.js',
  'director-contract.js','director-i18n.js','story-director.js','story-director-ui.js',
  'director-client.js','director-result.js','director-safety.js',
  'media-workflow.js','media-ui.js','media-source-ui.js','media-mp4.js','media-export-ui.js',
  'scene-consistency.js','scene-consistency-ui.js',
  'agent-contract.js','story-agent.js','story-agent-ui.js',
  './', 'index.html', 'app.js', 'i18n.js', 'styles.css', 'model.js', 'manual-story.js', 'manual-story-i18n.js',
  'manual-work-contract.js', 'manual-work.js', 'manual-work-i18n.js', 'manual-work-ui.js',
  'db.js', 'providers.js', 'identity.js', 'identity-ui.js', 'identity-i18n.js', 'identity.css', 'story.js', 'story-contract.js', 'story-demo.js', 'story-generation.js', 'generation-contract.js', 'story-ui.js', 'story-i18n.js', 'story-continuity.js', 'continuity-i18n.js', 'story.css', 'icons.svg', 'manifest.webmanifest'
].map(path => new URL(path, ROOT).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // API traffic never reads CacheStorage, falls back to HTML, or enters the HTTP cache.
  // Check before method/scope handling so POST and /api outside a nested PWA root are covered.
  const appAPI = new URL('api', ROOT).pathname;
  if (url.origin === ROOT.origin && (url.pathname === '/api' || url.pathname.startsWith('/api/') || url.pathname === appAPI || url.pathname.startsWith(appAPI + '/'))) {
    if (STATIC_RELEASE) {
      event.respondWith(Promise.resolve(new Response('{"error":"NOT_CONFIGURED","status":"NOT_CONFIGURED","paidAuthorization":0}', {status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})));
      return;
    }
    event.respondWith(fetch(event.request, {cache:'no-store', redirect:'error'}));
    return;
  }
  if (event.request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  if (url.pathname.includes('/tests/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Public static assets can start immediately without waiting for a dead/slow host.
    if (APP_SHELL.includes(url.origin + url.pathname) && event.request.mode !== 'navigate') {
      const stored = await cache.match(url.origin + url.pathname);
      if (stored) return stored;
    }
    try {
      const response = await fetch(event.request);
      if (response.ok && APP_SHELL.includes(url.origin + url.pathname)) {
        await cache.put(url.origin + url.pathname, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(url.origin + url.pathname);
      if (cached) return cached;
      if (event.request.mode === 'navigate') return cache.match(new URL('index.html', ROOT).href);
      throw error;
    }
  })());
});

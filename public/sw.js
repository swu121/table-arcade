// The tablet's safety net, and the thing that makes Chrome treat this as an
// installed app rather than a bookmark.
//
// The rules are shaped around one fact: the server is the truth, and a tablet
// showing a stale room is worse than a tablet showing nothing. So nothing live
// is ever served from here — the socket and every API call go straight to the
// network, and a page load prefers the network too. The cache exists for the
// one case it is good at: the wifi drops, someone reloads, and without it the
// tablet would sit on a browser error page for the rest of the shift.

// Registered as /sw.js?v=<build>, so a deploy changes this script's URL and the
// browser installs the new one instead of reusing the old bytes.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const CACHE = `table-arcade-${VERSION}`

// Vite hashes these into their filenames, so a given URL's contents never
// change and cache-first is always right. Fonts and icons are static too.
const IMMUTABLE = /\.(?:js|css|woff2?|png|svg|ico|jpg|jpeg|webp)$/

// Live, every time, no exceptions.
const ALWAYS_NETWORK = ['/api/', '/socket.io/', '/healthz', '/sw.js']

// The very first page load happens before this worker exists, so nothing has
// been through the fetch handler yet. Without a copy of the shell taken here,
// the first reload after a wifi drop would still be the browser's error page.
const SHELL = '/index.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE)
        await cache.add(SHELL)
      } catch {
        // Installed while offline. The worker is still worth having.
      }
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (ALWAYS_NETWORK.some((prefix) => url.pathname.startsWith(prefix))) return

  // A page load. The network decides what the tablet runs, so that a deploy is
  // picked up and the version handshake never argues with a cached page. The
  // cache only answers when the network cannot.
  if (request.mode === 'navigate') return event.respondWith(networkFirst(request))

  if (IMMUTABLE.test(url.pathname)) event.respondWith(cacheFirst(request))
})

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (error) {
    const cached =
      (await cache.match(request)) ||
      (await cache.match(request, { ignoreSearch: true })) ||
      // Every venue's address renders from the same shell; which venue it is
      // comes from the URL, which a reload keeps.
      (await cache.match(SHELL))
    if (cached) return cached
    throw error
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

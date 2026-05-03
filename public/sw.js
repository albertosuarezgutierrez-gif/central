// ia.rest · Service Worker v2
// Cache /edge assets + push notifications para el camarero

const CACHE = 'iarest-edge-v2'
const OFFLINE_URL = '/offline.html'

// Assets críticos del camarero
const PRECACHE = [
  '/',
  '/edge',
  '/login',
  '/offline.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
]

// ── INSTALL ──────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

// ── ACTIVATE ──────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// ── FETCH ──────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  // API calls y Supabase: network-first, sin fallback (no cachear comandas)
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) return

  // Fuentes y assets externos: stale-while-revalidate
  if (url.hostname !== self.location.hostname) {
    e.respondWith(
      caches.match(request).then(cached =>
        cached || fetch(request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(request, res.clone()))
          return res
        })
      )
    )
    return
  }

  // Páginas de la app: network-first, fallback a cache, luego offline
  e.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(request, res.clone()))
        return res
      })
      .catch(async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        if (request.headers.get('accept')?.includes('text/html')) {
          return caches.match(OFFLINE_URL)
        }
        return new Response('', { status: 408 })
      })
  )
})

// ── PUSH ──────────────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return
  let payload
  try { payload = e.data.json() } catch { payload = { title: 'ia.rest', body: e.data.text() } }

  const { title = 'ia.rest', body = '', mesa = '', tag = 'iarest-push', data = {} } = payload

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      data,
      actions: [{ action: 'open', title: 'Ver' }],
      requireInteraction: true,
    })
  )
})

// ── NOTIFICATION CLICK ──────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url || '/edge'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const edge = clients.find(c => c.url.includes('/edge'))
      if (edge) return edge.focus()
      return self.clients.openWindow(url)
    })
  )
})

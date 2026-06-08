// ia.rest · Service Worker v7
// Estrategia: HTML siempre network, _next/static cache-first (immutable), push

const STATIC_CACHE = 'iarest-static-v7'
const OFFLINE_URL = '/offline.html'

// Solo pre-cachear assets estáticos que no cambian entre deploys
const PRECACHE_STATIC = [
  '/offline.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
]

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(c => c.addAll(PRECACHE_STATIC))
      .then(() => self.skipWaiting())  // activar inmediatamente sin esperar cierre de tabs
  )
})

// ── ACTIVATE: limpiar caches viejos ──────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== STATIC_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

// ── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // 1. API y Supabase: siempre network, nunca cache
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) return

  // 2. Assets estáticos Next.js (_next/static): cache-first (son immutables por hash)
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(STATIC_CACHE).then(c => c.put(request, clone))
          }
          return res
        })
      })
    )
    return
  }

  // 3. Fuentes, iconos y assets externos: stale-while-revalidate
  if (url.hostname !== self.location.hostname) {
    e.respondWith(
      caches.match(request).then(cached => {
        const fetchPromise = fetch(request).then(res => {
          if (res.ok) caches.open(STATIC_CACHE).then(c => c.put(request, res.clone()))
          return res
        })
        return cached || fetchPromise
      })
    )
    return
  }

  // 4. Páginas HTML (/, /edge, /login, /kds, /owner...): SIEMPRE network
  //    Nunca servir HTML desde cache — garantiza que los deploys se ven inmediatamente
  //    Solo fallback a offline si no hay red en absoluto
  e.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then(res => res)
      .catch(async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        if (request.headers.get('accept')?.includes('text/html')) {
          return caches.match(OFFLINE_URL) ?? new Response('Offline', { status: 503 })
        }
        return new Response('', { status: 408 })
      })
  )
})

// ── MESSAGE: forzar activación desde useServiceWorkerUpdate ─
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

// ── PUSH ─────────────────────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return
  let payload
  try { payload = e.data.json() } catch { payload = { title: 'ia.rest', body: e.data.text() } }

  const { title = 'ia.rest', body = '', tag = 'iarest-push', data = {} } = payload

  e.waitUntil(
    self.registration.showNotification(title, {
      body, tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      data,
      actions: [{ action: 'open', title: 'Ver' }],
      requireInteraction: true,
    })
  )
})

// ── NOTIFICATION CLICK ────────────────────────────────────────
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

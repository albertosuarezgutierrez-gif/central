// SIVRA Service Worker v1.2
const CACHE = 'sivra-v1'
const STATIC = ['/dashboard', '/mensajes', '/login', '/manifest.json']

// ── Install ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  )
})

// ── Activate ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// ── Fetch: network-first, cache fallback ──
self.addEventListener('fetch', e => {
  // Skip non-GET and API calls
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.pathname.startsWith('/api/')) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
      .catch(() => caches.match(e.request).then(r => r || new Response('Offline', { status: 503 })))
  )
})

// ── Push notification ──
self.addEventListener('push', e => {
  let data = { title: 'SIVRA', body: 'Nuevo mensaje de huésped', badge: 1, url: '/mensajes' }
  try { data = { ...data, ...e.data?.json() } } catch {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'sivra-msg',
      renotify: true,
      requireInteraction: false,
      silent: false,
      data: { url: data.url || '/mensajes' },
      actions: [
        { action: 'open',   title: '📩 Ver mensaje' },
        { action: 'close',  title: 'Cerrar' },
      ]
    })
  )
})

// ── Notification click ──
self.addEventListener('notificationclick', e => {
  e.notification.close()
  if (e.action === 'close') return
  const url = e.notification.data?.url || '/mensajes'
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin)) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      return clients.openWindow(url)
    })
  )
})

// ── Message from app (manual notify) ──
self.addEventListener('message', e => {
  if (e.data?.type === 'NOTIFY') {
    self.registration.showNotification(e.data.title || 'SIVRA', {
      body: e.data.body || 'Nuevo mensaje urgente',
      icon: '/icons/icon-192.png',
      tag: 'sivra-msg',
      renotify: true,
      data: { url: e.data.url || '/mensajes' }
    })
  }
})

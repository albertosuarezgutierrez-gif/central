// Service worker de rrhh: PWA básica + manejador de push (listo para cuando haya VAPID).
const CACHE = 'rrhh-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// Red primero para HTML/API; el resto pasa directo (sin cachear datos sensibles).
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
})

// Push: muestra la notificación enviada por el backend (cuando se active VAPID).
self.addEventListener('push', (e) => {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch { data = { title: 'RR.HH.', body: e.data && e.data.text() } }
  const title = data.title || 'RR.HH.'
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || '', icon: '/icon.svg', badge: '/icon.svg', data: { url: data.url || '/' },
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => {
    for (const c of cs) { if (c.url.includes(url) && 'focus' in c) return c.focus() }
    return self.clients.openWindow(url)
  }))
})

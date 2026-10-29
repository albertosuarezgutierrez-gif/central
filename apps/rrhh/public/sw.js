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
    body: data.body || '', icon: '/brand/icono-asegura-192.png', badge: '/brand/icono-asegura-192.png', data: { url: data.url || '/' },
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const crudo = (e.notification.data && e.notification.data.url) || '/'
  let destino
  try {
    destino = new URL(crudo, self.location.origin)
    if (destino.origin !== self.location.origin) destino = new URL('/', self.location.origin)
  } catch {
    destino = new URL('/', self.location.origin)
  }
  const href = destino.href
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (lista) => {
      for (const c of lista) {
        if (!('focus' in c)) continue
        try {
          const nav = 'navigate' in c ? await c.navigate(href) : null
          return await (nav || c).focus()
        } catch {
          // navigate rechaza con ventanas no controladas (PWA instalada / iOS): se abre una nueva
        }
      }
      return self.clients.openWindow(href)
    }),
  )
})

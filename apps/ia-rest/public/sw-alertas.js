// public/sw-alertas.js
// Service Worker para push notifications cuando la app está cerrada/background

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = { title: 'ia.rest', body: event.data?.text() ?? 'Nueva alerta' }
  }

  const title  = data.title  ?? 'ia.rest · Alerta'
  const body   = data.body   ?? 'Tienes una nueva alerta'
  const msgVoz = data.mensaje_voz ?? body

  const options = {
    body,
    icon:    '/icon-192.png',
    badge:   '/icon-72.png',
    tag:     'ia-rest-alerta',
    renotify: true,
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: false,
    data: { mensaje_voz: msgVoz, url: '/edge' },
    actions: [{ action: 'ok', title: '✓ Visto' }],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'ok') return

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const edge = clients.find(c => c.url.includes('/edge'))
      if (edge) {
        edge.focus()
        edge.postMessage({ type: 'ALERTA_VOZ', mensaje: event.notification.data?.mensaje_voz })
      } else {
        self.clients.openWindow('/edge')
      }
    })
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

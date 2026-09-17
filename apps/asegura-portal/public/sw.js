// Service worker del PORTAL DEL CLIENTE.
//
// 🚨 NO CACHEA NADA, Y ESO ES LA DECISIÓN, no una versión sin terminar.
// Aquí dentro hay pólizas, recibos y partes de siniestro de personas
// identificadas: una respuesta guardada en el almacén del navegador sobrevive al cierre de
// sesión y se queda en el móvil —o en el ordenador compartido— de quien sea,
// legible sin volver a pasar por la cookie. El SW existe solo porque Chrome
// exige uno con manejador de `fetch` para ofrecer instalar la app; lo que hace
// con la petición es dejarla pasar tal cual, a la red.
//
// ⚠️ Si alguien añade aquí una caché «para que vaya más rápido», está
// publicando datos personales en el disco del visitante. Lo vigila
// `lib/pwa.test.ts`.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// El manejador que pide Chrome. Sin `respondWith`, la petición sigue su curso
// normal por la red: ni se intercepta ni se guarda.
self.addEventListener('fetch', () => {})

// Avisos de vencimiento (12/09/2026). El PAYLOAD del push (título/cuerpo) NO se guarda en ningún
// sitio: se lee una vez, se pinta la notificación y se olvida — no es una caché, es memoria de un
// solo uso mientras dura el evento.
self.addEventListener('push', (e) => {
  let datos = {}
  try {
    datos = e.data ? e.data.json() : {}
  } catch {
    datos = {}
  }
  const titulo = datos.title || 'Grupo ASegura'
  e.waitUntil(
    self.registration.showNotification(titulo, {
      body: datos.body || '',
      icon: '/icono-app',
      badge: '/icono-app',
      data: datos.data || {},
    }),
  )
})

// Al tocar la notificación, ir a la bóveda (o a la URL que traiga el push) reusando una pestaña
// abierta si ya la hay, en vez de abrir una nueva encima.
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const destino = (e.notification.data && e.notification.data.url) || '/boveda'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const c of lista) if ('focus' in c) return c.navigate(destino).then(() => c.focus())
      return self.clients.openWindow(destino)
    }),
  )
})

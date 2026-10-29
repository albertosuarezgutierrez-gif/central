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
  const extra = datos.data || {}
  const opciones = {
    body: datos.body || '',
    icon: '/icono-app',
    badge: '/icono-app',
    data: extra,
  }
  // Una notificación por póliza: la nueva sustituye a la anterior con la misma etiqueta y vuelve a sonar.
  if (typeof extra.tag === 'string' && extra.tag) {
    opciones.tag = extra.tag
    opciones.renotify = true
  }
  if (Array.isArray(extra.acciones)) {
    opciones.actions = extra.acciones.slice(0, 2).map((a) => ({ action: String(a.action), title: String(a.title) }))
  }
  e.waitUntil(
    self.registration.showNotification(titulo, opciones),
  )
})

// Al tocar la notificación, ir a la ficha (o a la URL que traiga el push) reusando una pestaña
// abierta si ya la hay. `navigate` RECHAZA con ventanas no controladas (PWA instalada, iOS): sin
// el respaldo, la app se quedaba en la pantalla en la que estaba (29/10/2026).
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const datos = e.notification.data || {}
  // Botón pulsado: su url (en `data.acciones`); sin botón (o desconocido), la url general.
  const accion = e.action && Array.isArray(datos.acciones) ? datos.acciones.find((a) => a && a.action === e.action) : null
  const crudo = (accion && accion.url) || datos.url || '/boveda'
  let destino
  try {
    destino = new URL(crudo, self.location.origin)
    if (destino.origin !== self.location.origin) destino = new URL('/boveda', self.location.origin)
  } catch {
    destino = new URL('/boveda', self.location.origin)
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
          // sin permiso para navegar esa ventana: se abre una nueva en el destino
        }
      }
      return self.clients.openWindow(href)
    }),
  )
})

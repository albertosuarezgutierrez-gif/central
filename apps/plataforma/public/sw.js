// Service worker de la intranet (24/09/2026).
//
// 🚨 NO CACHEA NADA, y esa es la decisión (la misma que el del portal del cliente). Aquí hay saldos,
// movimientos del banco y datos de clientes de la correduría: una respuesta guardada en el almacén
// del navegador sobrevive al cierre de sesión y se queda legible en el móvil —o en el ordenador
// compartido— sin volver a pasar por la cookie. El SW existe solo porque Chrome exige uno con
// manejador de `fetch` para ofrecer instalar la app.
//
// ⚠️ Si alguien añade aquí una caché «para que vaya más rápido», está guardando datos financieros
// en el disco del dispositivo. Lo vigila `lib/pwa.test.ts`.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// El manejador que pide Chrome. Sin `respondWith`, la petición sigue su curso normal por la red.
self.addEventListener('fetch', () => {})

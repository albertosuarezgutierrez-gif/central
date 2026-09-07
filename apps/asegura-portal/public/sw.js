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

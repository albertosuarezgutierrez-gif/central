// apps/plataforma/lib/sivra/cors-publico.ts
//
// Cabeceras CORS del endpoint público de disponibilidad (el que alimenta el calendario
// de la landing de House Sevillana).
//
// 🚨 Por qué esto es un módulo aparte y testeado, y por qué `Vary: Origin` va SIEMPRE:
//
// La respuesta se cachea en el CDN de Vercel (`s-maxage=600`) y sus cabeceras dependen del
// `Origin` de quien pregunta. Si `Vary: Origin` solo se emite cuando el origen está permitido,
// **la primera petición decide las cabeceras de todas las demás durante 10 minutos**: basta
// con que la primera venga sin `Origin` —un curl, un health-check, un bot— para que el CDN
// guarde una copia SIN `Access-Control-Allow-Origin` y se la sirva luego al navegador, que la
// rechaza. La landing lo interpreta como «no se pudo consultar» y enseña el aviso de error.
//
// Pasó de verdad el 20/08/2026, y lo provocó la propia comprobación de que el endpoint
// funcionaba: `curl` sin `Origin` llenó la caché, y a partir de ahí housesevillana.es no volvió
// a ver la cabecera. El endpoint respondía 200 impecable desde el servidor y estaba roto en el
// navegador — la lección es que un 200 por curl NO prueba que un recurso con CORS funcione.
//
// Con `Vary: Origin` en todas las respuestas, el CDN guarda una copia por origen y cada uno
// recibe la suya.

/** Orígenes que pueden leer esto desde un navegador. */
export const ORIGENES_EXACTOS = ['https://housesevillana.es', 'https://www.housesevillana.es']

// Los previews de Vercel llevan un hash por despliegue, así que no se pueden listar. El ancla
// de los dos extremos no es decorativa: sin el `$`, `…vercel.app.de-otro.com` pasaría.
export const ORIGEN_PREVIEW = /^https:\/\/house-sevillana-landing-[a-z0-9-]+\.vercel\.app$/

/**
 * Cabeceras CORS para este origen.
 *
 * Se devuelve el origen LITERAL y no la lista: `Access-Control-Allow-Origin` no admite
 * comodines parciales ni varios valores. Sin `Origin` (una llamada de servidor, o curl) no se
 * pone esa cabecera y se sirve igual: CORS protege al navegador de OTRAS webs, no a este
 * endpoint, que es público a propósito.
 *
 * `Vary: Origin` va en TODOS los casos —permitido, no permitido y sin `Origin`— porque es lo
 * que le dice al CDN que no puede reutilizar una copia entre orígenes distintos.
 */
export function cabecerasCors(origen: string | null): Record<string, string> {
  const base: Record<string, string> = { Vary: 'Origin' }
  if (!origen) return base
  const permitido = ORIGENES_EXACTOS.includes(origen) || ORIGEN_PREVIEW.test(origen)
  return permitido ? { ...base, 'Access-Control-Allow-Origin': origen } : base
}

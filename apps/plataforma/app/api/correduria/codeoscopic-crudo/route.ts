import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { catalogoCrudoAsegura } from '@/lib/retarificar-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * `GET /api/correduria/codeoscopic-crudo?marcaId=&modeloId=&motor=` — qué manda
 * DE VERDAD el catálogo de versiones de Codeoscopic, antes de que asegura lo
 * recorte a `id` + `nombre`.
 *
 * ─── Por qué hay una ruta para esto ─────────────────────────────────────────
 * La pregunta era medible y llevaba meses contestándose de memoria: ¿trae cada
 * versión sus años de fabricación? Si los trae, la fecha de matriculación —que
 * sale gratis de la matrícula— puede ordenar o acotar un desplegable que hoy
 * tiene decenas de versiones indistinguibles («4X4 DC LE AUTO»). El nombre no
 * los lleva; si están, están en un campo que se descarta.
 *
 * El catálogo solo se puede pedir con `ASEGURA_OPERADOR_SECRET`, que abre la
 * cartera entera. Esta ruta existe para que ese secreto **no salga de Vercel**:
 * se abre una URL con la sesión de plataforma y el secreto lo pone el servidor,
 * como en el resto del puerto.
 *
 * 🚨 **No gasta NADA** (0,00€): es el mismo `GET` de catálogo que ya pinta los
 * desplegables, y al otro lado se resuelve con el interruptor de tarificación
 * apagado. Lo que cambia es solo qué se tira por el camino.
 */
export async function GET(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta

  const q = new URL(req.url).searchParams
  const marcaId = q.get('marcaId')
  const modeloId = q.get('modeloId')
  const motor = q.get('motor')
  if (!marcaId || !modeloId || !motor) {
    // Se dice QUÉ falta. Sin los tres el vendor responde 400 y quien mire no
    // sabría si el catálogo está vacío o si faltaba un parámetro.
    return NextResponse.json(
      {
        estado: 'error',
        motivo: 'faltan_parametros',
        mensaje:
          'faltan marcaId, modeloId y motor. Los tres salen de los desplegables: ' +
          '/api/correduria/codeoscopic-crudo?marcaId=…&modeloId=…&motor=…',
      },
      { status: 400 },
    )
  }

  const r = await catalogoCrudoAsegura({ tipo: 'versiones', marcaId, modeloId, motor })

  // 🚨 LA GUARDA QUE HACE QUE ESTO SIRVA DE ALGO. Una asegura desplegada SIN
  // este cambio no entiende `crudo=1`: lo ignora y devuelve 200 `estado:'ok'`
  // con la lista NORMALIZADA (`id` + `nombre` y nada más). Relayada tal cual,
  // esa respuesta se leería como «he mirado el crudo y el vendor no manda nada
  // más» — la conclusión falsa exacta que esta ruta existe para no tener que
  // sacar. Y no es hipotético: los dos proyectos de Vercel se despliegan por
  // separado, así que plataforma puede ir por delante de asegura durante un
  // rato. Sin `resumen`, no es una medición.
  const json = r.json
  if (r.status === 200 && !(typeof json === 'object' && json !== null && 'resumen' in json)) {
    return NextResponse.json(
      {
        estado: 'error',
        motivo: 'asegura_sin_crudo',
        mensaje:
          'asegura respondió 200 pero sin `resumen`: su despliegue todavía no entiende `crudo=1`. ' +
          'Lo que ha devuelto es el catálogo NORMALIZADO, así que NO dice nada sobre lo que manda ' +
          'el vendor. Espera al despliegue de central-asegura y repite.',
        respuesta: json,
      },
      { status: 502 },
    )
  }

  // El 401/403 del PUERTO no puede salir con la misma forma que el 401 de «no
  // tienes sesión» de `exigirCorreduria`: son dos arreglos distintos (rotar el
  // secreto compartido vs. volver a entrar) y ya se han confundido antes.
  if (r.status === 401 || r.status === 403) {
    return NextResponse.json(
      {
        estado: 'error',
        motivo: 'secreto_rechazado',
        mensaje:
          'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos). ' +
          'Tu sesión de plataforma está bien: el problema está entre las dos apps.',
      },
      { status: 502 },
    )
  }

  return NextResponse.json(json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

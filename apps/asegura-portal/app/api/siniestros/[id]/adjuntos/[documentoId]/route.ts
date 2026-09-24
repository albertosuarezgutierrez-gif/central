import { NextResponse } from 'next/server'

import { leerAdjunto } from '@/lib/adjuntos-parte'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string; documentoId: string }> }

/**
 * Devuelve un fichero que el propio cliente adjuntó a su parte.
 *
 * 🚨 SIEMPRE como DESCARGA (`Content-Disposition: attachment`) y con un mime de
 * la lista cerrada, nunca con el que mandó el navegador al subirlo. Servir
 * bytes de origen externo con un `Content-Type` que el navegador ejecute —un
 * `text/html`, un `image/svg+xml`— es un XSS en nuestro propio dominio, con la
 * cookie de sesión del que lo abra. `leerAdjunto()` no devuelve nada si el mime
 * guardado no está en `MIMES_DOCUMENTO`.
 *
 * 🚫 Un tercero con autorización no llega aquí: se entra por el PARTE, y el
 * parte es de quien lo escribió. `camposDeAlcance` deja `documentos: false` para
 * toda persona física, y esta ruta ni siquiera ofrece un camino que parta de un
 * `clienteId` o de un `polizaId`.
 */
export async function GET(_req: Request, ctx: Ctx) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const { id, documentoId } = await ctx.params
  const d = await leerAdjunto(identidad.id, id, documentoId)
  // «No existe», «no es tuyo» y «no se puede servir» se responden IGUAL: separar
  // los casos diría qué uuids existen en la base.
  if (!d) return NextResponse.json({ error: 'no_encontrado' }, { status: 404 })

  // El nombre va dos veces: en ASCII plano para los clientes viejos y en UTF-8
  // codificado para el resto. Las comillas y los caracteres de control se
  // quitan: en esta cabecera son inyección, no acentos.
  const ascii = d.nombre.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '')
  return new Response(new Uint8Array(d.contenido), {
    headers: {
      'content-type': d.mime,
      'content-length': String(d.contenido.length),
      'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.nombre)}`,
      // Nunca en una caché compartida: es un documento personal.
      'cache-control': 'private, no-store',
      // Cinturón sobre tirantes: aunque el mime venga de la lista, el navegador
      // no debe adivinar otro leyendo los primeros bytes.
      'x-content-type-options': 'nosniff',
    },
  })
}

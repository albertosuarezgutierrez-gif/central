import { leerDocumentoPoliza } from '@/lib/documentos-poliza'
import { requireIdentidad } from '@/lib/session'
import { descargaNoEncontrada, descargaSinSesion } from '@/lib/respuesta-descarga'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string; documentoId: string }> }

/**
 * Descarga un documento ORIGINAL de la compañía de una póliza propia (`lib/documentos-poliza.ts`).
 * Mismas cabeceras que los adjuntos del parte: SIEMPRE descarga, mime de la lista cerrada, sin caché
 * compartida y `nosniff`. «No existe», «no es tuyo» y «no se puede servir» se responden igual (404).
 */
export async function GET(req: Request, ctx: Ctx) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return descargaSinSesion(req, { error: 'sin_sesion' })
  }

  const { id, documentoId } = await ctx.params
  const d = await leerDocumentoPoliza(identidad.id, id, documentoId)
  if (!d) return descargaNoEncontrada(req, { error: 'no_encontrado' })

  const ascii = d.nombre.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '')
  return new Response(new Uint8Array(d.contenido), {
    headers: {
      'content-type': d.mime,
      'content-length': String(d.contenido.length),
      'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.nombre)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

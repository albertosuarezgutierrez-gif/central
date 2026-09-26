import { NextResponse } from 'next/server'

import { leerDocumentoPoliza } from '@/lib/documentos-poliza'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string; documentoId: string }> }

/**
 * Descarga un documento ORIGINAL de la compañía de una póliza propia (`lib/documentos-poliza.ts`).
 * Mismas cabeceras que los adjuntos del parte: SIEMPRE descarga, mime de la lista cerrada, sin caché
 * compartida y `nosniff`. «No existe», «no es tuyo» y «no se puede servir» se responden igual (404).
 */
export async function GET(_req: Request, ctx: Ctx) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const { id, documentoId } = await ctx.params
  const d = await leerDocumentoPoliza(identidad.id, id, documentoId)
  if (!d) return NextResponse.json({ error: 'no_encontrado' }, { status: 404 })

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

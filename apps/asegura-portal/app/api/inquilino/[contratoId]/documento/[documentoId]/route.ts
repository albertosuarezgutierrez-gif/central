import { NextResponse } from 'next/server'

import { responderDescarga } from '@/lib/inquilino/inquilino-api'
import { puertosInquilino } from '@/lib/inquilino/inquilino-bd'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function disposicion(nombre: string): string {
  const ascii = nombre.replace(/[^\x20-\x7e]/g, '_').replace(/[\\"%]/g, '_') || 'documento'
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
}

/**
 * `GET /api/inquilino/<contrato>/documento/<id>` — DESCARGA de un recibo que el propietario ha compartido con este inquilino, o de
 * un justificante que subió él. Vuelve a comprobar el acceso; siempre `attachment`, MIME de la lista cerrada, `nosniff`, sin caché.
 * Ajeno, no compartido, retirado o borrado: la misma 404.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ contratoId: string; documentoId: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`inquilino-descarga:${identidad.id}`, 300, 60 * 60 * 1000)
  if (!tope.allowed) return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429 })
  const { contratoId, documentoId } = await ctx.params
  const r = await responderDescarga(puertosInquilino(identidad.id), contratoId, documentoId)
  if (!('fichero' in r)) return NextResponse.json(r.body, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
  return new NextResponse(new Uint8Array(r.fichero.contenido), {
    status: 200,
    headers: {
      'content-type': r.fichero.mime,
      'content-disposition': disposicion(r.fichero.nombre),
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    },
  })
}

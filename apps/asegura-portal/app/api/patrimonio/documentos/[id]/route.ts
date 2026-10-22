import { NextResponse } from 'next/server'

import { nombreConExtension, responderBorrarDocumento, responderDescargaDocumento } from '@/lib/patrimonio/documentos-api'
import { puertosDocumentos } from '@/lib/patrimonio/documentos-bd'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VENTANA_MS = 60 * 60 * 1000

/** Nombre para la cabecera: ASCII de relleno + `filename*` UTF-8 (RFC 5987). `nombreSeguro` ya quitó comillas y control. */
function disposicion(nombre: string): string {
  const ascii = nombre.replace(/[^\x20-\x7e]/g, '_').replace(/[\\"%]/g, '_') || 'documento'
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
}

/**
 * `GET /api/patrimonio/documentos/<id>?titular=<ficha>` — DESCARGA. Nunca una URL pública: vuelve a comprobar acceso y rol, y
 * responde siempre `attachment` con un MIME de la lista cerrada (PDF/JPG/PNG/WebP), `nosniff` y sin caché.
 * `DELETE` (mismo `?titular=`) = borrado LÓGICO (sella `borrado_en`). Ajeno, inexistente o borrado: 404.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`patrimonio-documento-descarga:${identidad.id}`, 600, VENTANA_MS)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id } = await ctx.params
  const r = await responderDescargaDocumento(puertosDocumentos(identidad.id), { titular: new URL(req.url).searchParams.get('titular'), documento: id })
  if (!('fichero' in r)) return NextResponse.json(r.body, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
  return new NextResponse(new Uint8Array(r.fichero.contenido), {
    status: 200,
    headers: {
      'content-type': r.fichero.mime,
      'content-length': String(r.fichero.contenido.length),
      // La extensión la impone el tipo REAL: un PDF subido como «x.html» (cabecera `%PDF-` tras basura) se guarda «x.html.pdf».
      'content-disposition': disposicion(nombreConExtension(r.fichero.nombre, r.fichero.mime)),
      'x-content-type-options': 'nosniff',
      // Si un navegador lo abriera igualmente en una pestaña, sin scripts ni origen.
      'content-security-policy': "sandbox; default-src 'none'",
      'cache-control': 'private, no-store',
    },
  })
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`patrimonio-documento-borrar:${identidad.id}`, 120, VENTANA_MS)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id } = await ctx.params
  const r = await responderBorrarDocumento(puertosDocumentos(identidad.id), { titular: new URL(req.url).searchParams.get('titular'), documento: id })
  return NextResponse.json(r.body, { status: r.status })
}

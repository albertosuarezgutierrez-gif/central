import { NextResponse } from 'next/server'

import { MAX_BYTES_DOCUMENTO } from '@/lib/patrimonio/documentos-api'
import { responderSubirJustificante } from '@/lib/inquilino/inquilino-api'
import { puertosInquilino } from '@/lib/inquilino/inquilino-bd'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * `POST /api/inquilino/<contrato>/justificantes` (multipart, campo `fichero`) — el inquilino sube un justificante (p. ej. el recibo
 * de su seguro de hogar). PDF/JPG/PNG/WebP por contenido real, ≤ 10 MB, tope diario. Contrato que no es suyo: 404.
 * Sin `content-length` numérico, 411; mayor que el máximo, 413 (antes de leer el cuerpo).
 */
export async function POST(req: Request, ctx: { params: Promise<{ contratoId: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`inquilino-justificante:${identidad.id}`, 20, 60 * 60 * 1000)
  if (!tope.allowed) return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429 })
  if (!(req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    return NextResponse.json({ error: 'datos_invalidos', campo: 'fichero' }, { status: 400 })
  }
  const cabecera = req.headers.get('content-length')
  if (cabecera === null || !/^\d+$/.test(cabecera.trim())) return NextResponse.json({ error: 'longitud_requerida' }, { status: 411 })
  if (Number(cabecera) > MAX_BYTES_DOCUMENTO + 64 * 1024) return NextResponse.json({ error: 'fichero_grande' }, { status: 413 })
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'datos_invalidos', campo: 'fichero' }, { status: 400 })
  }
  const f = form.get('fichero')
  const fichero = f instanceof File ? { nombre: f.name, tamano: f.size, contenido: Buffer.from(await f.arrayBuffer()) } : null
  const { contratoId } = await ctx.params
  const r = await responderSubirJustificante(puertosInquilino(identidad.id), contratoId, fichero)
  return NextResponse.json(r.body, { status: r.status })
}

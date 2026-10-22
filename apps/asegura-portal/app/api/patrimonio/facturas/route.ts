import { NextResponse } from 'next/server'

import { responderResolverFactura, responderSubidaFactura, MAX_BYTES_FACTURA } from '@/lib/patrimonio/facturas-api'
import { puertosFacturas } from '@/lib/patrimonio/facturas-bd'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Tope por IDENTIDAD en memoria (frena ráfagas antes de leer el cuerpo); el tope diario real se cuenta en BD. */
const MAX_POR_IDENTIDAD = 10
const VENTANA_MS = 60 * 60 * 1000

/**
 * `POST /api/patrimonio/facturas` (multipart: `titular`, `inmueble` opcional, `fichero`) — lee la factura con IA y deja un
 * gasto `propuesto`; NO lo confirma. `PATCH` (JSON: `titular`, `gasto`, `accion: confirmar|descartar` + campos revisados)
 * lo resuelve. Nivel Gestión o Total.
 *
 * 🚨 La identidad sale SOLO de la cookie. El `titular` se busca DENTRO de `accesosPatrimonio()` y el inmueble DENTRO de ese
 * titular; ajeno o sin nivel = la misma 404. El tope por identidad va ANTES de leer el fichero y de llamar a la IA; el
 * tope DIARIO se cuenta en BD dentro de `responderSubidaFactura`.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`patrimonio-factura:${identidad.id}`, MAX_POR_IDENTIDAD, VENTANA_MS)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  if (!(req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    return NextResponse.json({ error: 'datos_invalidos', campo: 'fichero' }, { status: 400 })
  }
  // Sin `content-length` numérico (p. ej. chunked) no hay forma de acotar el cuerpo antes de leerlo: 411. Mayor que el máximo: 413.
  const cabecera = req.headers.get('content-length')
  if (cabecera === null || !/^\d+$/.test(cabecera.trim())) return NextResponse.json({ error: 'longitud_requerida' }, { status: 411 })
  if (Number(cabecera) > MAX_BYTES_FACTURA + 64 * 1024) return NextResponse.json({ error: 'fichero_grande' }, { status: 413 })
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'datos_invalidos', campo: 'fichero' }, { status: 400 })
  }
  const f = form.get('fichero')
  const fichero =
    f instanceof File
      ? { nombre: f.name, mime: f.type, tamano: f.size, contenido: f.size <= MAX_BYTES_FACTURA ? Buffer.from(await f.arrayBuffer()) : Buffer.alloc(0) }
      : null
  const r = await responderSubidaFactura(puertosFacturas(identidad.id), { titular: form.get('titular'), inmueble: form.get('inmueble'), fichero })
  return NextResponse.json(r.body, { status: r.status })
}

export async function PATCH(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`patrimonio-factura-resolver:${identidad.id}`, 120, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const cuerpo = await req.json().catch(() => null)
  const r = await responderResolverFactura(puertosFacturas(identidad.id), cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}

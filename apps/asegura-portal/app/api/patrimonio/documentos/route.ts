import { NextResponse } from 'next/server'

import { MAX_BYTES_DOCUMENTO, responderListaDocumentos, responderSubidaDocumento } from '@/lib/patrimonio/documentos-api'
import { puertosDocumentos } from '@/lib/patrimonio/documentos-bd'
import { rateLimit } from '@/lib/rate-limit'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Topes por IDENTIDAD en memoria (frenan ráfagas antes de leer el cuerpo); el tope DIARIO (40) se cuenta en BD. */
const MAX_SUBIDAS_HORA = 30
const MAX_LISTAS_HORA = 600
const VENTANA_MS = 60 * 60 * 1000

/**
 * `GET /api/patrimonio/documentos?titular=&ownerTipo=&ownerId=&desde=` — lista (sin el fichero) los documentos NO borrados de
 * un inmueble/contrato/inquilino. `POST` (multipart: `titular`, `ownerTipo`, `ownerId`, `carpeta`, `fichero`) sube uno.
 *
 * 🚨 La identidad sale SOLO de la cookie. El titular se busca DENTRO de `accesosPatrimonio()` y el owner DENTRO de ese titular;
 * ajeno, inexistente o sin nivel = la misma 404. El tope por identidad va ANTES de leer el cuerpo; sin `content-length`
 * numérico, 411; mayor que el máximo, 413 (también antes de leer).
 */
export async function GET(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'lectura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const tope = rateLimit(`patrimonio-documentos-lista:${identidad.id}`, MAX_LISTAS_HORA, VENTANA_MS)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const q = new URL(req.url).searchParams
  const desde = q.get('desde')
  const r = await responderListaDocumentos(puertosDocumentos(identidad.id), {
    titular: q.get('titular'),
    ownerTipo: q.get('ownerTipo'),
    ownerId: q.get('ownerId'),
    desde: desde !== null && /^\d{1,6}$/.test(desde) ? Number(desde) : 0,
  })
  return NextResponse.json(r.body, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}

export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const tope = rateLimit(`patrimonio-documento:${identidad.id}`, MAX_SUBIDAS_HORA, VENTANA_MS)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  if (!(req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    return NextResponse.json({ error: 'datos_invalidos', campo: 'fichero' }, { status: 400 })
  }
  // Sin `content-length` numérico (p. ej. chunked) no hay forma de acotar el cuerpo antes de leerlo: 411. Mayor que el máximo: 413.
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
  const fichero =
    f instanceof File
      ? { nombre: f.name, mime: f.type, tamano: f.size, contenido: f.size <= MAX_BYTES_DOCUMENTO ? Buffer.from(await f.arrayBuffer()) : Buffer.alloc(0) }
      : null
  const r = await responderSubidaDocumento(puertosDocumentos(identidad.id), {
    titular: form.get('titular'),
    ownerTipo: form.get('ownerTipo'),
    ownerId: form.get('ownerId'),
    carpeta: form.get('carpeta'),
    fichero,
  })
  return NextResponse.json(r.body, { status: r.status })
}

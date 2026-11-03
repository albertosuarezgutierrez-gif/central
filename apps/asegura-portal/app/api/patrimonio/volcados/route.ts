import { NextResponse } from 'next/server'

import { MAX_BYTES_VOLCADO, responderSubirVolcado } from '@/lib/patrimonio/volcado-api'
import { puertosVolcado } from '@/lib/patrimonio/volcado-bd'
import { rateLimit } from '@/lib/rate-limit'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_POR_IDENTIDAD = 10
const VENTANA_MS = 60 * 60 * 1000

/**
 * `POST /api/patrimonio/volcados` (multipart: `titular`, `fichero`) — VOLCADO INICIAL: sube un Excel (.xlsx/.csv), un PDF o una
 * foto; la IA PROPONE edificio/unidades, contratos con inquilino y gastos fijos. NO crea nada del patrimonio: eso es
 * `.../[id]/confirmar` con la propuesta revisada. Una lectura consume cupo de IA del titular.
 *
 * 🚨 La identidad sale de la cookie; el `titular` se busca DENTRO de `accesosPatrimonio()` con nivel Total (404 si no, nunca
 * 403). Topes: 10 MB (PDF/foto), 5 MB y 500 filas (hoja), 10 importaciones por identidad y día (en BD), cupo mensual de IA.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  // Tope en memoria por identidad (corta el bucle; el límite real es el de BD y el cupo de IA).
  const tope = rateLimit(`patrimonio-volcado:${identidad.id}`, MAX_POR_IDENTIDAD, VENTANA_MS)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  // Antes de leer el cuerpo: sin content-length (chunked) el tope de tamaño no se aplicaría.
  const cabecera = req.headers.get('content-length')
  const largo = cabecera === null ? NaN : Number(cabecera)
  if (!Number.isFinite(largo)) return NextResponse.json({ error: 'falta_tamano' }, { status: 411 })
  if (largo > MAX_BYTES_VOLCADO + 64 * 1024) return NextResponse.json({ error: 'fichero_demasiado_grande' }, { status: 413 })
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
  const f = form.get('fichero')
  const bytes = f instanceof File ? new Uint8Array(await f.arrayBuffer()) : null
  const r = await responderSubirVolcado(puertosVolcado(identidad.id), {
    titular: form.get('titular'),
    nombre: f instanceof File ? f.name : null,
    bytes,
  })
  return NextResponse.json(r.body, { status: r.status })
}

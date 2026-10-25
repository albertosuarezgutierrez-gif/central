import { NextResponse } from 'next/server'
import { MAX_BYTES_IMPORTACION } from '@central/module-patrimonio'

import { responderSubir } from '@/lib/patrimonio/importacion-api'
import { puertosImportacion } from '@/lib/patrimonio/importacion-bd'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * `POST /api/patrimonio/importaciones` (multipart: `titular`, `fichero`, `tipo?`) — sube un CSV (guardado desde Excel) de inmuebles,
 * contratos o gastos, lo lee EN MEMORIA (no se guarda el fichero) y deja una PROPUESTA con autodetección de columnas.
 * No crea nada del patrimonio: eso es `.../[id]/confirmar`.
 *
 * 🚨 La identidad sale de la cookie; el `titular` se busca DENTRO de `accesosPatrimonio()` y exige nivel Total (404 si no,
 * nunca 403). Topes: 5 MB, 500 filas, 10 importaciones por identidad y día (en BD). Lógica en `importacion-api.ts`.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  // Tope en memoria por identidad (corta el bucle, no es el límite real: ese es el de BD).
  const tope = rateLimit(`patrimonio-importar:${identidad.id}`, 20, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  // Antes de leer el cuerpo: si ya dice que pasa del tope, no se carga en memoria.
  const largo = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(largo) && largo > MAX_BYTES_IMPORTACION + 64 * 1024) {
    return NextResponse.json({ error: 'fichero_demasiado_grande' }, { status: 413 })
  }
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
  const f = form.get('fichero')
  const bytes = f instanceof File ? new Uint8Array(await f.arrayBuffer()) : null
  const r = await responderSubir(puertosImportacion(identidad.id), {
    titular: form.get('titular'),
    tipo: form.get('tipo'),
    nombre: f instanceof File ? f.name : null,
    bytes,
  })
  return NextResponse.json(r.body, { status: r.status })
}

import { NextResponse } from 'next/server'

import { responderReparto } from '@/lib/patrimonio/edificio-api'
import { puertosEdificio } from '@/lib/patrimonio/edificio-bd'
import { rateLimit } from '@/lib/rate-limit'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `PUT /api/patrimonio/inmuebles/[id]/reparto` — `{ criterio: 'm2' | 'porcentaje' | null, unidades: [{ id, superficieM2?, porcentaje? }] }`:
 * cómo se imputan los gastos del EDIFICIO a sus unidades (27/10/2026). 🚨 Edificio DENTRO de `accesosPatrimonio()` y las
 * unidades DENTRO de ese edificio; si no, 404 (nunca 403) y no se escribe nada.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const tope = rateLimit(`patrimonio-reparto:${identidad.id}`, 60, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id } = await params
  const cuerpo = await req.json().catch(() => null)
  const r = await responderReparto(puertosEdificio(identidad.id), id, cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}

import { NextResponse } from 'next/server'

import { buscarViasCallejero } from '@/lib/callejero-vias'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

/**
 * `GET /api/patrimonio/vias?provincia=&municipio=&q=` → `{ vias: [{ tipo, nombre }] }` (≤10). Autocompletado de la
 * calle con el callejero REAL del Catastro; es una ayuda, nunca bloquea escribir. Porta
 * `apps/plataforma/app/api/correduria/catastro/vias`. Exige sesión y tope por identidad (el Catastro corta si se le
 * insiste); la consulta y la caché, en `lib/callejero-vias.ts` (la comparte `/api/datos/vias`).
 */
export async function GET(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ vias: [], error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`patrimonio-vias:${identidad.id}`, 120, 60 * 1000)
  if (!tope.allowed) return NextResponse.json({ vias: [], error: 'demasiadas_peticiones' }, { status: 429 })

  const p = new URL(req.url).searchParams
  const r = await buscarViasCallejero(p.get('provincia') ?? '', p.get('municipio') ?? '', p.get('q') ?? '', 'patrimonio/vias')
  return NextResponse.json(r.cuerpo, { status: r.status })
}

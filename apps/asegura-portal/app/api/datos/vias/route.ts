import { NextResponse } from 'next/server'

import { buscarViasCallejero } from '@/lib/callejero-vias'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { tokenSolicitudVivo } from '@/lib/solicitud-datos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

/**
 * `GET /api/datos/vias?token=&provincia=&municipio=&q=` → `{ vias: [{ tipo, nombre }] }` (25/10/2026). Autocompletado
 * de la calle con el callejero del Catastro en el ENLACE de datos (sin sesión): token de solicitud VIVO + tope por IP
 * (el Catastro corta si se le insiste). Es una ayuda: nunca bloquea escribir. Fallo → 502/503 con `vias: []`.
 */
export async function GET(req: Request) {
  if (!rateLimit(`datos-vias:${getIp(req)}`, 120, 10 * 60 * 1000).allowed) return NextResponse.json({ vias: [], error: 'demasiadas_peticiones' }, { status: 429 })
  const p = new URL(req.url).searchParams
  if (!(await tokenSolicitudVivo((p.get('token') ?? '').trim()))) return NextResponse.json({ vias: [], error: 'enlace_no_valido' }, { status: 410 })
  const r = await buscarViasCallejero(p.get('provincia') ?? '', p.get('municipio') ?? '', p.get('q') ?? '', 'datos/vias')
  return NextResponse.json(r.cuerpo, { status: r.status })
}

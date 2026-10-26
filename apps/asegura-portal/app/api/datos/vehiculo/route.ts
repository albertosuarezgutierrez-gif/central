import { NextResponse } from 'next/server'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { catalogoVehiculoPuente, interpretarCatalogo, ramoSolicitudViva } from '@/lib/solicitud-datos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

/**
 * `GET /api/datos/vehiculo?token=&paso=marcas|modelos|motores|versiones&marcaId=&modeloId=&motor=` → `{ opciones }`
 * (26/10/2026, fase 2). El buscador de la versión exacta en el ENLACE de datos de auto/moto: token VIVO de auto o moto
 * (el ramo lo pone el servidor, no el navegador) y tope por IP. Gratis (catálogo). Es una ayuda: si falla, 502/503 y el
 * cliente sigue con marca y modelo en texto.
 */
export async function GET(req: Request) {
  if (!rateLimit(`datos-vehiculo:${getIp(req)}`, 120, 10 * 60 * 1000).allowed) return NextResponse.json({ opciones: null, error: 'demasiadas_peticiones' }, { status: 429 })
  const p = new URL(req.url).searchParams
  const ramo = await ramoSolicitudViva((p.get('token') ?? '').trim())
  if (ramo !== 'auto' && ramo !== 'moto') return NextResponse.json({ opciones: null, error: 'enlace_no_valido' }, { status: 410 })
  const q = new URLSearchParams({ ramo, paso: p.get('paso') ?? '' })
  for (const k of ['marcaId', 'modeloId', 'motor']) { const v = p.get(k); if (v) q.set(k, v) }
  const r = await catalogoVehiculoPuente(q)
  if (!r) return NextResponse.json({ opciones: null, error: 'sin_puente' }, { status: 503 })
  const opciones = interpretarCatalogo(r.status, r.json)
  if (opciones === null) return NextResponse.json({ opciones: null, error: 'catalogo_no_disponible' }, { status: r.status === 400 ? 400 : 502 })
  return NextResponse.json({ opciones }, { headers: { 'cache-control': 'private, max-age=3600' } })
}

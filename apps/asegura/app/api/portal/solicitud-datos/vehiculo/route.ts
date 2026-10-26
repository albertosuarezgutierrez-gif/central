import { NextResponse } from 'next/server'

import { consultaCatalogoPortal } from '@/lib/catalogo-vehiculo-portal'
import { MOTORES_MOTO } from '@/lib/codeoscopic/catalogos'
import { puentePortalAutorizado } from '@/lib/puente-portal'
import { resolverCatalogo } from '@/lib/retarificar-cartera'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 20

/**
 * `GET /api/portal/solicitud-datos/vehiculo?ramo=auto|moto&paso=marcas|modelos|motores|versiones&…` (26/10/2026, fase 2).
 * El buscador marca → modelo → combustible → versión del ENLACE de datos. Solo por el puente del portal (que ya ha
 * comprobado que el token está VIVO y es de auto/moto) y solo esos cuatro pasos (`consultaCatalogoPortal`).
 * **0,00€**: son GET de catálogo. Tres estados, como el resto: `ok` · `sin_configurar` (503, NO es «no hay opciones») ·
 * `error` (502; nunca una lista vacía).
 */
export async function GET(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const c = consultaCatalogoPortal(new URL(req.url).searchParams, MOTORES_MOTO)
  if (!c) return NextResponse.json({ estado: 'invalido' }, { status: 400 })
  if ('fijos' in c) return NextResponse.json({ estado: 'ok', opciones: c.fijos })
  const r = await resolverCatalogo(c.params)
  switch (r.estado) {
    case 'ok': return NextResponse.json({ estado: 'ok', opciones: r.opciones.map((o) => ({ id: o.id, nombre: o.nombre })) }, { headers: { 'cache-control': 'private, max-age=3600' } })
    case 'invalido': return NextResponse.json({ estado: 'invalido' }, { status: 400 })
    case 'sin_configurar': return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    case 'error': return NextResponse.json({ estado: 'error' }, { status: 502 })
  }
}

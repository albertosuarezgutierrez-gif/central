import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { pedirMejorarPrecio, peticionesPrecioAbiertas } from '@/lib/mejorar-precio-portal'
import { puentePortalAutorizado } from '@/lib/puente-portal'

export const dynamic = 'force-dynamic'

/** Un id mal formado es un 422, no un 503: si llegara al `::uuid` reventaría como avería. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const runtime = 'nodejs'

/**
 * /api/portal/mejorar-precio — «Quiero que me mejores el precio» del portal.
 *   GET  ?identidadId=…                 → { estado:'ok', peticiones:[{polizaId,pedidoEl}] }
 *   POST { identidadId, polizaId, prioridad, canal, momento?, nota? }
 * Como el resto del puente: NO acepta `clienteId`, la ficha sale de `portal_vinculo`.
 */
export async function GET(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const identidadId = new URL(req.url).searchParams.get('identidadId')?.trim() ?? ''
    if (!UUID.test(identidadId)) return NextResponse.json({ estado: 'invalido' }, { status: 422 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const r = await peticionesPrecioAbiertas(correduria.id, identidadId)
    if (r === 'sin_ficha') return NextResponse.json({ estado: 'sin_ficha' }, { status: 409 })
    return NextResponse.json({ estado: 'ok', peticiones: r })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/mejorar-precio', e) }, { status: 503 })
  }
}

export async function POST(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const identidadId = typeof body?.identidadId === 'string' ? body.identidadId.trim() : ''
    const polizaId = typeof body?.polizaId === 'string' ? body.polizaId.trim() : ''
    if (!UUID.test(identidadId) || polizaId === '') return NextResponse.json({ estado: 'invalido', motivo: 'Faltan datos.' }, { status: 422 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const r = await pedirMejorarPrecio(correduria.id, identidadId, polizaId, body)
    const status = r.estado === 'ok' ? 200 : r.estado === 'invalido' ? 422 : r.estado === 'no_encontrada' ? 404 : 409
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/mejorar-precio', e) }, { status: 503 })
  }
}

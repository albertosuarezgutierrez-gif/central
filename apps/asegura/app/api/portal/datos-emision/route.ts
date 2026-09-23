import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { datosParaEmitirDePortal } from '@/lib/datos-emision'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { puentePortalAutorizado } from '@/lib/puente-portal'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/portal/datos-emision?identidadId=&presupuestoId= — qué datos le faltan al cliente para poder emitir
 * (spec 2026-09-21 §4bis). Solo lectura. Como el resto del puente: NO acepta `clienteId`, la ficha
 * sale de `portal_vinculo`. Devuelve el estado de cada campo y lo que se enseña ENMASCARADO; nunca
 * el DNI ni la cuenta enteros.
 */
export async function GET(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const identidadId = (new URL(req.url).searchParams.get('identidadId') ?? '').trim()
    const presupuestoId = (new URL(req.url).searchParams.get('presupuestoId') ?? '').trim()
    if (identidadId === '' || !UUID.test(presupuestoId)) return NextResponse.json({ estado: 'invalido', motivo: 'sin identidad o presupuesto' }, { status: 422 })

    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })

    const r = await datosParaEmitirDePortal(correduria.id, identidadId, presupuestoId)
    const status = r.estado === 'ok' ? 200 : r.estado === 'error' ? 503 : r.estado === 'no_encontrado' ? 404 : 409
    return NextResponse.json(r, { status, headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/datos-emision', e) }, { status: 503 })
  }
}

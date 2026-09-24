import { NextResponse } from 'next/server'
import { SEMANAS_LINEA_BASE, semanasLineaBase } from '@central/module-seguros'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { conteosLineaBase } from '@/lib/linea-base'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Línea base semanal de la cartera (§N.2). Solo lectura.
 *
 *   GET → { estado:'ok', semanas:['YYYY-MM-DD'…], conteos:{ <serie>: { <lunes>: n } } }
 *
 * `conteos` solo trae las semanas con filas: el hueco lo rellena quien pinta, sabiendo desde
 * cuándo existe cada serie (`SERIES_LINEA_BASE`).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
  try {
    const c = await correduriaUnica()
    if (!c) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const semanas = semanasLineaBase(new Date(), SEMANAS_LINEA_BASE)
    // Un día de margen: el lunes de Madrid empieza el domingo a las 22:00/23:00 UTC.
    const desde = new Date(Date.parse(`${semanas[0]}T00:00:00Z`) - 86_400_000)
    return NextResponse.json({ estado: 'ok', semanas, conteos: await conteosLineaBase(c.id, desde) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/linea-base', e) }, { status: 500 })
  }
}

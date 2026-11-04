import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { agruparPorCompania } from '@/lib/codeoscopic/catalogo-companias'
import { hayCatalogo, leerUltimaInstantanea } from '@/lib/codeoscopic/catalogo-companias-bd'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/operador/codeoscopic/catalogo — la ÚLTIMA instantánea del catálogo de Avant2 agrupada por
 * compañía (vendor → productos por ramo con configs/brokerFee/emisión online), más ramos, compañías DGS,
 * formas/frecuencias de pago y el estado de cada llamada. Solo lee la BD: no llama al vendor.
 * `estado: 'sin_instantanea'` = aún no se ha sacado ninguna (≠ «no hay compañías»).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
  try {
    if (!(await hayCatalogo())) {
      return NextResponse.json({ estado: 'sin_migracion', mensaje: 'falta aplicar prisma/sql/2026-11-04f_codeoscopic_catalogo.sql' }, { status: 503 })
    }
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const filas = await leerUltimaInstantanea(correduria.id)
    if (filas.length === 0) return NextResponse.json({ estado: 'sin_instantanea' })
    return NextResponse.json({
      estado: 'ok',
      instantaneaId: filas[0].instantanea_id,
      fecha: filas[0].fecha,
      ...agruparPorCompania(filas),
    })
  } catch (e) {
    return NextResponse.json({ estado: 'error', mensaje: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 500 })
  }
}

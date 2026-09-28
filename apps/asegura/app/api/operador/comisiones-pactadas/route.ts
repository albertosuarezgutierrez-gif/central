import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { comisionesPactadas } from '@/lib/comisiones-pactadas'

export const dynamic = 'force-dynamic'

/**
 * GET /api/operador/comisiones-pactadas — cuadro de comisiones firmado con cada compañía
 * (tabla `comision_pactada`) cruzado con el % que aplican los recibos de CIMA. Solo lectura: el
 * cuadro se carga por migración SQL a partir de la comunicación de la compañía.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' })
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
    return NextResponse.json({ estado: 'ok', ...(await comisionesPactadas(correduria.id, hoy)) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/comisiones-pactadas', e) })
  }
}

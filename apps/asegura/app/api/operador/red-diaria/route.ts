import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { redDiaria } from '@/lib/red-diaria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Red diaria de la correduría (cron `correduria-red-diaria` de plataforma). Solo LEE, pero antes aplica
 * `retirarObsoletas` (la caducidad perezosa) para que lo leído sea lo que «Hoy» enseñaría.
 *
 *   GET → { estado:'ok', aprobaciones:{ porCaducar, caducadas }, anulaciones, recibos }
 *   Un fallo NUNCA se sirve como listas vacías: 500 + `estado:'error'`; 503 sin configurar.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    return NextResponse.json({ estado: 'ok', ...(await redDiaria(correduria.id)) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/red-diaria', e) }, { status: 500 })
  }
}

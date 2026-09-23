import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { leadsCompetencia } from '@/lib/leads-competencia'

export const dynamic = 'force-dynamic'

// GET /api/operador/leads-competencia?dias=90 — carril de LEADS de
// Vencimientos (solo lectura). La fecha de cada lead es ESTIMADA: aniversario
// de la póliza que tenía en otra compañía (tabla heredada `oportunidades`).
// Tres estados como el resto del puerto: «sin conectar» no es «no hay leads».
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const pedidos = Number(new URL(req.url).searchParams.get('dias'))
  const dias = Number.isFinite(pedidos) && pedidos > 0 ? Math.min(Math.trunc(pedidos), 365) : 90
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    return NextResponse.json({ estado: 'ok', dias, fechas: 'estimadas', ...(await leadsCompetencia(correduria.id, dias)) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/leads-competencia', e) })
  }
}

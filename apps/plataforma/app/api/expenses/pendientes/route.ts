import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { listarPendientes } from '@/lib/agente-facturas/pendientes'

export const dynamic = 'force-dynamic'

// GET /api/expenses/pendientes — la bandeja de revisión del agente de facturas.
// Ruta que el aviso de Telegram (`lib/agente-facturas/avisos.ts`) enlaza desde el día uno.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const pendientes = await listarPendientes()
  const total = pendientes.reduce((s, p) => s + p.total, 0)
  return NextResponse.json({ pendientes, total, n: pendientes.length })
}

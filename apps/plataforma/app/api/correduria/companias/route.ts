import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { companiasAsegura } from '@/lib/companias-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/companias — directorio de contacto por compañía
 * (`seguros.companias_dgs`). Reenvía al puerto de asegura
 * (`/api/operador/companias`) con el secreto de operador, mismo patrón que
 * `/api/correduria/duplicados`.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const r = await companiasAsegura()
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

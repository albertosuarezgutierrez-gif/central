import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { comisionesPactadasAsegura } from '@/lib/companias-asegura'

export const dynamic = 'force-dynamic'

/** /api/correduria/comisiones-pactadas — reenvía al puerto de asegura, mismo patrón que `/api/correduria/companias`. */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await comisionesPactadasAsegura()
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

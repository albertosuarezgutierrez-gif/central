import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { aplazarPago } from '@/lib/agente-facturas/pagos'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { facturaId, dias } = await req.json().catch(() => ({}))
  if (!facturaId) return NextResponse.json({ error: 'facturaId requerido' }, { status: 400 })

  const ok = await aplazarPago(facturaId, session.id, dias ?? 7)
  return NextResponse.json({ ok })
}

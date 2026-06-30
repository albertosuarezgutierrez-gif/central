import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { aprobarPago } from '@/lib/agente-facturas/pagos'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { facturaId } = await req.json().catch(() => ({}))
  if (!facturaId) return NextResponse.json({ error: 'facturaId requerido' }, { status: 400 })

  const debtorIban = process.env.EB_DEBTOR_IBAN ?? ''
  const result = await aprobarPago(facturaId, session.id, debtorIban)

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })
  return NextResponse.json(result)
}

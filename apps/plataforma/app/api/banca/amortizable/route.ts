import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// POST /api/banca/amortizable { id, amortizable } — marca/desmarca un cargo como inmovilizado a
// amortizar (mobiliario/obra/equipo). El control de gastos lo separa del gasto deducible del año.
// Scoped por cuenta_id (verifica pertenencia antes de actualizar).
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, amortizable } = await req.json().catch(() => ({})) as { id?: string; amortizable?: boolean }
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const res = await prisma.$executeRaw`
    UPDATE movimientos_bancarios SET amortizable = ${!!amortizable}
    WHERE id = ${id}::uuid
      AND cuenta_bancaria_id IN (SELECT id FROM cuentas_bancarias WHERE cuenta_id = ${session.id}::uuid)
  `
  if (Number(res) === 0) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  return NextResponse.json({ ok: true })
}

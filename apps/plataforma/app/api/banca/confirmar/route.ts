import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, confirmado } = await req.json() as { id: string; confirmado: boolean }
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  // Verificar que el movimiento pertenece a esta cuenta antes de actualizar
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT mb.id FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE mb.id = ${id}::uuid AND cb.cuenta_id = ${session.id}::uuid
    LIMIT 1
  `
  if (!rows.length) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  await prisma.$executeRaw`
    UPDATE movimientos_bancarios SET destino_confirmado = ${confirmado} WHERE id = ${id}::uuid
  `

  return NextResponse.json({ ok: true })
}

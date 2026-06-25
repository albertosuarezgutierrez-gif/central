import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// POST /api/banca/comentario { id, comentario } — guarda/edita la nota libre de un movimiento.
// Texto opcional (vacío = borra la nota). No afecta a clasificación ni P&L. Scoped por cuenta_id.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, comentario } = await req.json().catch(() => ({})) as { id?: string; comentario?: string }
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  // Verificar pertenencia a la cuenta antes de actualizar.
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT mb.id FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE mb.id = ${id}::uuid AND cb.cuenta_id = ${session.id}::uuid
    LIMIT 1
  `
  if (!rows.length) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const texto = (comentario ?? '').trim().slice(0, 500)
  await prisma.$executeRaw`
    UPDATE movimientos_bancarios SET comentario = ${texto || null} WHERE id = ${id}::uuid
  `
  return NextResponse.json({ ok: true })
}

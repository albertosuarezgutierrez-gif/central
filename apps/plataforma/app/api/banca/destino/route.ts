import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import type { Destino } from '@/lib/destino'

export const dynamic = 'force-dynamic'

const DESTINOS: Destino[] = ['turistico_pisos', 'turistico_duplex', 'seguros', 'traspaso_interno', 'personal']

// POST /api/banca/destino { id, destino } — reclasifica el "destino"/negocio de un movimiento.
// Lo usa el desglose de la correduría para SACAR de seguros un movimiento que no lo era.
// Scoped por cuenta_id (verifica pertenencia antes de actualizar).
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, destino } = await req.json().catch(() => ({})) as { id?: string; destino?: string }
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  if (!destino || !DESTINOS.includes(destino as Destino)) {
    return NextResponse.json({ error: 'destino inválido' }, { status: 400 })
  }

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT mb.id FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE mb.id = ${id}::uuid AND cb.cuenta_id = ${session.id}::uuid
    LIMIT 1
  `
  if (!rows.length) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Al moverlo fuera de seguros lo damos por confirmado (decisión manual del dueño).
  await prisma.$executeRaw`
    UPDATE movimientos_bancarios SET destino = ${destino}, destino_confirmado = true WHERE id = ${id}::uuid
  `

  return NextResponse.json({ ok: true })
}

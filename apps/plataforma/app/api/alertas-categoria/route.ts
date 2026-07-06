import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Alertas de presupuesto mensual por categoría personal. SIEMPRE scoped por cuenta_id (sesión).
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const alertas = await prisma.$queryRaw<{
    id: string; categoria: string; limite_mensual: number; activa: boolean
  }[]>`
    SELECT id, categoria, limite_mensual::float, activa
    FROM categoria_alertas
    WHERE cuenta_id = ${session.id}::uuid
    ORDER BY categoria
  `
  return NextResponse.json(alertas)
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json() as { categoria: string; limite_mensual: number; activa: boolean }
  const { categoria, limite_mensual, activa } = body

  if (!categoria || typeof limite_mensual !== 'number') {
    return NextResponse.json({ error: 'categoria y limite_mensual requeridos' }, { status: 400 })
  }

  // categoria es único globalmente (constraint existente); se persiste la cuenta del dueño.
  await prisma.$executeRaw`
    INSERT INTO categoria_alertas (categoria, limite_mensual, activa, cuenta_id)
    VALUES (${categoria}, ${limite_mensual}, ${activa ?? true}, ${session.id}::uuid)
    ON CONFLICT (categoria) DO UPDATE
      SET limite_mensual = EXCLUDED.limite_mensual,
          activa = EXCLUDED.activa,
          cuenta_id = EXCLUDED.cuenta_id
  `
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { categoria } = await req.json() as { categoria: string }
  if (!categoria) return NextResponse.json({ error: 'categoria requerida' }, { status: 400 })
  await prisma.$executeRaw`DELETE FROM categoria_alertas WHERE categoria = ${categoria} AND cuenta_id = ${session.id}::uuid`
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const alertas = await prisma.$queryRaw<{
    id: string
    categoria: string
    limite_mensual: number
    activa: boolean
  }[]>`
    SELECT id, categoria, limite_mensual::float, activa
    FROM categoria_alertas
    ORDER BY categoria
  `
  return NextResponse.json(alertas)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json() as { categoria: string; limite_mensual: number; activa: boolean }
  const { categoria, limite_mensual, activa } = body

  if (!categoria || typeof limite_mensual !== 'number') {
    return NextResponse.json({ error: 'categoria y limite_mensual requeridos' }, { status: 400 })
  }

  await prisma.$executeRaw`
    INSERT INTO categoria_alertas (categoria, limite_mensual, activa)
    VALUES (${categoria}, ${limite_mensual}, ${activa ?? true})
    ON CONFLICT (categoria) DO UPDATE
      SET limite_mensual = EXCLUDED.limite_mensual,
          activa = EXCLUDED.activa
  `
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { categoria } = await req.json() as { categoria: string }
  if (!categoria) return NextResponse.json({ error: 'categoria requerida' }, { status: 400 })
  await prisma.$executeRaw`DELETE FROM categoria_alertas WHERE categoria = ${categoria}`
  return NextResponse.json({ ok: true })
}

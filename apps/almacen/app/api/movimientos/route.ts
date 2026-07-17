import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { registrarMovimiento, actorDeSesion } from '@/lib/almacen'

const nuevo = z.object({
  materialId: z.string().uuid(),
  tipo: z.enum(['entrada', 'salida', 'devolucion', 'rotura', 'ajuste']),
  cantidad: z.number().int(),
  espacioId: z.string().uuid(),
  motivo: z.string().nullish(),
})

export async function GET(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const where: Record<string, unknown> = { cuentaId: s.id }
  const materialId = q.get('materialId')
  const tipo = q.get('tipo')
  if (materialId) where.materialId = materialId
  if (tipo) where.tipo = tipo
  const movimientos = await prisma.almacenMovimiento.findMany({
    where,
    orderBy: [{ fecha: 'desc' }],
    take: 500,
  })
  return NextResponse.json({ movimientos })
}

export async function POST(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const p = nuevo.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  try {
    await registrarMovimiento(s.id, actorDeSesion(s), p.data)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

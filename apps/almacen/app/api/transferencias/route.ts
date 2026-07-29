import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { crearTransferencia, actorDeSesion } from '@/lib/almacen'

const nueva = z.object({
  materialId: z.string().uuid(),
  cantidad: z.number().int().positive(),
  espacioOrigenId: z.string().uuid(),
  espacioDestinoId: z.string().uuid(),
  notas: z.string().nullish(),
})

export async function GET(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const estado = new URL(req.url).searchParams.get('estado')
  const where: Record<string, unknown> = { cuentaId: s.id }
  if (estado) where.estado = estado
  const transferencias = await prisma.almacenTransferencia.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    take: 300,
  })
  return NextResponse.json({ transferencias })
}

export async function POST(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const p = nueva.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  try {
    const t = await crearTransferencia(s.id, actorDeSesion(s), p.data)
    return NextResponse.json({ transferencia: t })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

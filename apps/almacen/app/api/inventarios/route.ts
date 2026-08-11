import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { crearInventario } from '@/lib/inventario'

export async function GET() {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const inventarios = await prisma.almacenInventario.findMany({
    where: { cuentaId: s.id },
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
  })
  return NextResponse.json({ inventarios })
}

export async function POST(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  if (s.tipo !== 'oficina') return NextResponse.json({ error: 'solo-oficina' }, { status: 403 })
  const p = z.object({
    espacioId: z.string().uuid(),
    empleadoId: z.string().uuid().nullish(),
    ciego: z.boolean().optional(),
  }).safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  try {
    const inv = await crearInventario(s.id, p.data)
    return NextResponse.json({ inventario: inv })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

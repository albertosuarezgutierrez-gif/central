import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { crearEvento } from '@/lib/eventos'
import { actorDeSesion } from '@/lib/almacen'

const nuevo = z.object({
  tipo: z.enum(['evento', 'alquiler']),
  titulo: z.string().min(1),
  clienteNombre: z.string().nullish(),
  clienteContacto: z.string().nullish(),
  lugar: z.string().nullish(),
  fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notas: z.string().nullish(),
})

export async function GET(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const estado = new URL(req.url).searchParams.get('estado')
  const where: Record<string, unknown> = { cuentaId: s.id }
  if (estado) where.estado = estado
  const eventos = await prisma.almacenEvento.findMany({ where, orderBy: [{ fechaInicio: 'desc' }], take: 300 })
  return NextResponse.json({ eventos })
}

export async function POST(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const p = nuevo.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  try {
    const ev = await crearEvento(s.id, actorDeSesion(s), p.data)
    return NextResponse.json({ evento: ev })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

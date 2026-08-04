import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { actorDeSesion } from '@/lib/almacen'

const nuevo = z.object({
  entidadTipo: z.enum(['espacio', 'material', 'transferencia', 'evento']),
  entidadId: z.string().uuid(),
  texto: z.string().min(1),
  fotoUrl: z.string().url().nullish(),
})

export async function GET(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const entidadTipo = q.get('entidadTipo')
  const entidadId = q.get('entidadId')
  if (!entidadTipo || !entidadId) return NextResponse.json({ error: 'falta-entidad' }, { status: 400 })
  const comentarios = await prisma.almacenComentario.findMany({
    where: { cuentaId: s.id, entidadTipo, entidadId },
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
  })
  return NextResponse.json({ comentarios })
}

export async function POST(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const p = nuevo.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  const c = await prisma.almacenComentario.create({
    data: {
      cuentaId: s.id,
      entidadTipo: p.data.entidadTipo,
      entidadId: p.data.entidadId,
      autor: actorDeSesion(s),
      texto: p.data.texto.trim(),
      fotoUrl: p.data.fotoUrl ?? null,
    },
  })
  return NextResponse.json({ comentario: c })
}

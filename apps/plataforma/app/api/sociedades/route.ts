import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const Body = z.object({
  nombre: z.string().min(1).max(120),
  cif: z.string().max(20).optional(),
})

export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = Body.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const sociedad = await prisma.sociedad.create({
    data: {
      cuentaId: session.id,
      nombre: body.data.nombre,
      cif: body.data.cif || null,
    },
  })
  return NextResponse.json(sociedad, { status: 201 })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const Body = z.object({
  sociedadId: z.string().uuid(),
  nombre: z.string().min(1).max(120),
  sector: z.string().min(1).max(60),
  app: z.enum(['ia-rest', 'ialimp', 'sivra']).optional(),
  refExt: z.string().max(120).optional(),
})

export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = Body.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  // Verify sociedad belongs to this cuenta
  const soc = await prisma.sociedad.findFirst({
    where: { id: body.data.sociedadId, cuentaId: session.id },
  })
  if (!soc) return NextResponse.json({ error: 'Sociedad no encontrada' }, { status: 404 })

  const negocio = await prisma.negocio.create({
    data: {
      sociedadId: body.data.sociedadId,
      nombre: body.data.nombre,
      sector: body.data.sector,
      app: body.data.app || null,
      refExt: body.data.refExt || null,
    },
  })
  return NextResponse.json(negocio, { status: 201 })
}

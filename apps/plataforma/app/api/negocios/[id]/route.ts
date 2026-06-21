import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const PatchBody = z.object({
  nombre: z.string().min(1).max(120).optional(),
  sector: z.string().min(1).max(60).optional(),
  app: z.enum(['ia-rest', 'ialimp', 'sivra']).nullable().optional(),
  refExt: z.string().max(120).nullable().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = PatchBody.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const neg = await prisma.negocio.findFirst({
    where: { id },
    include: { sociedad: true },
  })
  if (!neg || neg.sociedad.cuentaId !== session.id)
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const updated = await prisma.negocio.update({
    where: { id },
    data: {
      ...(body.data.nombre !== undefined && { nombre: body.data.nombre }),
      ...(body.data.sector !== undefined && { sector: body.data.sector }),
      ...(body.data.app !== undefined && { app: body.data.app }),
      ...(body.data.refExt !== undefined && { refExt: body.data.refExt }),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const neg = await prisma.negocio.findFirst({
    where: { id },
    include: { sociedad: true },
  })
  if (!neg || neg.sociedad.cuentaId !== session.id)
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  await prisma.negocio.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}

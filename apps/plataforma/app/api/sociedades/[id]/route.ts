import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const PatchBody = z.object({
  nombre: z.string().min(1).max(120).optional(),
  cif: z.string().max(20).nullable().optional(),
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

  const soc = await prisma.sociedad.findFirst({ where: { id, cuentaId: session.id } })
  if (!soc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const updated = await prisma.sociedad.update({
    where: { id },
    data: {
      ...(body.data.nombre !== undefined && { nombre: body.data.nombre }),
      ...(body.data.cif !== undefined && { cif: body.data.cif }),
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
  const soc = await prisma.sociedad.findFirst({ where: { id, cuentaId: session.id } })
  if (!soc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  await prisma.sociedad.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}

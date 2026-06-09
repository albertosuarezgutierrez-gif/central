import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/db'

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

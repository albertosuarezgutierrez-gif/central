import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Marca una ayuda/subvención del radar como descartada (deja de mostrarse en pantalla).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  await prisma.fiscalAyuda.update({ where: { id }, data: { descartado: true } })
  return NextResponse.json({ ok: true })
}

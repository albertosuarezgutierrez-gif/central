import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// POST /api/banca/cuenta/[id]/ocultar { oculta: boolean }
// Oculta o restaura una cuenta bancaria en la vista consolidada (no la borra).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { oculta } = await req.json().catch(() => ({})) as { oculta?: boolean }
  if (typeof oculta !== 'boolean') return NextResponse.json({ error: 'oculta requerido' }, { status: 400 })

  const res = await prisma.$executeRaw`
    UPDATE cuentas_bancarias SET oculta = ${oculta}
    WHERE id = ${id}::uuid
      AND cuenta_id = ${session.id}::uuid
  `
  if (Number(res) === 0) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { getConversacion } from '@/lib/comunicacion'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession().catch(() => null)
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const data = await getConversacion(s.id, id)
  if (!data) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  return NextResponse.json(data)
}

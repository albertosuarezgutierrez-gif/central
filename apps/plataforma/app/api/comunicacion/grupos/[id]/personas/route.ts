import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { resolverGrupo } from '@/lib/comunicacion'

// GET /api/comunicacion/grupos/[id]/personas
// Resuelve un grupo (estático o dinámico) a su lista de personas. Scoped por cuenta.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession().catch(() => null)
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const personas = await resolverGrupo(s.id, id)
  return NextResponse.json({ personas })
}

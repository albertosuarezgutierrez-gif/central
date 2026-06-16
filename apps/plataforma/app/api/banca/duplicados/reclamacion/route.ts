import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/session'
import { redactarReclamacion } from '@/lib/reclamacion'

export const dynamic = 'force-dynamic'

const Body = z.object({ comercio: z.string().min(1), importe: z.number(), fechas: z.array(z.string()).min(1) })

// POST /api/banca/duplicados/reclamacion — devuelve {asunto, cuerpo} para reclamar un cobro
// doble confirmado. Scoped por sesión (no toca BD; solo redacta).
export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const out = await redactarReclamacion(parsed.data)
  return NextResponse.json({ ok: true, ...out })
}

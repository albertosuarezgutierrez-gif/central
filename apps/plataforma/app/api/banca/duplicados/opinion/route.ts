import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/session'
import { segundaOpinionDuplicado } from '@/lib/duplicados-opinion'

export const dynamic = 'force-dynamic'

const Body = z.object({
  importe: z.number(),
  confianza: z.enum(['alta', 'baja']),
  movimientos: z.array(z.object({
    fecha: z.string().nullable().optional(),
    concepto: z.string(),
    cuentaLabel: z.string().optional(),
    conciliado: z.boolean().optional(),
  })).min(1),
})

// POST /api/banca/duplicados/opinion — segunda opinión IA (SOLO orientativa) sobre un posible cargo
// duplicado. La IA opina/explica; NO toca BD, NO resuelve el par ni inventa importes. Scoped por
// sesión (no lee movimientos por id: recibe ya lo que el detector determinista mostró en pantalla).
export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const opinion = await segundaOpinionDuplicado(parsed.data)
  return NextResponse.json({ ok: true, ...opinion })
}

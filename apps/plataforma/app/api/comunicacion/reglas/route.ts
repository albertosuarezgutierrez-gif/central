import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { listarReglas, crearRegla } from '@/lib/comunicacion'
import { z } from 'zod'

export async function GET() {
  const s = await requireSession().catch(() => null)
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json({ reglas: await listarReglas(s.id) })
}

const Crear = z.object({
  origenNodoId: z.string().uuid(),
  destinoNodoId: z.string().uuid(),
  puedeMensajear: z.boolean().optional(),
  puedeEncargar: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const s = await requireSession().catch(() => null)
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = Crear.safeParse(await req.json().catch(() => null))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const regla = await crearRegla(s.id, {
    origenNodoId: b.data.origenNodoId,
    destinoNodoId: b.data.destinoNodoId,
    puedeMensajear: b.data.puedeMensajear ?? true,
    puedeEncargar: b.data.puedeEncargar ?? false,
  })
  return NextResponse.json(regla, { status: 201 })
}

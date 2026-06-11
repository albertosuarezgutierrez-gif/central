import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { listarGrupos, crearGrupo } from '@/lib/comunicacion'
import { z } from 'zod'

export async function GET() {
  const s = await requireSession().catch(() => null)
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json({ grupos: await listarGrupos(s.id) })
}

const Crear = z.object({
  negocioId: z.string().uuid().nullish(),
  nombre: z.string().min(1).max(120),
  tipo: z.enum(['estatico', 'dinamico']).default('estatico'),
  origenRef: z.string().max(200).nullish(),
})

export async function POST(req: NextRequest) {
  const s = await requireSession().catch(() => null)
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = Crear.safeParse(await req.json().catch(() => null))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const grupo = await crearGrupo(s.id, {
    negocioId: b.data.negocioId ?? null,
    nombre: b.data.nombre,
    tipo: b.data.tipo,
    origenRef: b.data.origenRef ?? null,
  })
  return NextResponse.json(grupo, { status: 201 })
}

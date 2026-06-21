import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { listarCategorias, crearCategoria } from '@/lib/comunicacion'
import { z } from 'zod'

export async function GET() {
  const s = await requireSession().catch(() => null)
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json({ categorias: await listarCategorias(s.id) })
}

const Crear = z.object({
  nombre: z.string().min(1).max(60),
  color: z.string().max(20).nullish(),
  orden: z.number().int().optional(),
})

export async function POST(req: NextRequest) {
  const s = await requireSession().catch(() => null)
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = Crear.safeParse(await req.json().catch(() => null))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const cat = await crearCategoria(s.id, b.data.nombre, b.data.color ?? null, b.data.orden ?? 0)
  return NextResponse.json(cat, { status: 201 })
}

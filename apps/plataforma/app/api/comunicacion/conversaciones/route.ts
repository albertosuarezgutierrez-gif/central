import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { listarConversaciones, crearConversacion } from '@/lib/comunicacion'
import { z } from 'zod'

export async function GET() {
  const s = await requireSession().catch(() => null)
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json({ conversaciones: await listarConversaciones(s.id) })
}

const Nodo = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('cuenta') }),
  z.object({ tipo: z.literal('negocio'), negocioId: z.string().uuid(), nombre: z.string().optional() }),
  z.object({ tipo: z.literal('grupo'), grupoId: z.string().uuid(), nombre: z.string().optional() }),
  z.object({ tipo: z.literal('persona'), negocioId: z.string().uuid(), refPersona: z.string().min(1), rol: z.string().optional(), nombre: z.string().optional() }),
])

const Crear = z.object({
  autor: Nodo.optional(),
  destinatarios: z.array(Nodo).min(1),
  categoriaId: z.string().uuid().nullish(),
  titulo: z.string().max(200).nullish(),
  cuerpo: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const s = await requireSession().catch(() => null)
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = Crear.safeParse(await req.json().catch(() => null))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  try {
    const conv = await crearConversacion(s.id, {
      autor: b.data.autor ?? { tipo: 'cuenta' }, // por defecto, el dueño
      destinatarios: b.data.destinatarios,
      categoriaId: b.data.categoriaId ?? null,
      titulo: b.data.titulo ?? null,
      cuerpo: b.data.cuerpo,
    })
    return NextResponse.json(conv, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'No se pudo crear' }, { status: 400 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { crearSolicitud } from '@/lib/publico'

// Endpoint PÚBLICO (sin sesión): recibe una solicitud de alquiler desde la web.
// Crea un presupuesto; la oficina lo confirma. Sin cobro todavía (Stripe pendiente).
const schema = z.object({
  clienteNombre: z.string().min(1).max(120),
  clienteContacto: z.string().min(1).max(160),
  lugar: z.string().max(200).nullish(),
  fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notas: z.string().max(1000).nullish(),
  lineas: z
    .array(z.object({ materialId: z.string().uuid(), cantidad: z.number().int().positive() }))
    .min(1)
    .max(50),
})

export async function POST(req: NextRequest) {
  const p = schema.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Datos de la solicitud no válidos' }, { status: 400 })
  try {
    const { id } = await crearSolicitud(p.data)
    return NextResponse.json({ ok: true, id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

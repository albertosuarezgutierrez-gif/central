import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { confirmarPendiente, descartarPendiente } from '@/lib/agente-facturas/pendientes'
import { CATEGORIAS_GASTO, PROPS_GASTO } from '@/lib/sivra/constantes'

export const dynamic = 'force-dynamic'

const CATEGORIAS = new Set<string>(CATEGORIAS_GASTO)
const PROPIEDADES = new Set<string>(PROPS_GASTO.map((p) => p.id))

// PATCH /api/expenses/pendientes/[id] — confirma (y APRENDE la regla del proveedor).
// Body: { categoria?, propiedad? }. Omitir un campo = dejarlo como está; '' = vaciarlo a
// propósito (los gastos de la correduría van sin piso).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params

  const body = await req.json().catch(() => ({})) as { categoria?: string; propiedad?: string }

  // Lista blanca: lo que se confirma aquí crea una REGLA que a partir de la 2ª vez imputa sola,
  // así que un valor libre se propagaría a todas las facturas futuras del proveedor.
  if (body.categoria != null && body.categoria !== '' && !CATEGORIAS.has(body.categoria))
    return NextResponse.json({ error: 'categoría inválida' }, { status: 400 })
  if (body.propiedad != null && body.propiedad !== '' && !PROPIEDADES.has(body.propiedad))
    return NextResponse.json({ error: 'propiedad inválida' }, { status: 400 })

  const ok = await confirmarPendiente(id, {
    ...(body.categoria === undefined ? {} : { categoria: body.categoria }),
    ...(body.propiedad === undefined ? {} : { propiedad: body.propiedad }),
  })
  if (!ok) return NextResponse.json({ error: 'No encontrada o ya revisada' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/expenses/pendientes/[id] — descarta lo que no es un gasto nuestro.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  const ok = await descartarPendiente(id)
  if (!ok) return NextResponse.json({ error: 'No encontrada o ya revisada' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

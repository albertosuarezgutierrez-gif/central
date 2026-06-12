export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// POST — cierra el inventario físico y genera movimientos de ajuste
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id: inventarioId } = await params

  const { data: inv } = await supabase
    .from('materiales_inventario_fisico')
    .select('estado, restaurante_id')
    .eq('id', inventarioId).single()
  if (!inv) return NextResponse.json({ error: 'Inventario no encontrado' }, { status: 404 })
  if (inv.estado === 'cerrado') return NextResponse.json({ error: 'Ya está cerrado' }, { status: 409 })

  const { data: lineas } = await supabase
    .from('materiales_inventario_fisico_lineas')
    .select('id, material_id, cantidad_sistema, cantidad_contada, ajuste_generado')
    .eq('inventario_id', inventarioId)

  const ajustes = []
  for (const linea of lineas ?? []) {
    if (linea.ajuste_generado) continue
    const delta = linea.cantidad_contada - linea.cantidad_sistema
    if (delta === 0) continue

    const cantidadAbs = Math.abs(delta)
    const tipo = delta > 0 ? 'ajuste' : 'rotura'

    const { data: mat } = await supabase
      .from('materiales')
      .select('cantidad_total, cantidad_disponible')
      .eq('id', linea.material_id).eq('restaurante_id', rid).single()

    if (mat) {
      await supabase.from('materiales_movimientos').insert({
        restaurante_id: rid,
        material_id: linea.material_id,
        tipo,
        cantidad: cantidadAbs,
        notas: `Ajuste inventario físico #${inventarioId.slice(0, 8)}`,
        realizado_por: session.camarero_id ?? null,
        fecha: new Date().toISOString().slice(0, 10),
      })

      const newTotal = tipo === 'rotura'
        ? Math.max(0, (mat.cantidad_total ?? 0) - cantidadAbs)
        : (mat.cantidad_total ?? 0) + cantidadAbs
      const newDisp = tipo === 'rotura'
        ? Math.max(0, (mat.cantidad_disponible ?? 0) - cantidadAbs)
        : (mat.cantidad_disponible ?? 0) + cantidadAbs

      await supabase.from('materiales').update({
        cantidad_total: newTotal, cantidad_disponible: newDisp, updated_at: new Date().toISOString(),
      }).eq('id', linea.material_id).eq('restaurante_id', rid)
    }

    await supabase.from('materiales_inventario_fisico_lineas').update({ ajuste_generado: true }).eq('id', linea.id)
    ajustes.push({ material_id: linea.material_id, delta, tipo })
  }

  await supabase.from('materiales_inventario_fisico').update({ estado: 'cerrado' }).eq('id', inventarioId)

  return NextResponse.json({ ok: true, ajustes_generados: ajustes.length, ajustes })
}

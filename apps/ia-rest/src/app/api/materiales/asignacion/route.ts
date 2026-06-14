export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// Asignación / salida de material hacia un destino genérico (evento, hacienda, cliente, obra…).
// GET   — lista asignaciones (filtros: estado, personal_id, material_id) con datos del material
// POST  — crea asignación → descuenta stock disponible
// PATCH — { id, estado } cambia estado; al 'devolver' repone el stock de las unidades sanas

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const url = new URL(req.url)

  let q = supabase
    .from('materiales_asignacion')
    .select('id, material_id, destino_tipo, destino_ref, destino_nombre, cantidad, cantidad_devuelta, estado, personal_id, fecha_salida, fecha_devolucion, notas, created_at, material:materiales(nombre, categoria, coste_reposicion)')
    .eq('restaurante_id', rid)
    .order('created_at', { ascending: false })

  const estado = url.searchParams.get('estado')
  const personalId = url.searchParams.get('personal_id')
  const materialId = url.searchParams.get('material_id')
  if (estado) q = q.eq('estado', estado)
  if (personalId) q = q.eq('personal_id', personalId)
  if (materialId) q = q.eq('material_id', materialId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ asignaciones: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()

  const cantidad = Number(body.cantidad) || 0
  if (!body.material_id || cantidad <= 0) {
    return NextResponse.json({ error: 'material_id y cantidad (>0) requeridos' }, { status: 400 })
  }

  // Comprobar stock disponible
  const { data: mat } = await supabase
    .from('materiales')
    .select('cantidad_disponible')
    .eq('id', body.material_id).eq('restaurante_id', rid).single()
  if (!mat) return NextResponse.json({ error: 'Material no encontrado' }, { status: 404 })
  if ((mat.cantidad_disponible ?? 0) < cantidad) {
    return NextResponse.json({ error: `Stock insuficiente (disponible ${mat.cantidad_disponible ?? 0})` }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('materiales_asignacion')
    .insert({
      restaurante_id: rid,
      material_id: body.material_id,
      destino_tipo: body.destino_tipo ?? 'evento',
      destino_ref: body.destino_ref ?? null,
      destino_nombre: body.destino_nombre ?? null,
      cantidad,
      estado: body.estado === 'entregado' ? 'entregado' : 'reservado',
      personal_id: body.personal_id ?? null,
      fecha_salida: body.fecha_salida ?? null,
      notas: body.notas ?? null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase
    .from('materiales')
    .update({ cantidad_disponible: (mat.cantidad_disponible ?? 0) - cantidad, updated_at: new Date().toISOString() })
    .eq('id', body.material_id).eq('restaurante_id', rid)

  return NextResponse.json({ asignacion: data })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id, estado, destino_nombre, notas } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { data: asig } = await supabase
    .from('materiales_asignacion')
    .select('id, material_id, cantidad, cantidad_devuelta, estado')
    .eq('id', id).eq('restaurante_id', rid).single()
  if (!asig) return NextResponse.json({ error: 'Asignación no encontrada' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (destino_nombre !== undefined) updates.destino_nombre = destino_nombre
  if (notas !== undefined) updates.notas = notas

  // Devolución: repone el stock de las unidades NO ya devueltas y NO rotas.
  if (estado === 'devuelto' && asig.estado !== 'devuelto') {
    const { data: danos } = await supabase
      .from('materiales_dano')
      .select('cantidad')
      .eq('asignacion_id', id).eq('restaurante_id', rid)
    const rotas = (danos ?? []).reduce((s, d) => s + (Number(d.cantidad) || 0), 0)
    const sanas = Math.max(0, (asig.cantidad ?? 0) - (asig.cantidad_devuelta ?? 0) - rotas)
    if (sanas > 0) {
      const { data: mat } = await supabase
        .from('materiales').select('cantidad_disponible')
        .eq('id', asig.material_id).eq('restaurante_id', rid).single()
      if (mat) {
        await supabase.from('materiales')
          .update({ cantidad_disponible: (mat.cantidad_disponible ?? 0) + sanas, updated_at: new Date().toISOString() })
          .eq('id', asig.material_id).eq('restaurante_id', rid)
      }
    }
    updates.estado = 'devuelto'
    updates.cantidad_devuelta = (asig.cantidad_devuelta ?? 0) + sanas
    updates.fecha_devolucion = new Date().toISOString().slice(0, 10)
  } else if (estado && estado !== asig.estado) {
    updates.estado = estado
  }

  const { error } = await supabase
    .from('materiales_asignacion')
    .update(updates)
    .eq('id', id).eq('restaurante_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET  — ledger filtrable (material_id, tipo, fecha_desde, fecha_hasta, limit)
// POST — crea movimiento + actualiza snapshot en materiales

const TIPOS_VALIDOS = ['entrada', 'salida', 'devolucion', 'rotura', 'ajuste', 'transferencia']

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const url = new URL(req.url)

  let q = supabase
    .from('materiales_movimientos')
    .select(`
      id, material_id, unidad_id, tipo, cantidad,
      espacio_origen_id, espacio_destino_id,
      parent_tipo, parent_id, cliente_id,
      notas, realizado_por, fecha, created_at,
      material:materiales(nombre, categoria),
      espacio_origen:materiales_espacios!espacio_origen_id(nombre),
      espacio_destino:materiales_espacios!espacio_destino_id(nombre)
    `)
    .eq('restaurante_id', rid)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  const materialId = url.searchParams.get('material_id')
  const tipo = url.searchParams.get('tipo')
  const fechaDesde = url.searchParams.get('fecha_desde')
  const fechaHasta = url.searchParams.get('fecha_hasta')
  const limit = Math.min(500, Number(url.searchParams.get('limit') ?? 100))

  if (materialId) q = q.eq('material_id', materialId)
  if (tipo && TIPOS_VALIDOS.includes(tipo)) q = q.eq('tipo', tipo)
  if (fechaDesde) q = q.gte('fecha', fechaDesde)
  if (fechaHasta) q = q.lte('fecha', fechaHasta)
  q = q.limit(limit)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ movimientos: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()

  const {
    material_id, tipo, unidad_id,
    espacio_origen_id, espacio_destino_id,
    parent_tipo, parent_id, cliente_id, notas, fecha,
  } = body
  const cantidad = Number(body.cantidad)

  if (!material_id) return NextResponse.json({ error: 'material_id requerido' }, { status: 400 })
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json({ error: `tipo inválido (${TIPOS_VALIDOS.join('|')})` }, { status: 400 })
  }
  if (!(cantidad > 0)) return NextResponse.json({ error: 'cantidad debe ser > 0' }, { status: 400 })

  const { data: mat } = await supabase
    .from('materiales')
    .select('cantidad_total, cantidad_disponible')
    .eq('id', material_id).eq('restaurante_id', rid).single()
  if (!mat) return NextResponse.json({ error: 'Material no encontrado' }, { status: 404 })

  if ((tipo === 'salida' || tipo === 'rotura') && (mat.cantidad_disponible ?? 0) < cantidad) {
    return NextResponse.json(
      { error: `Stock insuficiente (disponible: ${mat.cantidad_disponible ?? 0})` },
      { status: 409 }
    )
  }

  let deltaTotal = 0
  let deltaDisponible = 0
  switch (tipo) {
    case 'entrada':      deltaTotal = cantidad;  deltaDisponible = cantidad;  break
    case 'salida':       deltaDisponible = -cantidad; break
    case 'devolucion':   deltaDisponible = cantidad;  break
    case 'rotura':       deltaTotal = -cantidad; deltaDisponible = -cantidad; break
    case 'ajuste':       deltaTotal = cantidad;  deltaDisponible = cantidad;  break
    case 'transferencia': break
  }

  const { data: mov, error: movErr } = await supabase
    .from('materiales_movimientos')
    .insert({
      restaurante_id: rid,
      material_id,
      unidad_id: unidad_id ?? null,
      tipo,
      cantidad,
      espacio_origen_id: espacio_origen_id ?? null,
      espacio_destino_id: espacio_destino_id ?? null,
      parent_tipo: parent_tipo ?? null,
      parent_id: parent_id ?? null,
      cliente_id: cliente_id ?? null,
      notas: notas ?? null,
      realizado_por: session.camarero_id ?? null,
      fecha: fecha ?? new Date().toISOString().slice(0, 10),
    })
    .select()
    .single()

  if (movErr) return NextResponse.json({ error: movErr.message }, { status: 500 })

  if (deltaTotal !== 0 || deltaDisponible !== 0) {
    await supabase
      .from('materiales')
      .update({
        cantidad_total: Math.max(0, (mat.cantidad_total ?? 0) + deltaTotal),
        cantidad_disponible: Math.max(0, (mat.cantidad_disponible ?? 0) + deltaDisponible),
        updated_at: new Date().toISOString(),
      })
      .eq('id', material_id).eq('restaurante_id', rid)
  }

  // Actualiza espacio_actual si hay transferencia con destino
  if (tipo === 'transferencia' && espacio_destino_id) {
    await supabase
      .from('materiales')
      .update({ espacio_actual_id: espacio_destino_id, updated_at: new Date().toISOString() })
      .eq('id', material_id).eq('restaurante_id', rid)
  }

  return NextResponse.json({ movimiento: mov })
}

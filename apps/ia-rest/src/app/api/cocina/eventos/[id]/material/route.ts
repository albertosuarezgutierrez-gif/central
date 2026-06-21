export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// Material (mesas/sillas/menaje) asociado a un EVENTO de cocina central.
// Enlace genérico, sin FK dura: materiales_asignacion.destino_tipo='evento',
// destino_ref = <cocina_eventos.id>, destino_nombre = nombre del evento.
// Así la "boda" lleva, sobre el MISMO evento, su cocina (recetas/APPCC) y su material.
//   GET    — material del evento + catálogo + kits (para el selector)
//   POST   — añade material suelto {material_id,cantidad} o un kit {kit_id,kit_cantidad}; descuenta stock
//   DELETE — quita una asignación reservada y repone stock

type SB = ReturnType<typeof createServerClient>

async function eventoDe(supabase: SB, rid: string, id: string) {
  const { data } = await supabase
    .from('cocina_eventos')
    .select('id, nombre, evento_id')
    .eq('id', id).eq('local_id', rid)
    .single()
  return data as { id: string; nombre: string; evento_id: string | null } | null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id } = await params

  const ev = await eventoDe(supabase, rid, id)
  if (!ev) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
  // La boda ancla el material en su ficha CRM (`eventos`) si existe; si no, en el evento de cocina.
  const anchor = ev.evento_id ?? id

  const [matRes, catRes, kitRes] = await Promise.all([
    supabase.from('materiales_asignacion')
      .select('id, material_id, cantidad, cantidad_devuelta, estado, created_at')
      .eq('restaurante_id', rid).eq('destino_tipo', 'evento').eq('destino_ref', anchor)
      .order('created_at', { ascending: true }),
    supabase.from('materiales')
      .select('id, nombre, categoria, cantidad_disponible, coste_reposicion')
      .eq('restaurante_id', rid).eq('activo', true)
      .order('nombre', { ascending: true }),
    supabase.from('materiales_kits')
      .select('id, nombre')
      .eq('restaurante_id', rid).eq('activo', true)
      .order('nombre', { ascending: true }),
  ])

  return NextResponse.json({
    evento: ev,
    material: matRes.data ?? [],
    catalogo: catRes.data ?? [],
    kits: kitRes.data ?? [],
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id } = await params

  const ev = await eventoDe(supabase, rid, id)
  if (!ev) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
  const anchor = ev.evento_id ?? id

  const body = await req.json()

  // Construir las líneas a reservar: un kit expandido, o un material suelto.
  let lineas: Array<{ material_id: string; cantidad: number }> = []
  if (body.kit_id) {
    const n = Number(body.kit_cantidad) || 1
    if (n <= 0) return NextResponse.json({ error: 'Cantidad de kit inválida' }, { status: 400 })
    const { data: items } = await supabase
      .from('materiales_kits_items')
      .select('material_id, cantidad')
      .eq('kit_id', body.kit_id)
    if (!items || items.length === 0) return NextResponse.json({ error: 'Kit sin items o no encontrado' }, { status: 404 })
    lineas = items.map((it: { material_id: string; cantidad: number }) => ({ material_id: it.material_id, cantidad: (it.cantidad || 0) * n }))
  } else if (body.material_id) {
    const c = Number(body.cantidad) || 0
    if (c <= 0) return NextResponse.json({ error: 'material_id y cantidad (>0) requeridos' }, { status: 400 })
    lineas = [{ material_id: body.material_id, cantidad: c }]
  } else {
    return NextResponse.json({ error: 'Indica material_id o kit_id' }, { status: 400 })
  }

  // Comprobar stock de TODAS las líneas antes de tocar nada.
  for (const ln of lineas) {
    const { data: mat } = await supabase
      .from('materiales').select('nombre, cantidad_disponible')
      .eq('id', ln.material_id).eq('restaurante_id', rid).single()
    if (!mat) return NextResponse.json({ error: 'Material no encontrado' }, { status: 404 })
    if ((mat.cantidad_disponible ?? 0) < ln.cantidad) {
      return NextResponse.json({ error: `Stock insuficiente de "${mat.nombre}" (disponible ${mat.cantidad_disponible ?? 0}, pides ${ln.cantidad})` }, { status: 409 })
    }
  }

  // Crear las asignaciones (estado 'reservado') y descontar stock.
  for (const ln of lineas) {
    await supabase.from('materiales_asignacion').insert({
      restaurante_id: rid,
      material_id: ln.material_id,
      destino_tipo: 'evento',
      destino_ref: anchor,
      destino_nombre: ev.nombre,
      cantidad: ln.cantidad,
      estado: 'reservado',
    })
    const { data: mat } = await supabase
      .from('materiales').select('cantidad_disponible')
      .eq('id', ln.material_id).eq('restaurante_id', rid).single()
    await supabase.from('materiales')
      .update({ cantidad_disponible: Math.max(0, (mat?.cantidad_disponible ?? 0) - ln.cantidad), updated_at: new Date().toISOString() })
      .eq('id', ln.material_id).eq('restaurante_id', rid)
  }

  return NextResponse.json({ ok: true, lineas: lineas.length })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id } = await params
  const { asignacion_id } = await req.json()
  if (!asignacion_id) return NextResponse.json({ error: 'asignacion_id requerido' }, { status: 400 })

  const ev = await eventoDe(supabase, rid, id)
  if (!ev) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
  const anchor = ev.evento_id ?? id

  const { data: asig } = await supabase
    .from('materiales_asignacion')
    .select('id, material_id, cantidad, cantidad_devuelta, estado')
    .eq('id', asignacion_id).eq('restaurante_id', rid).eq('destino_ref', anchor)
    .single()
  if (!asig) return NextResponse.json({ error: 'Asignación no encontrada' }, { status: 404 })
  if (asig.estado !== 'reservado') {
    return NextResponse.json({ error: 'Ya está en curso (entregada/devuelta); gestiónala desde Montaje' }, { status: 409 })
  }

  const restore = Math.max(0, (asig.cantidad ?? 0) - (asig.cantidad_devuelta ?? 0))
  if (restore > 0) {
    const { data: mat } = await supabase
      .from('materiales').select('cantidad_disponible')
      .eq('id', asig.material_id).eq('restaurante_id', rid).single()
    if (mat) {
      await supabase.from('materiales')
        .update({ cantidad_disponible: (mat.cantidad_disponible ?? 0) + restore, updated_at: new Date().toISOString() })
        .eq('id', asig.material_id).eq('restaurante_id', rid)
    }
  }

  await supabase.from('materiales_asignacion').delete().eq('id', asignacion_id).eq('restaurante_id', rid)
  return NextResponse.json({ ok: true })
}

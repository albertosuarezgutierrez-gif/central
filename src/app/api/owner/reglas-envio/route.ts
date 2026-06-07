export const dynamic = 'force-dynamic'

// ============================================================
// ia.rest · API /api/owner/reglas-envio
// CRUD de reglas de enrutamiento — v3: nombre, fallback,
// multi-zona, producto_ids, destino dual (KDS + impresora)
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'

function isOwner(req: NextRequest) {
  const s = getSession(req)
  return s && ['owner', 'admin', 'super_admin'].includes(s.rol)
}

export async function GET(req: NextRequest) {
  if (!isOwner(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const [reglas, impresoras, secciones, zonas, productos] = await Promise.all([
    supabase
      .from('reglas_envio')
      .select('*')
      .eq('local_id', rid)
      .order('es_fallback', { ascending: true })
      .order('prioridad', { ascending: false })
      .order('created_at'),
    supabase
      .from('impresoras')
      .select('id, nombre, seccion_id, activa, connection_type')
      .eq('local_id', rid)
      .eq('activa', true),
    supabase
      .from('secciones_cocina')
      .select('id, nombre, color_kds, icono')
      .eq('local_id', rid)
      .eq('activa', true)
      .order('orden'),
    supabase
      .from('zonas')
      .select('id, tipo, nombre')
      .eq('local_id', rid)
      .eq('activa', true),
    supabase
      .from('productos')
      .select('id, nombre, seccion, precio')
      .eq('local_id', rid)
      .eq('activo', true)
      .order('nombre'),
  ])

  const reglasNorm = (reglas.data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    zona_tipos: (r['zona_tipos'] && (r['zona_tipos'] as string[]).length > 0)
      ? r['zona_tipos']
      : (r['zona_tipo'] ? [r['zona_tipo'] as string] : []),
    seccion_ids: (r['seccion_ids'] && (r['seccion_ids'] as string[]).length > 0)
      ? r['seccion_ids']
      : (r['seccion_id'] ? [r['seccion_id'] as string] : []),
    producto_ids: (r['producto_ids'] as string[]) ?? [],
    es_fallback: r['es_fallback'] ?? false,
    nombre: r['nombre'] ?? null,
    destino_kds_ref: r['destino_kds_ref'] ?? null,
  }))

  return NextResponse.json({
    reglas: reglasNorm,
    impresoras: impresoras.data ?? [],
    secciones: secciones.data ?? [],
    zonas: zonas.data ?? [],
    productos: productos.data ?? [],
  })
}

export async function POST(req: NextRequest) {
  if (!isOwner(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const body = await req.json()
  const {
    nombre, zona_tipo, zona_tipos, seccion_ids, producto_ids,
    destino_tipo, destino_ref, destino_kds_ref, destino_nombre,
    prioridad, es_fallback, imprimir_al_marchar, impresora_pase_id,
    hora_desde, hora_hasta, tipos_ticket,
  } = body

  if (!destino_tipo || !destino_ref)
    return NextResponse.json({ error: 'destino_tipo y destino_ref son obligatorios' }, { status: 400 })

  const seccionIds: string[]    = Array.isArray(seccion_ids) ? seccion_ids : []
  const productoIds: string[]   = Array.isArray(producto_ids) ? producto_ids : []
  const zonaTipos: string[]     = Array.isArray(zona_tipos) ? zona_tipos : (zona_tipo ? [zona_tipo] : [])
  const tiposTicket: string[]   = Array.isArray(tipos_ticket) && tipos_ticket.length > 0
    ? tipos_ticket : ['comanda']

  const supabase = createServerClient()
  const { data, error } = await supabase.from('reglas_envio').insert({
    local_id:      rid,
    nombre:              nombre || null,
    zona_tipo:           zonaTipos.length === 1 ? zonaTipos[0] : null,
    zona_tipos:          zonaTipos,
    seccion_ids:         seccionIds,
    seccion_id:          seccionIds.length === 1 ? seccionIds[0] : null,
    producto_ids:        productoIds,
    destino_tipo,        destino_ref,
    destino_kds_ref:     destino_kds_ref || null,
    destino_nombre:      destino_nombre || null,
    prioridad:           prioridad ?? 5,
    es_fallback:         es_fallback ?? false,
    imprimir_al_marchar: tiposTicket.includes('marchar'),
    impresora_pase_id:   impresora_pase_id || null,
    hora_desde:          hora_desde || null,
    hora_hasta:          hora_hasta || null,
    tipos_ticket:        tiposTicket,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  if (!isOwner(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const allowed = [
    'nombre', 'activa', 'prioridad', 'es_fallback',
    'destino_tipo', 'destino_ref', 'destino_kds_ref', 'destino_nombre',
    'zona_tipo', 'zona_tipos', 'seccion_id', 'seccion_ids', 'producto_ids',
    'imprimir_al_marchar', 'impresora_pase_id', 'hora_desde', 'hora_hasta',
    'tipos_ticket',
  ]
  const update: Record<string, unknown> = {}
  for (const k of allowed) if (k in fields) update[k] = fields[k]
  if ('seccion_ids' in fields) update['seccion_id'] = (fields.seccion_ids as string[]).length === 1 ? (fields.seccion_ids as string[])[0] : null
  if ('zona_tipos' in fields) update['zona_tipo'] = (fields.zona_tipos as string[]).length === 1 ? (fields.zona_tipos as string[])[0] : null
  // Mantener sync imprimir_al_marchar cuando se actualiza tipos_ticket
  if ('tipos_ticket' in fields) {
    update['imprimir_al_marchar'] = (fields.tipos_ticket as string[]).includes('marchar')
  }

  const supabase = createServerClient()
  const { data, error } = await supabase.from('reglas_envio').update(update).eq('id', id).eq('local_id', rid).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  if (!isOwner(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = createServerClient()
  const { error } = await supabase.from('reglas_envio').delete().eq('id', id).eq('local_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

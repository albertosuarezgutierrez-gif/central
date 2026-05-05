// ============================================================
// ia.rest · API /api/owner/reglas-envio
// CRUD de reglas de enrutamiento para el panel owner
// v2: multi-sección (seccion_ids[]), horario, imprimir al marchar
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

  const [reglas, impresoras, secciones, zonas] = await Promise.all([
    supabase.from('reglas_envio').select('*').eq('restaurante_id', rid).order('prioridad', { ascending: false }).order('created_at'),
    supabase.from('impresoras').select('id, nombre, seccion_id, activa, connection_type').eq('restaurante_id', rid).eq('activa', true),
    supabase.from('secciones_cocina').select('id, nombre, color_kds, icono').eq('restaurante_id', rid).eq('activa', true).order('orden'),
    supabase.from('zonas').select('id, tipo, nombre').eq('restaurante_id', rid).eq('activa', true),
  ])

  const reglasNorm = (reglas.data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    seccion_ids: (r['seccion_ids'] && (r['seccion_ids'] as string[]).length > 0)
      ? r['seccion_ids'] as string[]
      : (r['seccion_id'] ? [r['seccion_id'] as string] : []),
  }))

  return NextResponse.json({ reglas: reglasNorm, impresoras: impresoras.data ?? [], secciones: secciones.data ?? [], zonas: zonas.data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!isOwner(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const body = await req.json()
  const { zona_tipo, seccion_ids, destino_tipo, destino_ref, destino_nombre, prioridad, imprimir_al_marchar, impresora_pase_id, hora_desde, hora_hasta } = body

  if (!destino_tipo || !destino_ref) return NextResponse.json({ error: 'destino_tipo y destino_ref son obligatorios' }, { status: 400 })

  const seccionIds: string[] = Array.isArray(seccion_ids) ? seccion_ids : []
  const seccionIdLegacy = seccionIds.length === 1 ? seccionIds[0] : null

  const supabase = createServerClient()
  const { data, error } = await supabase.from('reglas_envio').insert({
    restaurante_id: rid,
    zona_tipo: zona_tipo || null,
    seccion_ids: seccionIds,
    seccion_id: seccionIdLegacy,
    destino_tipo, destino_ref,
    destino_nombre: destino_nombre || null,
    prioridad: prioridad ?? 5,
    imprimir_al_marchar: imprimir_al_marchar ?? false,
    impresora_pase_id: impresora_pase_id || null,
    hora_desde: hora_desde || null,
    hora_hasta: hora_hasta || null,
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

  const allowed = ['activa', 'prioridad', 'destino_tipo', 'destino_ref', 'destino_nombre', 'zona_tipo', 'seccion_id', 'seccion_ids', 'imprimir_al_marchar', 'impresora_pase_id', 'hora_desde', 'hora_hasta']
  const update: Record<string, unknown> = {}
  for (const k of allowed) if (k in fields) update[k] = fields[k]
  if ('seccion_ids' in fields) {
    const ids = fields.seccion_ids as string[]
    update['seccion_id'] = ids.length === 1 ? ids[0] : null
  }

  const supabase = createServerClient()
  const { data, error } = await supabase.from('reglas_envio').update(update).eq('id', id).eq('restaurante_id', rid).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  if (!isOwner(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = createServerClient()
  const { error } = await supabase.from('reglas_envio').delete().eq('id', id).eq('restaurante_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ============================================================
// ia.rest · API /api/owner/reglas-envio
// CRUD de reglas de enrutamiento para el panel owner
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'

function isOwner(req: NextRequest) {
  const s = getSession(req)
  return s && ['owner', 'admin', 'super_admin'].includes(s.rol)
}

// ── GET — listar reglas + catálogos ──────────────────────────
export async function GET(req: NextRequest) {
  if (!isOwner(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const [reglas, impresoras, secciones, zonas] = await Promise.all([
    supabase
      .from('reglas_envio')
      .select('*')
      .eq('restaurante_id', rid)
      .order('prioridad', { ascending: false })
      .order('created_at'),
    supabase
      .from('impresoras')
      .select('id, nombre, seccion_id, activa, connection_type')
      .eq('restaurante_id', rid)
      .eq('activa', true),
    supabase
      .from('secciones_cocina')
      .select('id, nombre, color_kds, icono')
      .eq('restaurante_id', rid)
      .eq('activa', true)
      .order('orden'),
    supabase
      .from('zonas')
      .select('id, tipo, nombre')
      .eq('restaurante_id', rid)
      .eq('activa', true),
  ])

  return NextResponse.json({
    reglas:     reglas.data     ?? [],
    impresoras: impresoras.data ?? [],
    secciones:  secciones.data  ?? [],
    zonas:      zonas.data      ?? [],
  })
}

// ── POST — crear regla ────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!isOwner(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const body = await req.json()
  const { zona_tipo, seccion_id, destino_tipo, destino_ref, destino_nombre, prioridad } = body

  if (!destino_tipo || !destino_ref) {
    return NextResponse.json({ error: 'destino_tipo y destino_ref son obligatorios' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('reglas_envio')
    .insert({
      restaurante_id: rid,
      zona_tipo:      zona_tipo   || null,
      seccion_id:     seccion_id  || null,
      destino_tipo,
      destino_ref,
      destino_nombre: destino_nombre || null,
      prioridad:      prioridad ?? 5,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ── PATCH — actualizar regla ──────────────────────────────────
export async function PATCH(req: NextRequest) {
  if (!isOwner(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const allowed = ['activa', 'prioridad', 'destino_tipo', 'destino_ref',
                   'destino_nombre', 'zona_tipo', 'seccion_id']
  const update: Record<string, unknown> = {}
  for (const k of allowed) if (k in fields) update[k] = fields[k]

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('reglas_envio')
    .update(update)
    .eq('id', id)
    .eq('restaurante_id', rid)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ── DELETE — eliminar regla ───────────────────────────────────
export async function DELETE(req: NextRequest) {
  if (!isOwner(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = createServerClient()
  const { error } = await supabase
    .from('reglas_envio')
    .delete()
    .eq('id', id)
    .eq('restaurante_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

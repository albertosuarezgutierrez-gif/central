// GET  /api/mensajes — últimos mensajes del turno activo
// POST /api/mensajes — enviar mensaje
// PATCH /api/mensajes — marcar como leído
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export const dynamic = 'force-dynamic'

// GET — obtiene mensajes del turno activo (últimos 50)
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const turnoId = req.nextUrl.searchParams.get('turno_id')

  let q = supabase
    .from('mensajes_turno')
    .select('id,rol_origen,nombre_origen,rol_destino,destinatario_id,tipo,texto,mesa_ref,leido_por,created_at')
    .eq('restaurante_id', rid)
    .order('created_at', { ascending: false })
    .limit(50)

  if (turnoId) q = q.eq('turno_id', turnoId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ mensajes: (data ?? []).reverse() })
}

// POST — enviar mensaje
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { texto, rol_destino = 'todos', destinatario_id, mesa_ref, turno_id, tipo = 'texto' } = await req.json()

  if (!texto?.trim()) return NextResponse.json({ error: 'texto requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('mensajes_turno')
    .insert({
      restaurante_id: rid,
      turno_id:       turno_id ?? null,
      camarero_id:    session.id,
      rol_origen:     session.rol,
      nombre_origen:  session.nombre,
      rol_destino,
      destinatario_id: destinatario_id ?? null,
      tipo,
      texto: texto.trim(),
      mesa_ref: mesa_ref ?? null,
      leido_por: [session.id],  // emisor ya lo ha leído
    })
    .select('id,created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 })
}

// PATCH — marcar como leído
export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  // Añadir camarero_id al array leido_por si no está ya
  await supabase.rpc('marcar_mensaje_leido', {
    p_mensaje_id:   id,
    p_camarero_id:  session.id,
    p_restaurante_id: rid,
  })

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export const dynamic = 'force-dynamic'

// GET — devuelve novedades globales + las del restaurante, ordenadas por fecha DESC
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('manual_voz_novedades')
    .select('*')
    .or(`restaurante_id.is.null,restaurante_id.eq.${rid}`)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ novedades: data ?? [] })
}

// POST — el dueño añade una novedad local para su equipo
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['owner', 'super_admin'].includes(session.rol)) {
    return NextResponse.json({ error: 'Solo el dueño puede añadir novedades' }, { status: 403 })
  }

  const rid = getRestauranteId(req)
  const body = await req.json()
  const { titulo, descripcion, ejemplo_antes, ejemplo_despues, rol_afectado } = body

  if (!titulo?.trim()) {
    return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Obtener la versión más reciente para asignar automáticamente
  const { data: ultima } = await supabase
    .from('manual_voz_novedades')
    .select('version')
    .eq('local_id', rid)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Versión local: "local-YYYY-MM-DD"
  const version = `local-${new Date().toISOString().slice(0, 10)}`
  void ultima

  const { data, error } = await supabase
    .from('manual_voz_novedades')
    .insert({
      version,
      titulo: titulo.trim(),
      descripcion: descripcion?.trim() || null,
      ejemplo_antes: ejemplo_antes?.trim() || null,
      ejemplo_despues: ejemplo_despues?.trim() || null,
      rol_afectado: rol_afectado || 'todos',
      restaurante_id: rid,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, novedad: data }, { status: 201 })
}

// DELETE — el dueño elimina una novedad local suya
export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['owner', 'super_admin'].includes(session.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const rid = getRestauranteId(req)
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = createServerClient()

  const { error } = await supabase
    .from('manual_voz_novedades')
    .delete()
    .eq('id', id)
    .eq('local_id', rid) // Solo puede borrar las suyas, nunca las globales

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

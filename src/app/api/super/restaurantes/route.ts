import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function getSession(req: NextRequest) {
  const header = req.headers.get('x-ia-session')
  if (!header) return null
  try { return JSON.parse(header) } catch { return null }
}

// GET /api/super/restaurantes — lista todos con métricas
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const supabase = createServerClient()

  // Pasar contexto de super_admin para que is_super_admin() y RLS funcionen
  await supabase.rpc('set_config', { key: 'app.camarero_id', value: session.id, is_local: true }).catch(() => {})

  const { data, error } = await supabase.rpc('super_get_all_restaurantes')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Normalizar al mismo formato que esperaba el frontend
  const restaurantes = (data ?? []).map((r: any) => ({
    ...r,
    camareros: [{ count: Number(r.num_camareros) }],
    mesas:     [{ count: Number(r.num_mesas) }],
    comandas:  [{ count: Number(r.num_comandas) }],
  }))

  return NextResponse.json({ restaurantes })
}

// POST /api/super/restaurantes — crear nuevo restaurante
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = await req.json()
  const { nombre, slug, codigo_acceso, plan = 'starter', ciudad = 'Madrid' } = body

  if (!nombre || !slug || !codigo_acceso) {
    return NextResponse.json({ error: 'nombre, slug y codigo_acceso son obligatorios' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Crear restaurante
  const { data: rest, error: restError } = await supabase
    .from('restaurantes')
    .insert({ nombre, slug: slug.toLowerCase(), codigo_acceso: codigo_acceso.toUpperCase(), plan, ciudad })
    .select()
    .single()

  if (restError) return NextResponse.json({ error: restError.message }, { status: 500 })

  // Crear camarero admin por defecto (PIN 0000)
  const { error: camError } = await supabase
    .from('camareros')
    .insert({
      nombre: 'Admin',
      pin: '0000',
      rol: 'jefe_sala',
      restaurante_id: rest.id,
      activo: true,
    })

  if (camError) {
    // No es fatal — el restaurante ya fue creado
    console.error('Error creando camarero default:', camError.message)
  }

  // Crear turno inicial
  await supabase.from('turnos').insert({
    nombre: 'Turno 1',
    restaurante_id: rest.id,
    estado: 'activo',
  })

  return NextResponse.json({ restaurante: rest }, { status: 201 })
}

// PATCH /api/super/restaurantes — actualizar restaurante
export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('restaurantes')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ restaurante: data })
}

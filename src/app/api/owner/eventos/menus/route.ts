import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET — listar menús del restaurante
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const menu_id = searchParams.get('id')

  if (menu_id) {
    // Detalle completo de un menú con pases e items
    const { data, error } = await supabase
      .from('menus_evento')
      .select(`
        *,
        pases:menu_evento_pases(
          id, numero_pase, nombre, hora_offset_min, descripcion,
          items:menu_evento_items(
            id, nombre, descripcion, cantidad_por_persona,
            es_opcional, grupo_opcion, aplica_infantil, alergenos,
            producto_id, productos(id, nombre, precio)
          )
        )
      `)
      .eq('id', menu_id)
      .eq('restaurante_id', restauranteId)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ menu: data })
  }

  // Listado de menús
  const { data, error } = await supabase
    .from('menus_evento')
    .select(`
      id, nombre, descripcion, precio_por_persona, activo,
      temporada, tipo_evento, min_comensales, max_comensales,
      tiene_menu_infantil, precio_infantil
    `)
    .eq('restaurante_id', restauranteId)
    .eq('activo', true)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ menus: data })
}

// POST — crear menú con sus pases e items
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const {
    nombre, descripcion, precio_por_persona, temporada,
    tipo_evento, min_comensales, max_comensales,
    tiene_menu_infantil, precio_infantil,
    pases // array de { nombre, numero_pase, hora_offset_min, descripcion, items[] }
  } = body

  if (!nombre) return NextResponse.json({ error: 'Falta nombre del menú' }, { status: 400 })

  const { data: rest } = await supabase
    .from('restaurantes').select('cuenta_id').eq('id', restauranteId).single()

  // Crear menú
  const { data: menu, error: menuErr } = await supabase
    .from('menus_evento')
    .insert({
      restaurante_id: restauranteId,
      cuenta_id: rest?.cuenta_id,
      nombre, descripcion, precio_por_persona, temporada,
      tipo_evento, min_comensales, max_comensales,
      tiene_menu_infantil, precio_infantil,
    })
    .select().single()

  if (menuErr) return NextResponse.json({ error: menuErr.message }, { status: 500 })

  // Crear pases si vienen
  if (pases?.length) {
    for (const pase of pases) {
      const { data: paseCreado } = await supabase
        .from('menu_evento_pases')
        .insert({
          menu_id: menu.id,
          restaurante_id: restauranteId,
          numero_pase: pase.numero_pase,
          nombre: pase.nombre,
          hora_offset_min: pase.hora_offset_min ?? 0,
          descripcion: pase.descripcion,
        })
        .select().single()

      // Crear items del pase
      if (paseCreado && pase.items?.length) {
        await supabase.from('menu_evento_items').insert(
          pase.items.map((item: {
            nombre: string; descripcion?: string; cantidad_por_persona?: number
            es_opcional?: boolean; grupo_opcion?: string; aplica_infantil?: boolean
            alergenos?: string[]; producto_id?: string
          }) => ({
            pase_id: paseCreado.id,
            menu_id: menu.id,
            restaurante_id: restauranteId,
            nombre: item.nombre,
            descripcion: item.descripcion,
            cantidad_por_persona: item.cantidad_por_persona ?? 1,
            es_opcional: item.es_opcional ?? false,
            grupo_opcion: item.grupo_opcion,
            aplica_infantil: item.aplica_infantil ?? true,
            alergenos: item.alergenos ?? [],
            producto_id: item.producto_id,
          }))
        )
      }
    }
  }

  return NextResponse.json({ menu }, { status: 201 })
}

// PUT — actualizar menú
export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const { data, error } = await supabase
    .from('menus_evento').update(updates)
    .eq('id', id).eq('restaurante_id', restauranteId)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ menu: data })
}

// DELETE — desactivar menú
export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { id } = await req.json()
  await supabase.from('menus_evento').update({ activo: false })
    .eq('id', id).eq('restaurante_id', restauranteId)

  return NextResponse.json({ ok: true })
}

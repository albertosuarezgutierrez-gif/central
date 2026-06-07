import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET /api/owner/eventos/menus/[id]/bloques — bloques con opciones
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('menu_evento_bloques')
    .select(`
      *,
      opciones:menu_evento_opciones(
        id, nombre, descripcion, precio_coste, precio_venta,
        es_opcion_base, precio_diferencial, alergenos, activo,
        producto:productos(id, nombre, precio_compra_medio, precio_venta)
      )
    `)
    .eq('menu_evento_id', id)
    .eq('local_id', restauranteId)
    .order('orden')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bloques: data })
}

// POST — crear o reemplazar bloques completos (bulk)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { bloques } = await req.json()
  if (!Array.isArray(bloques)) return NextResponse.json({ error: 'bloques debe ser array' }, { status: 400 })

  // Borrar bloques existentes del menú
  await supabase.from('menu_evento_bloques').delete()
    .eq('menu_evento_id', id).eq('local_id', restauranteId)

  // Insertar nuevos bloques con sus opciones
  const resultados: Record<string, unknown>[] = []
  for (let i = 0; i < bloques.length; i++) {
    const b = bloques[i]
    const { data: bloque, error: bErr } = await supabase
      .from('menu_evento_bloques')
      .insert({
        local_id: restauranteId,
        menu_evento_id: id,
        nombre: b.nombre,
        orden: i,
        es_upgrade: !!b.es_upgrade,
        precio_diferencial: b.precio_diferencial || 0,
        apto_ninos: b.apto_ninos !== false
      })
      .select()
      .single()

    if (bErr) continue

    if (b.opciones?.length) {
      await supabase.from('menu_evento_opciones').insert(
        b.opciones.map((o: {
          nombre: string; descripcion?: string; producto_id?: string;
          precio_coste?: number; precio_venta?: number;
          es_opcion_base?: boolean; precio_diferencial?: number; alergenos?: string[]
        }) => ({
          local_id: restauranteId,
          bloque_id: bloque.id,
          nombre: o.nombre,
          descripcion: o.descripcion,
          producto_id: o.producto_id || null,
          precio_coste: o.precio_coste || 0,
          precio_venta: o.precio_venta || 0,
          es_opcion_base: o.es_opcion_base !== false,
          precio_diferencial: o.precio_diferencial || 0,
          alergenos: o.alergenos || []
        }))
      )
    }

    resultados.push(bloque)
  }

  return NextResponse.json({ bloques: resultados, ok: true })
}

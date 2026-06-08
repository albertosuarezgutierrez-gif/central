import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// POST /api/owner/eventos/menus/aplicar
// Aplica un menú plantilla a un evento concreto
// Crea los pases automáticamente + calcula lista de compra
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { evento_id, menu_id, hora_inicio } = await req.json()

  if (!evento_id || !menu_id) {
    return NextResponse.json({ error: 'Falta evento_id o menu_id' }, { status: 400 })
  }

  // Verificar que el evento y el menú pertenecen al restaurante
  const [{ data: evento }, { data: menu }] = await Promise.all([
    supabase.from('eventos').select('id, aforo_previsto, cliente_nombre').eq('id', evento_id).eq('local_id', restauranteId).single(),
    supabase.from('menus_evento').select('id, nombre, precio_por_persona').eq('id', menu_id).eq('local_id', restauranteId).single(),
  ])

  if (!evento) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
  if (!menu) return NextResponse.json({ error: 'Menú no encontrado' }, { status: 404 })

  // Aplicar menú (crea pases automáticamente)
  const { data: pases_creados, error: applyErr } = await supabase.rpc('aplicar_menu_a_evento', {
    p_evento_id: evento_id,
    p_menu_id: menu_id,
    p_hora_inicio: hora_inicio ?? '13:00',
  })

  if (applyErr) return NextResponse.json({ error: applyErr.message }, { status: 500 })

  // Calcular precio total si el menú tiene precio/persona
  if (menu.precio_por_persona && evento.aforo_previsto) {
    const precio_total = menu.precio_por_persona * evento.aforo_previsto
    await supabase.from('eventos').update({
      precio_por_persona: menu.precio_por_persona,
      precio_total,
      menu_descripcion: menu.nombre,
    }).eq('id', evento_id)
  }

  // Calcular lista de compra
  const { data: lista_compra, error: compraErr } = await supabase.rpc('calcular_compra_evento', {
    p_evento_id: evento_id,
  })

  if (compraErr) {
    // No es crítico, seguimos
    console.warn('Error calculando lista compra:', compraErr)
  }

  // Cargar pases creados para devolver
  const { data: pases } = await supabase
    .from('evento_pases')
    .select('*, items:evento_pase_items(*)')
    .eq('evento_id', evento_id)
    .order('numero_pase')

  return NextResponse.json({
    ok: true,
    pases_creados,
    pases,
    lista_compra: lista_compra ?? [],
    precio_total: menu.precio_por_persona ? menu.precio_por_persona * evento.aforo_previsto : null,
    resumen: {
      menu: menu.nombre,
      evento: evento.cliente_nombre,
      aforo: evento.aforo_previsto,
      ingredientes_necesarios: lista_compra?.length ?? 0,
    }
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

// POST /api/comanda — comanda manual (sin voz)
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const rid = getRestauranteId(req)
    const {
      mesa_id, items, tipo = 'comanda',
      num_comensales,
      incluir_servicio = true,
    } = await req.json()

    if (!mesa_id || !items?.length) {
      return NextResponse.json({ error: 'mesa_id e items requeridos' }, { status: 400 })
    }

    const sessionHeader = req.headers.get('x-ia-session')
    let camarero_id = ''
    try { camarero_id = JSON.parse(sessionHeader ?? '{}').id ?? '' } catch {}

    const { data: turno } = await supabase
      .from('turnos').select('id')
      .eq('restaurante_id', rid).eq('estado', 'activo')
      .single()
    const turno_id = turno?.id ?? ''
    if (!turno_id) {
      return NextResponse.json({ error: 'Sin turno activo' }, { status: 400 })
    }

    // ¿Primera comanda de esta mesa en el turno?
    const { data: esPrimera } = await supabase
      .rpc('es_primera_comanda', { p_mesa_id: mesa_id, p_turno_id: turno_id })

    // Config servicio del restaurante
    const { data: rest } = await supabase
      .from('restaurantes')
      .select('servicio_activo,servicio_precio,servicio_nombre,servicio_auto')
      .eq('id', rid).single()

    const hacerServicio =
      esPrimera && incluir_servicio &&
      rest?.servicio_activo && rest?.servicio_auto &&
      num_comensales > 0

    // Crear comanda
    const { data: comanda, error: cmdErr } = await supabase
      .from('comandas')
      .insert({
        mesa_id, camarero_id, turno_id,
        tipo, estado: tipo === 'cuenta' ? 'nueva' : 'en_cocina',
        restaurante_id: rid,
        ...(num_comensales ? { num_comensales } : {}),
      })
      .select().single()
    if (cmdErr) throw cmdErr

    // Items base
    const itemsToInsert = items.map((it: {
      nombre: string; cantidad: number; notas?: string
      producto_id?: string; precio_unitario?: number
      formato_id?: string; formato_nombre?: string; seccion_id?: string
    }) => ({
      comanda_id: comanda.id,
      nombre: it.nombre, cantidad: it.cantidad,
      notas: it.notas ?? null,
      producto_id: it.producto_id ?? null,
      precio_unitario: it.precio_unitario ?? null,
      formato_id: it.formato_id ?? null,
      formato_nombre: it.formato_nombre ?? null,
      seccion_id: it.seccion_id ?? null,
      restaurante_id: rid,
    }))

    // Línea de servicio en comanda
    if (hacerServicio) {
      itemsToInsert.unshift({
        comanda_id: comanda.id,
        nombre: `${rest.servicio_nombre} (${num_comensales} pax)`,
        cantidad: num_comensales,
        notas: null,
        producto_id: null,
        precio_unitario: rest.servicio_precio,
        formato_id: null, formato_nombre: null, seccion_id: null,
        restaurante_id: rid,
      })
    }

    await supabase.from('comanda_items').insert(itemsToInsert)

    // Estado mesa + zona_id
    const mesaEstados: Record<string, string> = {
      comanda: 'activa', marchar: 'marchar', cuenta: 'cuenta', aviso: 'aviso', '86': 'activa'
    }
    const { data: mesaData } = await supabase
      .from('mesas').select('zona_id,codigo,zonas(nombre)').eq('id', mesa_id).single()

    await supabase.from('mesas').update({
      estado: mesaEstados[tipo] ?? 'activa',
      ultima_comanda: new Date().toISOString(),
      camarero_id,
    }).eq('id', mesa_id)

    // Tarea de servicio para running
    if (hacerServicio && mesaData?.zona_id) {
      const { data: runningId } = await supabase
        .rpc('get_running_de_zona', {
          p_zona_id: mesaData.zona_id,
          p_restaurante_id: rid,
        })

      await supabase.from('marchar_log').insert({
        restaurante_id: rid,
        receptor_id:    runningId || camarero_id,
        mesa_id,
        mesa_codigo:    mesaData.codigo ?? '?',
        zona_nombre:    (mesaData.zonas as { nombre?: string } | null)?.nombre ?? null,
        tipo:           'servicio',
        num_comensales,
        items_resumen:  `${rest.servicio_nombre} · ${num_comensales} pax`,
        items_detalle:  [
          { nombre: 'Pan / aceite',           cantidad: num_comensales },
          { nombre: 'Cubiertos completos',     cantidad: num_comensales },
          { nombre: 'Agua / carta de bebidas', cantidad: 1 },
        ],
        recogido: false,
      })
    }

    return NextResponse.json({
      ok: true, comanda_id: comanda.id,
      numero_ticket: comanda.numero_ticket,
      servicio_creado: hacerServicio,
    })
  } catch (err) {
    console.error('[COMANDA MANUAL]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    )
  }
}

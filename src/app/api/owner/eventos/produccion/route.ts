import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)

  const hoy = new Date()
  const en7 = new Date(hoy); en7.setDate(hoy.getDate() + 7)
  const desde = searchParams.get('desde') ?? hoy.toISOString().slice(0, 10)
  const hasta = searchParams.get('hasta') ?? en7.toISOString().slice(0, 10)
  const modo = searchParams.get('modo') ?? 'local'

  let evQuery = supabase
    .from('eventos')
    .select(`id, cliente_nombre, tipo, fecha_evento, hora_inicio,
      aforo_confirmado, aforo_previsto, factor_escandallo, estado, restaurante_id,
      restaurantes!inner(nombre)`)
    .gte('fecha_evento', desde).lte('fecha_evento', hasta)
    .neq('estado', 'cancelado').order('fecha_evento')

  if (modo === 'grupo') {
    const { data: myRest } = await supabase.from('restaurantes').select('cuenta_id').eq('id', restauranteId).single()
    if (myRest?.cuenta_id) {
      const { data: grupo } = await supabase.from('restaurantes').select('id').eq('cuenta_id', myRest.cuenta_id)
      evQuery = evQuery.in('restaurante_id', (grupo ?? []).map(r => r.id))
    } else { evQuery = evQuery.eq('restaurante_id', restauranteId) }
  } else { evQuery = evQuery.eq('restaurante_id', restauranteId) }

  const { data: eventos } = await evQuery
  if (!eventos?.length) {
    return NextResponse.json({ desde, hasta, eventos: [], lista_compra: [], por_proveedor: {}, total_articulos: 0, total_coste_estimado: 0, articulos_sin_stock: 0 })
  }

  const necesidades: Record<string, {
    articulo_id: string; nombre: string; unidad: string
    cantidad_total: number; stock_actual: number; coste_unitario: number; coste_total: number
    proveedor_id: string | null; proveedor_nombre: string | null; proveedor_email: string | null
    por_evento: { evento_id: string; cliente: string; fecha: string; cantidad: number }[]
  }> = {}

  const eventosMapeados: {
    id: string; cliente_nombre: string; tipo: string; fecha_evento: string
    hora_inicio: string | null; aforo: number; estado: string
    restaurante_nombre: string; tiene_menu: boolean; num_pases: number; num_items: number
  }[] = []

  for (const ev of eventos) {
    const aforo = Number(ev.aforo_confirmado ?? ev.aforo_previsto ?? 1)
    const factor = Number(ev.factor_escandallo ?? 1)
    const restData = ev.restaurantes as { nombre: string } | { nombre: string }[] | null
    const restNombre = Array.isArray(restData) ? restData[0]?.nombre : restData?.nombre ?? ''

    const { data: items } = await supabase
      .from('evento_pase_items')
      .select(`id, nombre, cantidad, producto_id, pase:evento_pases!inner(numero_pase, nombre)`)
      .eq('evento_id', ev.id)

    const tieneMenu = !!(items?.length)
    const numPases = new Set(items?.map(i => (i.pase as unknown as { numero_pase: number } | null)?.numero_pase)).size

    eventosMapeados.push({
      id: ev.id, cliente_nombre: ev.cliente_nombre, tipo: ev.tipo,
      fecha_evento: ev.fecha_evento, hora_inicio: ev.hora_inicio, aforo, estado: ev.estado,
      restaurante_nombre: restNombre, tiene_menu: tieneMenu, num_pases: numPases, num_items: items?.length ?? 0,
    })

    if (!items?.length) continue
    const productoIds = [...new Set(items.filter(i => i.producto_id).map(i => i.producto_id as string))]
    if (!productoIds.length) continue

    const { data: escandallos } = await supabase
      .from('escandallos')
      .select(`id, producto_id, rendimiento,
        ingredientes:escandallo_ingredientes(cantidad,
          articulo:stock_articulos(id, nombre, unidad_compra, coste_unitario, stock_actual,
            proveedor_id, proveedor_nombre, proveedor_email))`)
      .in('producto_id', productoIds).eq('restaurante_id', restauranteId).eq('activo', true)

    if (!escandallos?.length) continue
    const escByProducto: Record<string, typeof escandallos[0]> = {}
    for (const esc of escandallos) escByProducto[esc.producto_id] = esc

    for (const item of items) {
      if (!item.producto_id) continue
      const esc = escByProducto[item.producto_id]; if (!esc) continue
      const rendimiento = Number(esc.rendimiento ?? 1)
      const cantItem = Number(item.cantidad ?? 1)

      for (const ing of (esc.ingredientes ?? []) as { cantidad: number; articulo: unknown }[]) {
        const art = (Array.isArray(ing.articulo) ? ing.articulo[0] : ing.articulo) as {
          id: string; nombre: string; unidad_compra: string; coste_unitario: number; stock_actual: number
          proveedor_id: string | null; proveedor_nombre: string | null; proveedor_email: string | null
        } | null
        if (!art) continue
        const cantNecesaria = (ing.cantidad * (cantItem / rendimiento)) * aforo * factor
        if (!necesidades[art.id]) {
          necesidades[art.id] = {
            articulo_id: art.id, nombre: art.nombre, unidad: art.unidad_compra ?? 'ud',
            cantidad_total: 0, stock_actual: Number(art.stock_actual ?? 0),
            coste_unitario: Number(art.coste_unitario ?? 0), coste_total: 0,
            proveedor_id: art.proveedor_id ?? null, proveedor_nombre: art.proveedor_nombre ?? null,
            proveedor_email: art.proveedor_email ?? null, por_evento: [],
          }
        }
        necesidades[art.id].cantidad_total += cantNecesaria
        necesidades[art.id].coste_total += cantNecesaria * Number(art.coste_unitario ?? 0)
        necesidades[art.id].por_evento.push({ evento_id: ev.id, cliente: ev.cliente_nombre, fecha: ev.fecha_evento, cantidad: Math.round(cantNecesaria * 100) / 100 })
      }
    }
  }

  const listaCompra = Object.values(necesidades).map(n => ({
    ...n,
    cantidad_total: Math.round(n.cantidad_total * 100) / 100,
    coste_total: Math.round(n.coste_total * 100) / 100,
    cantidad_a_pedir: Math.max(0, Math.round((n.cantidad_total - n.stock_actual) * 100) / 100),
    stock_suficiente: n.stock_actual >= n.cantidad_total,
  })).sort((a, b) => (a.stock_suficiente === b.stock_suficiente ? 0 : a.stock_suficiente ? 1 : -1))

  const porProveedor: Record<string, { proveedor_nombre: string; proveedor_email: string | null; articulos: typeof listaCompra; total_coste: number; tiene_pendiente: boolean }> = {}
  for (const art of listaCompra) {
    const pKey = art.proveedor_id ?? 'sin_proveedor'
    if (!porProveedor[pKey]) porProveedor[pKey] = { proveedor_nombre: art.proveedor_nombre ?? 'Sin proveedor', proveedor_email: art.proveedor_email, articulos: [], total_coste: 0, tiene_pendiente: false }
    porProveedor[pKey].articulos.push(art)
    porProveedor[pKey].total_coste += art.coste_total
    if (!art.stock_suficiente) porProveedor[pKey].tiene_pendiente = true
  }

  return NextResponse.json({
    desde, hasta, eventos: eventosMapeados, lista_compra: listaCompra, por_proveedor: porProveedor,
    total_articulos: listaCompra.length,
    total_coste_estimado: Math.round(listaCompra.reduce((s, a) => s + a.coste_total, 0) * 100) / 100,
    articulos_sin_stock: listaCompra.filter(a => !a.stock_suficiente).length,
  })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { articulos, notas_pedido } = await req.json()
  if (!articulos?.length) return NextResponse.json({ error: 'Sin artículos' }, { status: 400 })
  let creados = 0
  for (const art of articulos) {
    if ((art.cantidad_a_pedir ?? 0) <= 0) continue
    await supabase.from('pedidos_proveedor').insert({
      restaurante_id: restauranteId, stock_articulo_id: art.articulo_id,
      proveedor_nombre: art.proveedor_nombre, proveedor_email: art.proveedor_email,
      cantidad: art.cantidad_a_pedir, unidad: art.unidad, origen: 'produccion_eventos',
      notas: notas_pedido ?? `Producción: ${art.por_evento?.map((e: { cliente: string }) => e.cliente).join(', ')}`,
      estado: 'pendiente',
    })
    creados++
  }
  if (creados > 0) {
    try { const { tgAlert } = await import('@/lib/telegram'); await tgAlert(`📦 <b>Pedido producción eventos</b>\n${creados} artículos\nProveedor: ${articulos[0]?.proveedor_nombre ?? '-'}`, 'info') } catch {}
  }
  return NextResponse.json({ ok: true, pedidos_creados: creados })
}

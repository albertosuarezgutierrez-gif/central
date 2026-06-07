export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI, cleanJSON } from '@/lib/ai-client'

/**
 * GET /api/owner/pedidos/sugerir
 * Combina stock bajo mínimo + eventos propios próximos + eventos entorno + histórico
 * → sugerencias de pedido agrupadas por proveedor con destino de entrega.
 */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  // Config del restaurante (dias_antelacion, destino_defecto)
  const { data: restConfig } = await supabase
    .from('restaurantes')
    .select('dias_antelacion_pedido_evento, config_pedidos, nombre')
    .eq('id', rid)
    .single()

  const diasAntelacion = restConfig?.dias_antelacion_pedido_evento ?? 5
  const configPedidos = restConfig?.config_pedidos ?? {}

  // 1. Artículos bajo mínimo
  const { data: bajoMinimo } = await supabase.rpc('productos_bajo_minimo', { p_restaurante_id: rid })

  // 2. Stock actual
  const { data: stockArticulos } = await supabase
    .from('stock_articulos')
    .select('id, nombre, stock_actual, stock_minimo, cantidad_pedido, unidad_compra, coste_unitario, proveedor_id, proveedor_nombre')
    .eq('local_id', rid)
    .eq('activo', true)
    .order('nombre')

  // 3. Eventos propios confirmados próximos (configurable por dias_antelacion)
  const fechaLimite = new Date(Date.now() + diasAntelacion * 86400000).toISOString().slice(0, 10)
  const { data: eventosPropios } = await supabase
    .from('eventos')
    .select(`
      id, numero_evento, cliente_nombre, fecha_evento, aforo_previsto,
      modo_local, espacio_id,
      espacios_evento(nombre, tipo),
      menu_evento_id,
      menus_evento(nombre, precio_por_persona)
    `)
    .eq('local_id', rid)
    .in('estado', ['confirmado', 'en_curso'])
    .gte('fecha_evento', new Date().toISOString().slice(0, 10))
    .lte('fecha_evento', fechaLimite)
    .not('menu_evento_id', 'is', null)
    .order('fecha_evento')

  // 4. Para cada evento con menú, calcular lista de compra
  const necesidadesEventos: Array<{
    evento_id: string; numero_evento: string; fecha_evento: string
    cliente_nombre: string; aforo: number; menu_nombre: string
    destino: string; destino_fecha: string
    ingredientes: Array<{ producto_id: string | null; nombre: string; cantidad_total: number; unidad: string }>
  }> = []

  for (const ev of eventosPropios ?? []) {
    const { data: compra } = await supabase.rpc('calcular_compra_evento', { p_evento_id: ev.id })
    if (compra?.length) {
      // Calcular destino según modo_local
      let destino = configPedidos.destino_defecto ?? 'restaurante'
      if (ev.modo_local === 'externo' || ev.modo_local === 'itinerante') destino = 'hacienda'

      // Fecha de entrega requerida = fecha_evento - dias_antelacion
      const fechaEntrega = new Date(ev.fecha_evento + 'T00:00:00')
      fechaEntrega.setDate(fechaEntrega.getDate() - diasAntelacion)

      necesidadesEventos.push({
        evento_id: ev.id,
        numero_evento: ev.numero_evento,
        fecha_evento: ev.fecha_evento,
        cliente_nombre: ev.cliente_nombre,
        aforo: ev.aforo_previsto,
        menu_nombre: (ev as unknown as { menus_evento: { nombre: string } | null }).menus_evento?.nombre ?? 'Sin menú',
        destino,
        destino_fecha: fechaEntrega.toISOString().slice(0, 10),
        ingredientes: compra,
      })
    }
  }

  // 5. Eventos del entorno (Feria, congresos...) para ajuste de demanda habitual
  const en14d = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const { data: eventosEntorno } = await supabase
    .from('eventos_entorno')
    .select('nombre, fecha_inicio, impacto_estimado_pct, categoria')
    .eq('local_id', rid)
    .gte('fecha_inicio', new Date().toISOString().slice(0, 10))
    .lte('fecha_inicio', en14d)
    .order('fecha_inicio')
    .limit(5)

  // 6. Histórico consumo 30 días
  const hace30 = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data: movimientos } = await supabase
    .from('stock_movimientos')
    .select('stock_articulo_id, cantidad')
    .eq('local_id', rid)
    .eq('tipo', 'salida')
    .gte('created_at', hace30)

  const consumoDiario: Record<string, number> = {}
  for (const mov of movimientos ?? []) {
    const id = mov.stock_articulo_id as string
    consumoDiario[id] = (consumoDiario[id] ?? 0) + (mov.cantidad as number) / 30
  }

  if (!stockArticulos?.length && !necesidadesEventos.length) {
    return NextResponse.json({ sugerencias: [], mensaje: 'Sin datos de stock ni eventos próximos.' })
  }

  // Prompt IA con contexto completo
  const prompt = `Eres el sistema de gestión de compras de ${restConfig?.nombre ?? 'un restaurante'}. 
Analiza y genera sugerencias de pedido consolidadas por proveedor.

CONFIGURACIÓN DEL SISTEMA:
- Días de antelación para pedidos de eventos: ${diasAntelacion} días
- Consolidar por proveedor: ${configPedidos.consolidar_por_proveedor ?? true}

ARTÍCULOS BAJO MÍNIMO (stock habitual):
${JSON.stringify((bajoMinimo ?? []).slice(0, 12), null, 2)}

NECESIDADES DE EVENTOS PRÓXIMOS (con menú asignado):
${JSON.stringify(necesidadesEventos, null, 2)}

EVENTOS DEL ENTORNO próximos 14 días (impacto en demanda habitual):
${JSON.stringify(eventosEntorno ?? [], null, 2)}

CONSUMO DIARIO PROMEDIO (últimos 30 días):
${JSON.stringify(Object.entries(consumoDiario).slice(0, 15).map(([id, v]) => ({
  id, consumo_diario: Math.round(v * 100) / 100,
  articulo: stockArticulos?.find((a: { id: string }) => a.id === id)?.nombre
})), null, 2)}

Genera sugerencias de pedido. Para cada artículo:
- Si es para evento: indica evento_id, destino y fecha_entrega_requerida
- Si es stock habitual: destino = 'restaurante'
- Consolida el mismo artículo del mismo proveedor si aparece en múltiples eventos
- Justifica brevemente (máx 1 línea) por qué se necesita

Responde SOLO con JSON válido, sin explicación ni backticks:
{
  "sugerencias": [
    {
      "articulo_id": "uuid o null",
      "articulo_nombre": "nombre",
      "proveedor_id": "uuid o null",
      "proveedor_nombre": "nombre o Desconocido",
      "cantidad_sugerida": 10,
      "unidad": "kg",
      "stock_actual": 2,
      "destino_tipo": "restaurante|almacen_central|hacienda",
      "destino_nombre": "nombre del espacio o null",
      "fecha_entrega_requerida": "YYYY-MM-DD o null",
      "evento_id": "uuid o null",
      "evento_numero": "EV-2026-001 o null",
      "justificacion": "Stock bajo mínimo + Boda García 350p el sábado",
      "urgencia": "alta|media|baja",
      "origen": "stock|evento|combinado"
    }
  ],
  "resumen": "texto breve del contexto",
  "total_eventos_incluidos": 2,
  "total_articulos": 8
}`

  try {
    const raw = await callAI(
      'Eres un asistente de compras para restaurantes y catering. Responde SOLO con JSON válido.',
      prompt, 1500
    )
    const parsed = cleanJSON(raw) as {
      sugerencias?: unknown[]; resumen?: string
      total_eventos_incluidos?: number; total_articulos?: number
    } | null
    if (!parsed?.sugerencias) throw new Error('sin sugerencias')

    return NextResponse.json({
      ...parsed,
      config: { dias_antelacion: diasAntelacion, eventos_incluidos: necesidadesEventos.length },
    })
  } catch {
    // Fallback sin IA
    const sugerencias = [
      ...(bajoMinimo ?? []).slice(0, 8).map((a: {
        id: string; nombre: string; stock_actual: number; stock_minimo: number
        cantidad_pedido: number; unidad_compra: string; proveedor_id: string | null; proveedor_nombre: string | null
      }) => ({
        articulo_id: a.id, articulo_nombre: a.nombre,
        proveedor_id: a.proveedor_id, proveedor_nombre: a.proveedor_nombre ?? 'Desconocido',
        cantidad_sugerida: a.cantidad_pedido ?? Math.max(a.stock_minimo * 2, 1),
        unidad: a.unidad_compra, stock_actual: a.stock_actual,
        destino_tipo: 'restaurante', destino_nombre: null,
        fecha_entrega_requerida: null, evento_id: null, evento_numero: null,
        justificacion: `Stock ${a.stock_actual} < mínimo ${a.stock_minimo}`,
        urgencia: a.stock_actual <= 0 ? 'alta' : 'media',
        origen: 'stock',
      })),
      ...necesidadesEventos.flatMap(ev =>
        ev.ingredientes.slice(0, 5).map(ing => ({
          articulo_id: ing.producto_id, articulo_nombre: ing.nombre,
          proveedor_id: null, proveedor_nombre: 'Por determinar',
          cantidad_sugerida: ing.cantidad_total, unidad: ing.unidad,
          stock_actual: null, destino_tipo: ev.destino, destino_nombre: null,
          fecha_entrega_requerida: ev.destino_fecha,
          evento_id: ev.evento_id, evento_numero: ev.numero_evento,
          justificacion: `${ev.menu_nombre} — ${ev.cliente_nombre} (${ev.aforo}p) el ${ev.fecha_evento}`,
          urgencia: 'media', origen: 'evento',
        }))
      ),
    ]

    return NextResponse.json({
      sugerencias,
      resumen: `${necesidadesEventos.length} evento(s) incluidos. Modo sin IA.`,
      config: { dias_antelacion: diasAntelacion, eventos_incluidos: necesidadesEventos.length },
    })
  }
}

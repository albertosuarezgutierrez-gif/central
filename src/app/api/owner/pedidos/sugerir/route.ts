export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI, cleanJSON } from '@/lib/ai-client'

/**
 * GET /api/owner/pedidos/sugerir
 * Combina stock bajo mínimo + eventos próximos + histórico ventas → sugerencias de pedido.
 * Retorna lista de artículos con cantidad sugerida y justificación.
 */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  // 1. Artículos bajo mínimo
  const { data: bajoMinimo } = await supabase.rpc('productos_bajo_minimo', { p_restaurante_id: rid })

  // 2. Stock actual de todos los artículos
  const { data: stockArticulos } = await supabase
    .from('stock_articulos')
    .select('id, nombre, stock_actual, stock_minimo, cantidad_pedido, unidad_compra, coste_unitario, proveedor_id, proveedor_nombre')
    .eq('restaurante_id', rid)
    .eq('activo', true)
    .order('nombre')

  // 3. Eventos próximos 14 días (si existe tabla eventos_entorno)
  const en14d = new Date(Date.now() + 14 * 86400000)
  const { data: eventos } = await supabase
    .from('eventos_entorno')
    .select('nombre, fecha_inicio, impacto_estimado_pct, categoria')
    .eq('restaurante_id', rid)
    .gte('fecha_inicio', new Date().toISOString().split('T')[0])
    .lte('fecha_inicio', en14d.toISOString().split('T')[0])
    .order('fecha_inicio')
    .limit(5)

  // 4. Histórico ventas 30 días por producto (para calcular consumo medio)
  const hace30 = new Date(Date.now() - 30 * 86400000)
  const { data: movimientos } = await supabase
    .from('stock_movimientos')
    .select('stock_articulo_id, cantidad, tipo')
    .eq('restaurante_id', rid)
    .eq('tipo', 'salida')
    .gte('created_at', hace30.toISOString())

  // Calcular consumo diario promedio por artículo
  const consumoDiario: Record<string, number> = {}
  for (const mov of movimientos ?? []) {
    const id = mov.stock_articulo_id as string
    consumoDiario[id] = (consumoDiario[id] ?? 0) + (mov.cantidad as number)
  }
  Object.keys(consumoDiario).forEach(id => {
    consumoDiario[id] = consumoDiario[id] / 30
  })

  if (!stockArticulos?.length) {
    return NextResponse.json({ sugerencias: [], mensaje: 'Sin artículos de stock configurados' })
  }

  // Si no hay IA disponible, calcular reglas simples
  const articulosBajos = (bajoMinimo ?? stockArticulos.filter((a: { stock_actual: number; stock_minimo: number }) => a.stock_actual <= a.stock_minimo))

  if (!articulosBajos.length && !eventos?.length) {
    return NextResponse.json({ sugerencias: [], mensaje: 'Stock por encima del mínimo y sin eventos próximos detectados.' })
  }

  // Prompt para IA
  const prompt = `Eres el sistema de gestión de compras de un restaurante. Analiza el stock y genera sugerencias de pedido.

ARTÍCULOS BAJO MÍNIMO O CERCA DEL LÍMITE:
${JSON.stringify(articulosBajos?.slice(0, 15), null, 2)}

EVENTOS PRÓXIMOS (próximos 14 días):
${JSON.stringify(eventos ?? [], null, 2)}

CONSUMO DIARIO PROMEDIO (últimos 30 días, en unidades/día):
${JSON.stringify(Object.entries(consumoDiario).slice(0, 20).map(([id, v]) => ({
  id, consumo_diario: Math.round(v * 100) / 100,
  articulo: stockArticulos.find((a: { id: string }) => a.id === id)?.nombre
})), null, 2)}

Genera sugerencias de pedido en JSON. Para cada artículo calcula:
- Cantidad necesaria para cubrir 14 días de consumo + stock mínimo de seguridad
- Si hay eventos que aumentan demanda, multiplica por el factor de impacto
- Agrupa por proveedor cuando sea posible

Responde SOLO con JSON válido, sin explicación, sin backticks:
{
  "sugerencias": [
    {
      "articulo_id": "uuid",
      "articulo_nombre": "nombre",
      "proveedor_id": "uuid o null",
      "proveedor_nombre": "nombre o null",
      "cantidad_sugerida": 10,
      "unidad": "kg",
      "stock_actual": 2,
      "stock_minimo": 5,
      "justificacion": "Feria de Abril en 3 días: +40% demanda prevista. Stock actual cubre solo 2 días.",
      "urgencia": "alta|media|baja"
    }
  ],
  "resumen": "texto breve del contexto general"
}`

  try {
    const raw = await callAI(
      'Eres un asistente de gestión de compras para restaurantes. Responde SOLO con JSON válido, sin texto adicional.',
      prompt,
      1200
    )
    const parsed = cleanJSON(raw) as { sugerencias?: unknown; resumen?: string } | null
    if (!parsed?.sugerencias) throw new Error('respuesta sin sugerencias')
    return NextResponse.json(parsed)
  } catch {
    // Fallback: sugerencias simples sin IA
    const sugerencias = (articulosBajos ?? []).slice(0, 10).map((a: {
      id: string; nombre: string; stock_actual: number; stock_minimo: number
      cantidad_pedido: number; unidad_compra: string; proveedor_id: string | null; proveedor_nombre: string | null
    }) => ({
      articulo_id: a.id,
      articulo_nombre: a.nombre,
      proveedor_id: a.proveedor_id,
      proveedor_nombre: a.proveedor_nombre,
      cantidad_sugerida: a.cantidad_pedido ?? Math.max(a.stock_minimo * 2, 1),
      unidad: a.unidad_compra,
      stock_actual: a.stock_actual,
      stock_minimo: a.stock_minimo,
      justificacion: `Stock actual (${a.stock_actual}) por debajo del mínimo (${a.stock_minimo}).`,
      urgencia: a.stock_actual <= 0 ? 'alta' : 'media',
    }))
    return NextResponse.json({ sugerencias, resumen: 'Sugerencias basadas en stock mínimo (modo sin IA).' })
  }
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI, cleanJSON } from '@/lib/ai-client'
import { logTraining } from '@/lib/training-log'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { data: stock } = await supabase
    .from('almacen').select('producto_id, stock_actual, stock_minimo, unidad')
    .eq('local_id', restauranteId)

  if (!stock?.length) return NextResponse.json({ error: 'Sin stock definido' }, { status: 422 })

  const pIds = stock.map((s: { producto_id: string }) => s.producto_id)
  const { data: productos } = await supabase.from('productos').select('id, nombre').in('id', pIds)
  const mapaProds: Record<string, string> = {}
  for (const p of productos ?? []) mapaProds[p.id] = p.nombre

  const hace14 = new Date(); hace14.setDate(hace14.getDate() - 14)
  const { data: consumo } = await supabase
    .from('comanda_items').select('nombre, cantidad')
    .eq('local_id', restauranteId).gte('created_at', hace14.toISOString())

  const consumoPorNombre: Record<string, number> = {}
  for (const c of consumo ?? []) consumoPorNombre[c.nombre] = (consumoPorNombre[c.nombre] ?? 0) + (c.cantidad ?? 1)

  const stockConConsumo = stock.map((s: { producto_id: string; stock_actual: number; stock_minimo: number | null; unidad: string | null }) => {
    const nombre = mapaProds[s.producto_id] ?? 'Desconocido'
    const consumo14d = consumoPorNombre[nombre] ?? 0
    const diario = consumo14d / 14
    return {
      nombre, stock_actual: s.stock_actual, stock_minimo: s.stock_minimo ?? 0, unidad: s.unidad ?? 'u',
      consumo_14d: consumo14d, consumo_diario_medio: Math.round(diario * 10) / 10,
      dias_restantes: diario > 0 ? Math.floor(s.stock_actual / diario) : null,
      en_minimos: s.stock_actual <= (s.stock_minimo ?? 0),
    }
  })

  const raw = await callAI(
    `Eres gestor de almacén de restaurante. Predicción reposición próximos 7 días.
Solo JSON: {"pedido_urgente":[{"nombre":"...","cantidad_sugerida":N,"razon":"..."}],"pedido_esta_semana":[{"nombre":"...","cantidad_sugerida":N,"dias_para_rotura":N}],"sin_accion":["nombre"],"resumen":"diagnóstico 1 frase","ahorro_tip":"consejo optimización"}
pedido_urgente = en mínimos O rotura <3 días. pedido_esta_semana = rotura 3-7 días. cantidad_sugerida = stock 14 días.`,
    `Stock: ${JSON.stringify(stockConConsumo)}`
  )

  let prediccion = null
  try { prediccion = JSON.parse(cleanJSON(raw ?? '')) } catch { /* sin prediccion */ }
  if (prediccion) {
    await logTraining({
      local_id: restauranteId,
      input_raw: `Predicción almacén ${new Date().toLocaleDateString('es-ES')}`,
      input_context: { modulo: 'almacen_prediccion', num_productos: stockConConsumo.length },
      output_brain: prediccion,
      fuente: 'nim_analitico',
      calidad: 3,
      confianza: 0.75,
      modelo_usado: 'nvidia/llama-3.3-70b',
    })
  }
  return NextResponse.json({ stock: stockConConsumo, prediccion })
}

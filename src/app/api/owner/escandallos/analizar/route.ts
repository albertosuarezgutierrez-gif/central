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

  const { data: escandallos } = await supabase
    .from('escandallos').select('nombre, coste_racion, precio_venta, margen_porcentaje, categoria')
    .eq('local_id', restauranteId).order('margen_porcentaje', { ascending: true })

  if (!escandallos?.length)
    return NextResponse.json({ error: 'Sin escandallos definidos' }, { status: 422 })

  const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30)
  const { data: ventas } = await supabase
    .from('comanda_items').select('nombre, cantidad')
    .eq('local_id', restauranteId).gte('created_at', hace30.toISOString())

  const ventasPorNombre: Record<string, number> = {}
  for (const v of ventas ?? []) ventasPorNombre[v.nombre] = (ventasPorNombre[v.nombre] ?? 0) + (v.cantidad ?? 1)

  const contexto = escandallos.map((e: { nombre: string; coste_racion: number; precio_venta: number; margen_porcentaje: number; categoria: string }) => ({
    nombre: e.nombre, coste: e.coste_racion, pvp: e.precio_venta,
    margen: e.margen_porcentaje, categoria: e.categoria ?? 'sin categoría',
    unidades_30d: ventasPorNombre[e.nombre] ?? 0,
  }))

  const raw = await callAI(
    `Eres consultor de rentabilidad para restaurantes españoles. Benchmark: margen bruto saludable >65%.
Solo JSON: {"resumen":"diagnóstico 1 frase","criticos":[{"nombre":"...","problema":"...","sugerencia_precio":X}],"estrella":{"nombre":"...","motivo":"..."},"oportunidad":"consejo 1 frase","margen_medio":X}
criticos = margen<50% O muy vendido con margen bajo. sugerencia_precio = precio para llegar a 65% margen.`,
    `Escandallos: ${JSON.stringify(contexto)}`
  )

  let analisis = null
  try { analisis = JSON.parse(cleanJSON(raw ?? '')) } catch { /* sin analisis */ }
  if (analisis) {
    await logTraining({
      restaurante_id: restauranteId,
      input_raw: `Análisis escandallos ${new Date().toLocaleDateString('es-ES')}`,
      input_context: { modulo: 'escandallos_optimizer', num_productos: contexto.length },
      output_brain: analisis,
      fuente: 'nim_analitico',
      calidad: 3,
      confianza: 0.75,
      modelo_usado: 'nvidia/llama-3.3-70b',
    })
  }
  return NextResponse.json({ escandallos: contexto, analisis })
}

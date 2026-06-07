export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI } from '@/lib/ai-client'
import { logTraining } from '@/lib/training-log'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) {
    // Log para Auto-Healer: si esto se repite >3 veces en 1h, Check 9 lo escala a crítico
    const sb = createServerClient()
    await sb.from('incidencias_sistema').insert({
      tipo: 'copiloto_auth_fallida',
      modulo: 'copiloto',
      nivel: 'aviso',
      mensaje: 'Petición al copiloto sin sesión válida (x-ia-session ausente o inválido)',
      local_id: null,
    }).then(() => {})
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const restauranteId = getRestauranteId(req)

  const { pregunta, historial } = await req.json()
  if (!pregunta?.trim()) return NextResponse.json({ error: 'pregunta requerida' }, { status: 400 })

  const supabase = createServerClient()
  const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30)

  const [
    { data: restaurante },
    { count: totalComandas },
    { data: topItems },
    { data: stockAlertas },
    { data: turnosActivos },
  ] = await Promise.all([
    supabase.from('restaurantes').select('nombre, num_mesas').eq('id', restauranteId).single(),
    supabase.from('comandas').select('*', { count: 'exact', head: true })
      .eq('local_id', restauranteId).gte('created_at', hace30.toISOString()),
    supabase.from('comanda_items').select('nombre, cantidad')
      .eq('local_id', restauranteId).gte('created_at', hace30.toISOString()).limit(200),
    supabase.from('almacen').select('producto_id').eq('restaurante_id', restauranteId)
      .filter('stock_actual', 'lte', 'stock_minimo').gt('stock_minimo', 0),
    supabase.from('turnos').select('camarero_id').eq('local_id', restauranteId).is('salida_at', null),
  ])

  const conteo: Record<string, number> = {}
  for (const item of topItems ?? []) conteo[item.nombre] = (conteo[item.nombre] ?? 0) + (item.cantidad ?? 1)
  const top5 = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const system = `Eres el Asistente ia.rest, el asistente de negocio de ia.rest para "${restaurante?.nombre ?? 'el restaurante'}".
Datos actuales (últimos 30 días):
- Mesas: ${restaurante?.num_mesas ?? '?'}
- Comandas: ${totalComandas ?? 0}
- Top 5 productos: ${top5.map(([n, u]) => `${n}(${u}u)`).join(', ') || 'sin datos'}
- Alertas stock: ${stockAlertas?.length ?? 0} productos en mínimos
- Personal con turno abierto ahora: ${turnosActivos?.length ?? 0}
- Fecha: ${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
Responde en español, tono cálido y directo, hostelero. Máximo 3 frases. No inventes cifras.`

  const msgs: { role: 'user' | 'assistant'; content: string }[] = [
    ...((historial ?? []) as { role: 'user' | 'assistant'; content: string }[]).slice(-8),
    { role: 'user', content: pregunta },
  ]

  const respuesta = await callAI(system, msgs, 300)
  // ── Log de entrenamiento analítico ────────────────────────────────────────
  // El copiloto genera pares pregunta/respuesta sobre datos reales del restaurante.
  // Calidad 3: útil para aprender qué métricas consultan los dueños y cómo responder.
  await logTraining({
    local_id: restauranteId,
    input_raw: pregunta,
    input_context: {
      modulo: 'copiloto_owner',
      historial_turnos: msgs.length - 1,
      metricas: { totalComandas, stockAlertas: stockAlertas?.length ?? 0, turnosActivos: turnosActivos?.length ?? 0 },
    },
    output_brain: { respuesta: respuesta?.trim(), top5 },
    fuente: 'nim_analitico',
    calidad: 3,
    confianza: 0.80,
    modelo_usado: 'nvidia/llama-3.3-70b',
  })

  return NextResponse.json({ respuesta: respuesta?.trim() ?? 'Sin respuesta disponible.' })
}

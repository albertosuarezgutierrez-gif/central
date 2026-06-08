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

  const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30)
  const { data: turnos } = await supabase
    .from('turnos').select('entrada_at, salida_at, horas_totales, camarero_id')
    .eq('local_id', restauranteId).gte('entrada_at', hace30.toISOString())
    .not('salida_at', 'is', null).not('camarero_id', 'is', null)

  if (!turnos?.length) return NextResponse.json({ error: 'Sin datos de turnos (mínimo 1 mes)' }, { status: 422 })

  const { data: comandas } = await supabase
    .from('comandas').select('created_at')
    .eq('local_id', restauranteId).gte('created_at', hace30.toISOString())

  const cmdPorHora: Record<number, number> = {}
  for (const c of comandas ?? []) {
    const h = new Date(c.created_at).getHours()
    cmdPorHora[h] = (cmdPorHora[h] ?? 0) + 1
  }

  const personalPorHora: Record<number, number> = {}
  for (const t of turnos) {
    if (!t.entrada_at || !t.salida_at) continue
    const e = new Date(t.entrada_at).getHours(); const s = new Date(t.salida_at).getHours()
    for (let h = e; h <= Math.min(s, 23); h++) personalPorHora[h] = (personalPorHora[h] ?? 0) + 1
  }

  const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const horasPorDia: Record<string, number[]> = {}
  for (const t of turnos) {
    if (!t.horas_totales || !t.entrada_at) continue
    const dia = dias[new Date(t.entrada_at).getDay()]
    if (!horasPorDia[dia]) horasPorDia[dia] = []
    horasPorDia[dia].push(t.horas_totales)
  }

  const resumenHoras = Array.from({ length: 24 }, (_, h) => ({
    hora: h, personal_medio: Math.round(((personalPorHora[h] ?? 0) / 30) * 10) / 10,
    comandas_media: Math.round(((cmdPorHora[h] ?? 0) / 30) * 10) / 10,
  })).filter(h => h.personal_medio > 0 || h.comandas_media > 0)

  const resumenDias = Object.entries(horasPorDia).map(([dia, horas]) => ({
    dia, horas_media: Math.round((horas.reduce((a, b) => a + b, 0) / horas.length) * 10) / 10, turnos: horas.length,
  }))

  const raw = await callAI(
    `Eres consultor RRHH hostelería. Analiza ineficiencias de personal (30 días).
Solo JSON: {"horas_criticas":[{"hora":"H:00","situacion":"sobredotado|infradotado","diferencia":"X personas"}],"dia_mas_intenso":"día","sobredotacion":"descripción o null","infradotacion":"descripción o null","ahorro_estimado_horas":N,"recomendacion":"acción concreta"}`,
    `Por hora: ${JSON.stringify(resumenHoras)}\nPor día: ${JSON.stringify(resumenDias)}`
  )

  let analisis = null
  try { analisis = JSON.parse(cleanJSON(raw ?? '')) } catch { /* sin analisis */ }
  if (analisis) {
    await logTraining({
      local_id: restauranteId,
      input_raw: `Análisis turnos ${new Date().toLocaleDateString('es-ES')}`,
      input_context: { modulo: 'turnos_analisis', dias: 30 },
      output_brain: analisis,
      fuente: 'nim_analitico',
      calidad: 3,
      confianza: 0.75,
      modelo_usado: 'nvidia/llama-3.3-70b',
    })
  }
  return NextResponse.json({ resumenHoras, resumenDias, analisis })
}

// /api/cron/pipeline-comercial — Agente Pipeline Comercial v1.0
// Diario 8:00 — analiza leads activos, detecta urgencias, sugiere acciones via NIM
// Integrado en briefing-semanal del lunes (bloque pipeline al inicio)

export const maxDuration = 30
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { callAI, cleanJSON } from '@/lib/ai-client'
import { tgAlert } from '@/lib/telegram'

interface LeadPipeline {
  id: string
  nombre: string
  empresa: string | null
  restaurante: string | null
  estado: string
  puntuacion: number | null
  ultima_actividad_at: string | null
  siguiente_contacto_at: string | null
  siguiente_contacto_texto: string | null
  propuesta_slug: string | null
  propuesta_vista_at: string | null
  reunion_fecha: string | null
  reunion_confirmada: boolean | null
}

interface LeadConMetricas extends LeadPipeline {
  diasSinActividad: number
  accionVencida: boolean
  propuestaReciente: boolean
  reunionProxima: boolean
  nombreDisplay: string
}

interface AccionSugerida {
  lead_id: string
  urgencia: 'alta' | 'media' | 'baja'
  accion: string
  razon: string
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const isCron = auth === `Bearer ${process.env.CRON_SECRET}`
  const isManual = req.nextUrl.searchParams.get('manual') === '1'
  if (!isCron && !isManual) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()
  const ahora = new Date()

  const { data: leads, error } = await supabase
    .from('leads')
    .select(`
      id, nombre, empresa, restaurante, estado, puntuacion,
      ultima_actividad_at, siguiente_contacto_at, siguiente_contacto_texto,
      propuesta_slug, propuesta_vista_at, reunion_fecha, reunion_confirmada
    `)
    .not('estado', 'in', '(cliente,descartado)')
    .order('puntuacion', { ascending: false })

  if (error || !leads?.length) {
    return NextResponse.json({ ok: true, leads: 0, mensaje: 'Sin leads activos' })
  }

  // ── Enriquecer con métricas calculadas ────────────────────────────────
  const leadsConMetricas: LeadConMetricas[] = (leads as LeadPipeline[]).map(l => {
    const diasSinActividad = l.ultima_actividad_at
      ? Math.floor((ahora.getTime() - new Date(l.ultima_actividad_at).getTime()) / 86400000)
      : 999
    const accionVencida = l.siguiente_contacto_at
      ? new Date(l.siguiente_contacto_at) < ahora
      : false
    const propuestaReciente = l.propuesta_vista_at
      ? (ahora.getTime() - new Date(l.propuesta_vista_at).getTime()) < 48 * 3600000
      : false
    const reunionProxima = l.reunion_fecha
      ? new Date(l.reunion_fecha) > ahora
      : false
    const nombreDisplay = l.empresa || l.restaurante || l.nombre

    return { ...l, diasSinActividad, accionVencida, propuestaReciente, reunionProxima, nombreDisplay }
  })

  // ── Filtrar los que necesitan atención ───────────────────────────────
  const urgentes = leadsConMetricas.filter(l =>
    l.propuestaReciente ||
    l.accionVencida ||
    (l.diasSinActividad > 3 && ['contactado', 'demo', 'propuesta'].includes(l.estado))
  )

  if (!urgentes.length) {
    return NextResponse.json({ ok: true, leads: leads.length, urgentes: 0, mensaje: 'Pipeline en orden' })
  }

  // ── NIM analiza y sugiere acciones concretas ─────────────────────────
  const resumenLeads = urgentes.map(l => {
    const partes: string[] = [`${l.nombreDisplay} (${l.estado}, score:${l.puntuacion ?? '?'})`]
    if (l.propuestaReciente) partes.push('visitó propuesta <48h')
    if (l.accionVencida)     partes.push(`acción vencida: "${l.siguiente_contacto_texto ?? 'pendiente'}"`)
    if (l.diasSinActividad < 999) partes.push(`${l.diasSinActividad}d sin actividad`)
    if (l.reunionProxima)    partes.push(`reunión el ${new Date(l.reunion_fecha!).toLocaleDateString('es-ES')}`)
    return `- [${l.id}] ${partes.join(' | ')}`
  }).join('\n')

  const prompt = `Eres el asistente comercial de ia.rest (TPV por voz para hostelería española, 59€/mes).
Analiza estos leads y devuelve LA acción más concreta e inmediata para cada uno.

LEADS ACTIVOS QUE NECESITAN ATENCIÓN:
${resumenLeads}

Reglas:
- Si visitó propuesta <48h: llamar hoy sin falta
- Si acción vencida: ejecutarla hoy
- Si >3 días sin actividad en estado avanzado: retomar con mensaje personalizado
- Si reunión próxima: preparar briefing

Responde SOLO JSON array (mantén el mismo orden que la lista):
[{ "lead_id": "uuid-exacto", "urgencia": "alta|media|baja", "accion": "acción concreta (máx 12 palabras)", "razon": "por qué ahora (máx 8 palabras)" }]`

  let acciones: AccionSugerida[] = []
  try {
    const raw = await callAI('Analiza leads y sugiere acciones comerciales. SOLO JSON.', prompt, 500)
    const parsed = JSON.parse(cleanJSON(raw))
    // Garantizar IDs correctos (NIM a veces los trunca)
    acciones = (parsed as AccionSugerida[]).map((a, i) => ({
      ...a,
      lead_id: urgentes[i]?.id ?? a.lead_id
    }))
  } catch {
    // Fallback sin NIM
    acciones = urgentes.map(l => ({
      lead_id: l.id,
      urgencia: (l.propuestaReciente || l.accionVencida ? 'alta' : 'media') as 'alta' | 'media' | 'baja',
      accion: l.propuestaReciente
        ? 'Llamar hoy — acaban de ver la propuesta'
        : l.accionVencida
          ? `Ejecutar: ${l.siguiente_contacto_texto ?? 'acción pendiente'}`
          : 'Retomar contacto tras silencio',
      razon: l.propuestaReciente
        ? 'Visitó propuesta <48h'
        : `${l.diasSinActividad}d sin actividad`
    }))
  }

  // ── Construir mensaje Telegram priorizado ────────────────────────────
  const urgEmoji: Record<string, string> = { alta: '🔴', media: '🟡', baja: '🟢' }
  const ordenUrgencia: Record<string, number> = { alta: 0, media: 1, baja: 2 }
  const accionesOrdenadas = [...acciones].sort(
    (a, b) => ordenUrgencia[a.urgencia] - ordenUrgencia[b.urgencia]
  )

  let msg = `📊 <b>Pipeline Comercial — ${ahora.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</b>\n`
  msg += `<i>${urgentes.length} de ${leads.length} leads requieren atención</i>\n\n`

  for (const accion of accionesOrdenadas) {
    const lead = urgentes.find(l => l.id === accion.lead_id)
    if (!lead) continue
    msg += `${urgEmoji[accion.urgencia] ?? '⚪'} <b>${lead.nombreDisplay}</b>`
    if (lead.puntuacion) msg += ` · ${lead.puntuacion}pts`
    msg += `\n   → ${accion.accion}\n`
    msg += `   <i>${accion.razon}</i>\n\n`
  }

  msg += `<a href="https://www.iarest.es/super">Abrir CRM →</a>`

  await tgAlert(msg, 'info')

  return NextResponse.json({
    ok: true,
    leads: leads.length,
    urgentes: urgentes.length,
    acciones: acciones.length
  })
}

// ── Exportar resumen para reutilizar en briefing-semanal ────────────────
export async function buildPipelineBloque(): Promise<string> {
  const supabase = createServerClient()
  const ahora = new Date()

  const { data: leads } = await supabase
    .from('leads')
    .select('id, nombre, empresa, restaurante, estado, puntuacion, ultima_actividad_at, siguiente_contacto_at, propuesta_vista_at, reunion_fecha')
    .not('estado', 'in', '(cliente,descartado)')
    .order('puntuacion', { ascending: false })

  if (!leads?.length) return ''

  const lineas = (leads as LeadPipeline[]).map(l => {
    const nombre = l.empresa || l.restaurante || l.nombre
    const dias = l.ultima_actividad_at
      ? Math.floor((ahora.getTime() - new Date(l.ultima_actividad_at).getTime()) / 86400000)
      : null
    const propVista = l.propuesta_vista_at
      ? (ahora.getTime() - new Date(l.propuesta_vista_at).getTime()) < 48 * 3600000
      : false
    const accionVencida = l.siguiente_contacto_at ? new Date(l.siguiente_contacto_at) < ahora : false
    const reunionProxima = l.reunion_fecha ? new Date(l.reunion_fecha) > ahora : false

    let icono = '🟢'
    if (propVista || accionVencida) icono = '🔴'
    else if (dias && dias > 3) icono = '🟡'

    let estado = l.estado
    if (propVista) estado += ' · propuesta vista <48h'
    else if (accionVencida) estado += ' · acción vencida'
    else if (reunionProxima) estado += ` · reunión el ${new Date(l.reunion_fecha!).toLocaleDateString('es-ES')}`
    else if (dias) estado += ` · ${dias}d sin contacto`

    return `${icono} ${nombre}: ${estado}`
  })

  return `\n── Pipeline comercial ──\n${lineas.join('\n')}\n`
}

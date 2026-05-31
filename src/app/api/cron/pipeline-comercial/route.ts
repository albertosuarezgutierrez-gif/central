// /api/cron/pipeline-comercial — Agente Pipeline Comercial v1.0
// Diario 8:00 — analiza leads activos, detecta urgencias, sugiere acciones via NIM
// Integrado en briefing-semanal del lunes (bloque pipeline al inicio)

export const maxDuration = 60
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { callAI, cleanJSON } from '@/lib/ai-client'
import { tgAlert, tgAlertButtons } from '@/lib/telegram'

interface LeadPipeline {
  id: string
  nombre: string
  empresa: string | null
  restaurante: string | null
  estado: string
  puntuacion: number | null
  mrr_estimado: number | null
  email: string | null
  email_draft: string | null
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
  reunionSinConfirmar?: boolean
  nombreDisplay: string
}

interface AccionSugerida {
  lead_id: string
  urgencia: 'alta' | 'media' | 'baja'
  accion: string
  razon: string
  whatsapp?: string
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
      id, nombre, empresa, restaurante, estado:estado_pipeline, puntuacion, mrr_estimado,
      email, email_draft,
      ultima_actividad_at, siguiente_contacto_at, siguiente_contacto_texto,
      propuesta_slug, propuesta_vista_at, reunion_fecha, reunion_confirmada
    `)
    .not('estado_pipeline', 'in', '(cliente,descartado)')
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
  const ahoraMs = ahora.getTime()
  const enriquecer = (l: LeadConMetricas) => {
    const reunionSinConfirmar = !!l.reunion_fecha
      && new Date(l.reunion_fecha).getTime() > ahoraMs
      && new Date(l.reunion_fecha).getTime() - ahoraMs < 14 * 86400000
      && l.reunion_confirmada !== true
    return { ...l, reunionSinConfirmar }
  }
  const leadsExt = leadsConMetricas.map(enriquecer)

  const urgentes = leadsExt.filter(l =>
    l.propuestaReciente ||
    l.accionVencida ||
    l.reunionSinConfirmar ||
    (l.diasSinActividad > 3 && ['contactado','demo','propuesta','reunion_agendada','propuesta_lista','esperando_ok','estudiando'].includes(l.estado))
  )

  if (!urgentes.length) {
    return NextResponse.json({ ok: true, leads: leads.length, urgentes: 0, mensaje: 'Pipeline en orden' })
  }

  // ── NIM analiza y sugiere acciones concretas ─────────────────────────
  const resumenLeads = urgentes.map(l => {
    const partes: string[] = [`${l.nombreDisplay} (${l.estado}, score:${l.puntuacion ?? '?'})`]
    if (l.propuestaReciente) partes.push('visitó propuesta <48h')
    if (l.accionVencida)     partes.push(`acción vencida: "${l.siguiente_contacto_texto ?? 'pendiente'}"`)
    if (l.reunionSinConfirmar) partes.push(`⚠️ REUNIÓN SIN CONFIRMAR el ${new Date(l.reunion_fecha!).toLocaleDateString('es-ES')}`)
    if (l.diasSinActividad < 999) partes.push(`${l.diasSinActividad}d sin actividad`)
    if (l.reunionProxima && !l.reunionSinConfirmar) partes.push(`reunión el ${new Date(l.reunion_fecha!).toLocaleDateString('es-ES')}`)
    return `- [${l.id}] ${partes.join(' | ')}`
  }).join('\n')

  const prompt = `Eres el asistente comercial de ia.rest (TPV por voz para hostelería española, 59€/mes).
Para cada lead: devuelve la acción más concreta e inmediata Y redacta el mensaje de WhatsApp de seguimiento listo para enviar.

LEADS ACTIVOS QUE NECESITAN ATENCIÓN:
${resumenLeads}

Reglas de acción:
- Si reunión sin confirmar: contactar HOY para confirmar fecha/hora (lo más urgente, el dinero se cae si no se confirma)
- Si visitó propuesta <48h: llamar hoy sin falta
- Si acción vencida: ejecutarla hoy
- Si >3 días sin actividad en estado avanzado: retomar con mensaje personalizado

Reglas del mensaje WhatsApp (campo "whatsapp"):
- Tono cercano y profesional, de tú, como un comercial que conoce al cliente. Español de España.
- Personalizado al nombre del negocio y a su situación (reunión, propuesta vista, silencio).
- Si hay reunión sin confirmar: pídele confirmar día y hora de forma natural.
- Máximo 40 palabras. Sin emojis excesivos (máx 1). Que suene humano, no a plantilla.
- NO inventes datos que no tienes (precios concretos, fechas que no constan).
- CRÍTICO: el mensaje en UNA sola línea, sin saltos de línea. Usa ". " para separar frases. No uses comillas dobles dentro del texto (usa comillas simples si hace falta).

Responde SOLO JSON array válido en una línea por objeto (mismo orden que la lista):
[{ "lead_id": "uuid-exacto", "urgencia": "alta|media|baja", "accion": "acción concreta (máx 12 palabras)", "razon": "por qué ahora (máx 8 palabras)", "whatsapp": "mensaje listo para enviar, sin saltos de línea" }]`

  let acciones: AccionSugerida[] = []
  const parseAcciones = (raw: string): AccionSugerida[] => {
    const limpio = cleanJSON(raw)
    try { return JSON.parse(limpio) } catch { /* reparar abajo */ }
    // Reparación: escapar saltos de línea reales dentro de strings JSON
    try {
      const reparado = limpio.replace(/"(?:[^"\\]|\\.)*"/g, m => m.replace(/[\n\r]/g, ' '))
      return JSON.parse(reparado)
    } catch { /* extraer objeto a objeto abajo */ }
    // Último recurso: extraer cada objeto {...} individualmente
    const objs = limpio.match(/\{[^{}]*\}/g) || []
    const out: AccionSugerida[] = []
    for (const o of objs) {
      try { out.push(JSON.parse(o.replace(/\n/g, ' '))) } catch { /* ignorar */ }
    }
    return out
  }
  try {
    const raw = await callAI('Analiza leads, sugiere acciones y redacta WhatsApp de seguimiento. SOLO JSON válido.', prompt, 3500, 45_000, true)
    const parsed = parseAcciones(raw)
    if (!parsed.length) throw new Error('parse vacío')
    // Mapear por lead_id devuelto por NIM; los que falten se completan con fallback más abajo
    const porId = new Map(parsed.filter(a => a.lead_id).map(a => [a.lead_id, a]))
    acciones = urgentes.map((l, i) => {
      const m = porId.get(l.id) || parsed[i]
      return m
        ? { ...m, lead_id: l.id }
        : {
            lead_id: l.id,
            urgencia: (l.reunionSinConfirmar || l.propuestaReciente || l.accionVencida ? 'alta' : 'media') as 'alta'|'media'|'baja',
            accion: l.reunionSinConfirmar ? 'Confirmar día y hora de la reunión' : 'Retomar contacto',
            razon: l.reunionSinConfirmar ? 'Reunión sin confirmar' : `${l.diasSinActividad}d sin actividad`,
          }
    })
  } catch {
    acciones = urgentes.map(l => ({
      lead_id: l.id,
      urgencia: (l.propuestaReciente || l.accionVencida || l.reunionSinConfirmar ? 'alta' : 'media') as 'alta' | 'media' | 'baja',
      accion: l.reunionSinConfirmar
        ? 'Confirmar día y hora de la reunión'
        : l.propuestaReciente
          ? 'Llamar hoy — acaban de ver la propuesta'
          : l.accionVencida
            ? `Ejecutar: ${l.siguiente_contacto_texto ?? 'acción pendiente'}`
            : 'Retomar contacto tras silencio',
      razon: l.reunionSinConfirmar ? 'Reunión sin confirmar' : l.propuestaReciente ? 'Visitó propuesta <48h' : `${l.diasSinActividad}d sin actividad`,
    }))
  }

  // ── Guardar los borradores de WhatsApp generados (para que el botón funcione) ──
  await Promise.allSettled(
    acciones
      .filter(a => a.whatsapp && a.whatsapp.trim().length > 5)
      .map(a => supabase.from('leads').update({ whatsapp_draft: a.whatsapp }).eq('id', a.lead_id))
  )

  // ── Cabecera + un mensaje accionable por lead (ordenado por urgencia y € en juego) ──
  const urgEmoji: Record<string, string> = { alta: '🔴', media: '🟡', baja: '🟢' }
  const ordenUrgencia: Record<string, number> = { alta: 0, media: 1, baja: 2 }
  const mrrDe = (id: string) => urgentes.find(l => l.id === id)?.mrr_estimado ?? 0
  const accionesOrdenadas = [...acciones].sort((a, b) => {
    const u = ordenUrgencia[a.urgencia] - ordenUrgencia[b.urgencia]
    return u !== 0 ? u : mrrDe(b.lead_id) - mrrDe(a.lead_id)
  })

  const mrrEnJuego = urgentes.reduce((s, l) => s + (l.mrr_estimado ?? 0), 0)
  await tgAlert(
    `📊 <b>Pipeline — ${ahora.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</b>\n` +
    `<i>${urgentes.length} de ${leads.length} leads requieren acción · ${mrrEnJuego}€/mes en juego</i>\n` +
    `Te paso cada uno con su mensaje listo para enviar 👇`,
    'info'
  )

  for (const accion of accionesOrdenadas) {
    const lead = urgentes.find(l => l.id === accion.lead_id)
    if (!lead) continue
    const mrr = lead.mrr_estimado ? ` · ${lead.mrr_estimado}€/mes` : ''
    let msg = `${urgEmoji[accion.urgencia] ?? '⚪'} <b>${lead.nombreDisplay}</b>${mrr}\n`
    msg += `→ ${accion.accion}\n<i>${accion.razon}</i>`
    if (accion.whatsapp) msg += `\n\n💬 <i>${accion.whatsapp}</i>`

    const fila1: { texto: string; callback: string }[] = [{ texto: '📱 Ver WhatsApp', callback: `ver_whatsapp:${lead.id}` }]
    if (lead.email && lead.email_draft) fila1.push({ texto: '📨 Enviar email', callback: `enviar_email:${lead.id}` })
    const botones = [fila1, [{ texto: '✏️ Cambiar foco', callback: `propuesta_foco:${lead.id}` }]]

    await tgAlertButtons(msg, accion.urgencia === 'alta' ? 'aviso' : 'info', botones)
  }

  return NextResponse.json({
    ok: true,
    leads: leads.length,
    urgentes: urgentes.length,
    acciones: acciones.length,
    conWhatsapp: acciones.filter(a => a.whatsapp).length,
    mrrEnJuego,
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

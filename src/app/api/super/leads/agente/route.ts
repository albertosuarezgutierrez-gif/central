export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { callAI, cleanJSON } from '@/lib/ai-client'

const ESTADOS_VALIDOS = ['nuevo', 'contactado', 'demo', 'cliente', 'descartado']

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { lead_id, texto, canal, contacto_id } = await req.json()
  if (!lead_id || !texto) {
    return NextResponse.json({ error: 'lead_id y texto son obligatorios' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, nombre, restaurante, empresa, estado, eventos, puntuacion')
    .eq('id', lead_id)
    .single()

  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
  }

  const system = `Eres el agente CRM de ia.rest, analizas mensajes de ventas de hostelería española.
Responde SOLO en JSON válido, sin backticks, sin explicaciones.`

  const prompt = `Analiza este mensaje de ${canal} del lead "${lead.nombre}" (${lead.restaurante || lead.empresa}):

---
${texto.substring(0, 1500)}
---

Estado actual: ${lead.estado} | Puntuación: ${lead.puntuacion || 0}/100

Devuelve EXACTAMENTE este JSON:
{
  "resumen": "máximo 2 frases qué pasó y qué implica",
  "estado_nuevo": "${lead.estado}",
  "estado_cambio": false,
  "siguiente_accion": "acción concreta",
  "fecha_siguiente": null,
  "puntuacion_delta": 0,
  "tono": "positivo",
  "emoji_evento": "💬",
  "notas_internas": ""
}

Reglas:
- estado_nuevo: uno de [nuevo, contactado, demo, cliente, descartado]
- estado_cambio: true solo si debe cambiar
- fecha_siguiente: "YYYY-MM-DD" si se menciona fecha, null si no
- puntuacion_delta: -20 a +25
- tono: positivo | neutral | negativo`

  let analysis: Record<string, unknown>
  try {
    const raw = await callAI(system, prompt)
    analysis = JSON.parse(cleanJSON(raw))
  } catch {
    return NextResponse.json({ error: 'Error en análisis IA' }, { status: 500 })
  }

  if (!ESTADOS_VALIDOS.includes(analysis.estado_nuevo as string)) {
    analysis.estado_nuevo = lead.estado
    analysis.estado_cambio = false
  }

  return NextResponse.json({ ok: true, analysis, lead })
}

export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { lead_id, texto, canal, analysis, contacto_id } = await req.json()
  if (!lead_id || !analysis) {
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
  }

  const supabase = createServerClient()

  await supabase.from('leads_comunicacion').insert({
    lead_id,
    texto_reunion: texto.substring(0, 2000),
    resumen_ia: analysis.resumen,
    canal: canal || 'nota',
    tipo_interaccion: canal || 'nota',
    contacto_id: contacto_id || null,
  })

  const { data: current } = await supabase
    .from('leads')
    .select('eventos, puntuacion')
    .eq('id', lead_id)
    .single()

  const eventos = Array.isArray(current?.eventos) ? current.eventos : []
  const puntuacionActual = current?.puntuacion || 0

  const nuevoEvento = {
    tipo: analysis.emoji_evento || '💬',
    texto: `[${(canal || 'nota').toUpperCase()}] ${analysis.resumen}${analysis.siguiente_accion ? ` → ${analysis.siguiente_accion}` : ''}`,
    fecha: new Date().toISOString().split('T')[0],
  }

  const patch: Record<string, unknown> = {
    eventos: [...eventos, nuevoEvento],
    puntuacion: Math.max(0, Math.min(100, puntuacionActual + (analysis.puntuacion_delta as number || 0))),
    siguiente_contacto_texto: analysis.siguiente_accion,
    ultima_actividad_at: new Date().toISOString(),
  }

  if (analysis.estado_cambio) patch.estado = analysis.estado_nuevo
  if (analysis.fecha_siguiente) patch.siguiente_contacto_at = analysis.fecha_siguiente

  const { data: updated, error } = await supabase
    .from('leads')
    .update(patch)
    .eq('id', lead_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, lead: updated })
}

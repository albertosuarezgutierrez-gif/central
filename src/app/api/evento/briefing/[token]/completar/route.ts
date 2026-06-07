import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { callAI } from '@/lib/ai-client'
import { tgAlert } from '@/lib/telegram'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createServerClient()

  const body = await req.json()
  const { respuestas, cliente_nombre, cliente_email, cliente_telefono } = body

  // Validar token
  const { data: briefing, error: bErr } = await supabase
    .from('evento_briefing')
    .select('id, restaurante_id, comercial_id, estado, expires_at')
    .eq('token', token)
    .eq('estado', 'pendiente')
    .gt('expires_at', new Date().toISOString())
    .single()

  if (bErr || !briefing) return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 })

  // Cargar menús disponibles para sugerir
  const { data: menus } = await supabase
    .from('menus_evento')
    .select('id, nombre, descripcion, precio_por_persona, tipo_evento, tiene_menu_infantil, precio_infantil')
    .eq('local_id', briefing.restaurante_id)
    .eq('activo', true)
    .limit(10)

  // Cargar config para rentabilidad
  const { data: config } = await supabase
    .from('config_eventos')
    .select('margen_food_pct, margen_bebidas_pct')
    .eq('local_id', briefing.restaurante_id)
    .maybeSingle()

  // NIM analiza el briefing
  const prompt = `Eres asistente de ventas de un restaurante/catering español.
Analiza este briefing de evento y devuelve SOLO JSON válido sin explicaciones:
{
  "resumen": "3 líneas máximo describiendo el evento",
  "menus_sugeridos": [{"menu_id": "id_del_menu", "razon": "por qué encaja"}],
  "precio_estimado_min": numero_euros_por_persona,
  "precio_estimado_max": numero_euros_por_persona,
  "score_viabilidad": numero_0_a_100,
  "alertas": ["alerta importante si la hay"]
}

Briefing del cliente:
${JSON.stringify(respuestas, null, 2)}

Menús disponibles:
${JSON.stringify(menus, null, 2)}

Presupuesto indicado adulto: ${respuestas.presupuesto_adulto || 'no indicado'}€
Adultos: ${respuestas.adultos || 0}, Niños: ${respuestas.ninos || 0}
Tipo de evento: ${respuestas.tipo_evento || 'no especificado'}`

  let analisisIA = {
    resumen: `Evento ${respuestas.tipo_evento || ''} para ${respuestas.adultos || 0} adultos`,
    menus_sugeridos: [],
    precio_estimado_min: respuestas.presupuesto_adulto || 0,
    precio_estimado_max: (respuestas.presupuesto_adulto || 0) * 1.2,
    score_viabilidad: 75,
    alertas: [] as string[]
  }

  try {
    const raw = await callAI('Analiza el briefing y devuelve JSON estricto', prompt, 600)
    const cleaned = raw.replace(/```json|```/g, '').trim()
    analisisIA = JSON.parse(cleaned)
  } catch (e) {
    console.error('NIM análisis briefing error:', e)
  }

  // Guardar respuestas + análisis
  const { data: updated, error: uErr } = await supabase
    .from('evento_briefing')
    .update({
      estado: 'completado',
      cliente_nombre, cliente_email, cliente_telefono,
      respuestas,
      resumen_ia: analisisIA.resumen,
      menus_sugeridos: analisisIA.menus_sugeridos,
      precio_estimado_min: analisisIA.precio_estimado_min,
      precio_estimado_max: analisisIA.precio_estimado_max,
      score_viabilidad: analisisIA.score_viabilidad,
      alertas_ia: analisisIA.alertas || [],
      completado_at: new Date().toISOString()
    })
    .eq('token', token)
    .select()
    .single()

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

  // Notificar al comercial por Telegram
  const tipoEvento = respuestas.tipo_evento || 'evento'
  const adultos = respuestas.adultos || 0
  const ninos = respuestas.ninos || 0
  await tgAlert(
    `🎉 <b>Nuevo briefing completado</b>\n` +
    `Cliente: ${cliente_nombre}\n` +
    `Tipo: ${tipoEvento} · ${adultos}A+${ninos}N\n` +
    `Fecha: ${respuestas.fecha_tentativa || 'sin definir'}\n` +
    `Presupuesto: ${respuestas.presupuesto_adulto || '?'}€/p\n` +
    `Score viabilidad: ${analisisIA.score_viabilidad}/100\n` +
    `Estimación: ${analisisIA.precio_estimado_min}-${analisisIA.precio_estimado_max}€/p`,
    'info'
  )

  return NextResponse.json({ ok: true, analisis: analisisIA })
}

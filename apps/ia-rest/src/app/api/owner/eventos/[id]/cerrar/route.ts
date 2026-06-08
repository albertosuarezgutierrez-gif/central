import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI } from '@/lib/ai-client'
import { tgAlert } from '@/lib/telegram'

// POST /api/owner/eventos/[id]/cerrar
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { consumo_real } = body

  // Ejecutar RPC de cierre
  const { data: cierre, error: cErr } = await supabase.rpc('cerrar_evento_con_informe', {
    p_evento_id: id,
    p_restaurante_id: restauranteId,
    p_consumo_real: consumo_real || {},
    p_aprobado_por: session.id
  })

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  if (cierre?.error) return NextResponse.json({ error: cierre.error }, { status: 404 })

  // Cargar datos completos para NIM
  const [{ data: evento }, { data: presupuesto }, { data: checklist }] = await Promise.all([
    supabase.from('eventos').select('*, menus_evento(nombre)').eq('id', id).single(),
    supabase.from('presupuestos_evento').select('*').eq('evento_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('evento_checklist_item').select('texto, completado').eq('evento_id', id)
  ])

  // NIM genera informe post-evento
  const promptNIM = `Eres el asistente de análisis de un restaurante/catering español.
Analiza este evento ya cerrado y devuelve SOLO JSON sin explicaciones:
{
  "resumen": "párrafo conciso del evento",
  "desviaciones": [
    {"concepto": "barra|comensales|personal|tiempo", "estimado": numero, "real": numero, "diferencia_pct": numero, "sugerencia": "texto"}
  ],
  "sugerencias_mejora": ["sugerencia 1", "sugerencia 2"],
  "ajustes_recomendados": {"consumo_litros_hora": numero_si_aplica, "merma_pct_defecto": numero_si_aplica}
}

Datos del evento:
- Tipo: ${evento?.tipo || '?'}
- Comensales previstos: ${presupuesto?.adultos || cierre.adultos_previstos} adultos
- Comensales reales: ${cierre.adultos_reales}
- Presupuesto total: ${presupuesto?.total || '?'}€
- Factura adicional: ${cierre.factura_adicional_eur}€
- Consumo real: ${JSON.stringify(consumo_real || {})}
- Checklist: ${checklist?.filter(i => i.completado).length || 0}/${checklist?.length || 0} completados`

  let analisis = {
    resumen: `Evento cerrado. ${cierre.adultos_reales} comensales reales vs ${cierre.adultos_previstos} previstos.`,
    desviaciones: [] as Array<{ concepto: string; estimado: number; real: number; diferencia_pct: number; sugerencia: string }>,
    sugerencias_mejora: [] as string[],
    ajustes_recomendados: {}
  }

  try {
    const raw = await callAI('Analiza el evento cerrado y devuelve JSON', promptNIM, 800)
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    analisis = parsed
  } catch (e) {
    console.error('NIM informe post-evento:', e)
  }

  // Actualizar informe IA con análisis real
  if (cierre.informe_id) {
    await supabase.from('evento_informe_ia').update({
      resumen: analisis.resumen,
      desviaciones: analisis.desviaciones,
      sugerencias_mejora: analisis.sugerencias_mejora,
      ajustes_recomendados: analisis.ajustes_recomendados,
      generado_at: new Date().toISOString()
    }).eq('id', cierre.informe_id)
  }

  // Enviar valoración al cliente si hay email
  if (evento?.cliente_email) {
    const { data: valToken } = await supabase.from('evento_valoracion')
      .insert({
        local_id: restauranteId,
        evento_id: id,
        cliente_email: evento.cliente_email
      })
      .select('token')
      .single()

    if (valToken?.token) {
      // TODO: Resend email con link valoración
      // Por ahora registrar en Telegram
      await tgAlert(
        `🎉 <b>Evento cerrado</b> — ${evento.cliente_nombre}\n` +
        `Comensales: ${cierre.adultos_reales} (previstos ${cierre.adultos_previstos})\n` +
        `${cierre.factura_adicional_eur > 0 ? `Factura adicional: ${cierre.factura_adicional_eur}€\n` : ''}` +
        `Link valoración: https://www.iarest.es/evento/valoracion/${valToken.token}`,
        'info'
      )
    }
  }

  // Telegram resumen informe
  if (analisis.sugerencias_mejora.length > 0) {
    await tgAlert(
      `📊 <b>Informe post-evento</b>\n${analisis.resumen}\n\n` +
      `💡 ${analisis.sugerencias_mejora[0]}`,
      'info'
    )
  }

  return NextResponse.json({
    ok: true,
    cierre,
    informe: analisis
  })
}

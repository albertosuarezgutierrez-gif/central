export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI } from '@/lib/ai-client'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const restauranteId = getRestauranteId(req)
  const { pregunta, historial } = await req.json()
  if (!pregunta?.trim()) return NextResponse.json({ error: 'pregunta requerida' }, { status: 400 })

  const supabase = createServerClient()
  const hoy = new Date().toISOString().split('T')[0]

  const [
    { data: eventosProximos },
    { data: presupuestos },
    { data: espacios },
    { data: restaurante },
  ] = await Promise.all([
    supabase.from('config_eventos')
      .select('nombre, fecha_evento, estado, tipo_evento, num_comensales')
      .eq('restaurante_id', restauranteId)
      .gte('fecha_evento', hoy)
      .order('fecha_evento', { ascending: true })
      .limit(5),
    supabase.from('presupuestos_evento')
      .select('id, estado, total, concepto, created_at')
      .eq('restaurante_id', restauranteId)
      .in('estado', ['pendiente', 'enviado', 'aceptado'])
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('espacios_evento')
      .select('nombre, aforo_max, activo')
      .eq('restaurante_id', restauranteId)
      .eq('activo', true)
      .limit(10),
    supabase.from('restaurantes').select('nombre').eq('id', restauranteId).single(),
  ])

  const eventosStr = (eventosProximos ?? []).map(e =>
    `${e.nombre} — ${e.fecha_evento} · ${e.tipo_evento ?? 'evento'} · ${e.num_comensales ?? '?'} comensales · estado: ${e.estado}`
  )

  const presupuestosStr = (presupuestos ?? []).map(p =>
    `${p.concepto ?? 'Presupuesto'} — ${p.total ?? '?'}€ · ${p.estado}`
  )

  const espaciosStr = (espacios ?? []).map(e =>
    `${e.nombre} (aforo: ${e.aforo_max ?? '?'})`
  )

  const system = `Eres el asistente de eventos de "${restaurante?.nombre ?? 'el restaurante'}".

DATOS DE EVENTOS (en tiempo real):
- Próximos eventos (${eventosStr.length}): ${eventosStr.length > 0 ? '\n  ' + eventosStr.join('\n  ') : 'ninguno programado'}
- Presupuestos activos (${presupuestosStr.length}): ${presupuestosStr.length > 0 ? '\n  ' + presupuestosStr.join('\n  ') : 'ninguno'}
- Espacios disponibles: ${espaciosStr.join(', ') || 'sin espacios configurados'}

FUNCIONES DEL MÓDULO EVENTOS:
- Crear evento: Eventos → Nuevo evento (briefing, fechas, comensales).
- Presupuesto: desde el evento → Generar presupuesto.
- Barra libre: configurar tiers de consumo.
- Check-in QR: generar QR de acceso para el día del evento.
- Informe post-evento: se genera con IA al cerrar el evento.

Responde en español, tono profesional y directo. Máximo 4 frases. No inventes cifras ni disponibilidades.`

  const msgs: { role: 'user' | 'assistant'; content: string }[] = [
    ...((historial ?? []) as { role: 'user' | 'assistant'; content: string }[]).slice(-6),
    { role: 'user', content: pregunta },
  ]

  const respuesta = await callAI(system, msgs, 400)
  return NextResponse.json({ respuesta: respuesta?.trim() ?? 'Sin respuesta disponible.' })
}

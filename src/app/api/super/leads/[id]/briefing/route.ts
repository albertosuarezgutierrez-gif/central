export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { callAI } from '@/lib/ai-client'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const { id } = await params
  const supabase = createServerClient()

  const [leadRes, comunicacionesRes, contactosRes] = await Promise.allSettled([
    supabase.from('leads').select('nombre, restaurante, estado, puntuacion, siguiente_contacto_texto, siguiente_contacto_at, ultima_actividad_at').eq('id', id).single(),
    supabase.from('leads_comunicacion').select('tipo_interaccion, canal, resumen_ia, texto_reunion, created_at, contacto:leads_contactos(nombre, cargo)').eq('lead_id', id).order('created_at', { ascending: false }).limit(8),
    supabase.from('leads_contactos').select('nombre, cargo, es_decisor, score').eq('lead_id', id).order('es_decisor', { ascending: false })
  ])

  const lead = leadRes.status === 'fulfilled' ? leadRes.value.data : null
  const comunicaciones = comunicacionesRes.status === 'fulfilled' ? (comunicacionesRes.value.data ?? []) : []
  const contactos = contactosRes.status === 'fulfilled' ? (contactosRes.value.data ?? []) : []

  if (!lead) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })

  const diasSinActividad = lead.ultima_actividad_at
    ? Math.floor((Date.now() - new Date(lead.ultima_actividad_at).getTime()) / 86400000)
    : null

  const prompt = `Eres el asistente comercial de ia.rest. Genera un briefing de 3-4 líneas sobre esta relación comercial, siendo directo y accionable.

Empresa: ${lead.nombre} (${lead.restaurante})
Estado: ${lead.estado} | Score: ${lead.puntuacion ?? 0}/100
${diasSinActividad != null ? `Días sin actividad: ${diasSinActividad}` : ''}
${lead.siguiente_contacto_texto ? `Próxima acción pendiente: ${lead.siguiente_contacto_texto}` : ''}
Contactos: ${contactos.length > 0 ? contactos.map((c: Record<string, unknown>) => `${c.nombre}${c.cargo ? ` (${c.cargo})` : ''}${c.es_decisor ? ' [DECISOR]' : ''}`).join(', ') : 'Sin contactos registrados'}
Últimas comunicaciones:
${comunicaciones.slice(0, 5).map((c: Record<string, unknown>) => {
  const contacto = Array.isArray(c.contacto) ? (c.contacto as { nombre: string }[])[0] : c.contacto as { nombre: string } | null
  return `- [${c.canal}] con ${contacto?.nombre ?? 'empresa'}: ${c.resumen_ia ?? String(c.texto_reunion ?? '').slice(0, 80) ?? 'sin resumen'}`
}).join('\n')}

Responde SOLO el briefing, sin título, directo. Máximo 4 líneas. Si hay días sin actividad elevados o pipeline avanzado sin cierre, menciónalo.`

  try {
    const briefing = await callAI(prompt, '', 200)
    return NextResponse.json({ briefing })
  } catch {
    return NextResponse.json({ briefing: 'No se pudo generar el briefing.' })
  }
}

export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { callAI } from '@/lib/ai-client'
import { tgAlert } from '@/lib/telegram'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const { id } = await params
  const supabase = createServerClient()

  const { data: lead, error } = await supabase
    .from('leads').select('*').eq('id', id).single()
  if (error || !lead) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })

  const nombre = lead.empresa || lead.restaurante || lead.nombre
  const historial = (lead.eventos || []).map((e: any) => `[${e.fecha}] ${e.tipo} ${e.texto}`).join('\n')

  const prompt = `Analiza este lead y extrae datos para personalizar su propuesta.

LEAD: ${nombre} | ${lead.ciudad || ''} | ${lead.locales || ''} locales | TPV: ${lead.tpv || 'desconocido'}
NOTAS: ${lead.notas || 'sin notas'}
HISTORIAL: ${historial || 'sin historial'}

Devuelve este JSON exacto:
{
  "pain_points_reales": ["máx 4 problemas reales/inferidos, frases cortas"],
  "modulos_recomendados": ["máx 4 de: Comandas por voz, KDS cocina, Control albaranes, Almacén y escandallos, Gestión proveedores, Eventos y catering, Analytics, Multi-local, Asistente IA cocina"],
  "datos_operativos": { "locales_nombres": [], "num_locales": 1, "tpv_actual": "", "puntos_fuertes": "" },
  "subheadline": "frase apoyo personalizada max 2 líneas"
}`

  const system = `Eres analista comercial de ia.rest (SaaS gestión restaurantes por voz e IA).
Devuelve SOLO JSON válido sin markdown, sin texto adicional.`
  const raw = await callAI(system, prompt, 700)
  let analisis: any = {}
  try { analisis = JSON.parse(raw.replace(/```json|```/g, '').trim()) }
  catch { return NextResponse.json({ error: 'Error IA', raw }, { status: 500 }) }

  await supabase.from('leads').update({
    pain_points_reales: analisis.pain_points_reales || [],
    modulos_recomendados: analisis.modulos_recomendados || [],
    datos_operativos: analisis.datos_operativos || {},
    landing_actualizada_at: new Date().toISOString(),
  }).eq('id', id)

  await tgAlert(`🔄 Landing <b>${nombre}</b> actualizada\n💡 ${analisis.headline_personalizado || ''}`, 'info')

  return NextResponse.json({ ok: true, analisis, landing_url: `https://www.iarest.es/p/${lead.landing_slug}` })
}

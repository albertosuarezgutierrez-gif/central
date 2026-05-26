export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { callAI } from '@/lib/ai-client'
import { tgAlert } from '@/lib/telegram'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const supabase = createServerClient()
  const { lead_id } = await req.json()
  if (!lead_id) return NextResponse.json({ error: 'lead_id requerido' }, { status: 400 })

  // 1. Cargar lead
  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', lead_id)
    .single()

  if (error || !lead) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })

  const empresa = lead.empresa || lead.restaurante || lead.nombre || 'Desconocido'
  const web = lead.web || ''

  // 2. Intentar obtener contenido web del restaurante
  let webContent = ''
  if (web) {
    try {
      const res = await fetch(web, {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ia.rest research bot)' }
      })
      const html = await res.text()
      webContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .substring(0, 4000)
    } catch {
      webContent = 'No se pudo acceder a la web'
    }
  }

  // 3. Generar estudio IA
  const systemPrompt = `Eres un consultor experto en hostelería española con 20 años de experiencia.
Analizas negocios para ia.rest, SaaS de gestión de restaurantes con IA.

ia.rest MÓDULOS disponibles:
- voz: Comandas por voz (camarero habla → sistema gestiona, 0 errores)
- kds: Cocina digital en tiempo real
- almacen: Almacén + escandallos + control de costes
- contabilidad: Contabilidad integrada, IVA 303, exportación A3/Sage
- qr: Pedidos desde QR en mesa (sin camarero)
- storefront: Tienda online (delivery/recogida)
- analytics: Analytics y forecaster IA
- multi_local: Gestión multi-local desde un panel
- eventos: Gestión de eventos y catering
- vinos: Carta de vinos con sommelier IA
- bridge: Bridge impresoras (ESC/POS, cualquier marca)
- rrhh: Fichaje, nóminas básicas, candidaturas IA

PRECIOS: 59€/mes base + 20€/usuario (2-6) + 15€/usuario (7+) + 12€/mesa QR/mes
Sin comisión. Trial 14 días.

Responde SOLO con JSON válido, sin markdown.`

  const userPrompt = `Analiza este lead y genera un estudio comercial completo.

DATOS DEL LEAD:
- Empresa/Local: ${empresa}
- Web: ${web || 'No disponible'}
- Email: ${lead.email || 'No disponible'}
- Locales: ${lead.locales || 'No indicado'}
- TPV actual: ${lead.tpv || 'Desconocido'}
- Notas: ${lead.notas || 'Sin notas'}
- Contenido web: ${webContent.substring(0, 2000) || 'No disponible'}

Genera este JSON exacto:
{
  "resumen_negocio": "2-3 frases describiendo el negocio basándose en los datos",
  "tipo_negocio": "bar|restaurante|cafeteria|grupo|catering|hotel",
  "ciudad": "ciudad detectada o Sevilla si no se sabe",
  "num_locales_estimado": 1,
  "num_empleados_estimado": 8,
  "ticket_medio_estimado": 25,
  "tpv_actual": "nombre del TPV actual o Desconocido",
  "coste_tpv_actual_mes": 0,
  "pain_points": ["problema concreto 1", "problema concreto 2", "problema concreto 3"],
  "oportunidades": ["oportunidad 1", "oportunidad 2"],
  "modulos_criticos": ["voz", "kds"],
  "modulos_secundarios": ["almacen", "analytics"],
  "mrr_estimado": 150,
  "ahorro_mensual_estimado": 200,
  "argumento_principal": "El argumento de venta MÁS poderoso para este negocio específico",
  "objeciones_probables": ["objeción 1", "objeción 2"],
  "resolucion_objeciones": {"objeción 1": "respuesta directa"},
  "tono_propuesta": "profesional|informal|tecnico",
  "nivel_urgencia": "alta|media|baja",
  "puntuacion_lead": 75
}`

  let estudio: Record<string, unknown> = {}
  try {
    const raw = await callAI(systemPrompt, userPrompt, 1500, 30000)
    const clean = raw.replace(/```json|```/g, '').trim()
    estudio = JSON.parse(clean)
  } catch (e) {
    console.error('[research] Error parsing estudio:', e)
    estudio = {
      resumen_negocio: `Negocio hostelero: ${empresa}`,
      tipo_negocio: 'restaurante',
      pain_points: ['Gestión manual de comandas', 'Sin control de costes', 'Sin datos de ventas'],
      modulos_criticos: ['voz', 'kds'],
      modulos_secundarios: ['almacen', 'analytics'],
      mrr_estimado: 120,
      argumento_principal: `Elimina los errores de comanda en ${empresa} desde el primer día`,
      nivel_urgencia: 'media',
      puntuacion_lead: 60,
    }
  }

  // 4. Generar email personalizado
  const emailSystem = `Eres Alberto, fundador de ia.rest. Escribes emails de venta directos, cercanos y sin florituras. Español de España. NUNCA uses palabras como "innovador", "solución", "potente" o "revolucionario". Responde SOLO con JSON válido.`

  const emailUser = `Escribe un email de presentación para este lead.

NEGOCIO: ${empresa}
ARGUMENTO PRINCIPAL: ${estudio.argumento_principal}
MÓDULOS CRÍTICOS: ${(estudio.modulos_criticos as string[])?.join(', ')}
PAIN POINTS: ${(estudio.pain_points as string[])?.join(', ')}
MRR ESTIMADO: ${estudio.mrr_estimado}€/mes
TONO: ${estudio.tono_propuesta || 'profesional'}
TPV ACTUAL: ${estudio.tpv_actual || 'desconocido'}

REGLAS:
- Máximo 120 palabras en el cuerpo
- Menciona el negocio por su nombre
- Haz referencia a UN pain point concreto
- Incluye exactamente esta línea al final del cuerpo: "He preparado una presentación específica para vosotros: __PROPUESTA_URL__"
- CTA: pedir una visita en su local, sin presión
- Firma: Alberto · ia.rest · hola@iarest.es

JSON:
{
  "asunto": "asunto del email (máx 60 chars, directo, no clickbait)",
  "cuerpo": "cuerpo completo con saltos de línea como \\n. Incluye __PROPUESTA_URL__ literalmente."
}`

  let emailData = { asunto: `ia.rest para ${empresa}`, cuerpo: `Hola,\n\n[Email generado con error - revisar]\n\nAlberto · ia.rest` }
  try {
    const rawEmail = await callAI(emailSystem, emailUser, 800, 20000)
    const cleanEmail = rawEmail.replace(/```json|```/g, '').trim()
    emailData = JSON.parse(cleanEmail)
  } catch (e) {
    console.error('[research] Error parsing email:', e)
  }

  // 5. Generar slug único
  const slugBase = empresa
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30)
  const slug = `${slugBase}-${Date.now().toString(36)}`
  const propuestaUrl = `https://www.iarest.es/propuesta/${slug}`

  const emailCuerpo = emailData.cuerpo.replace(/__PROPUESTA_URL__/g, propuestaUrl)

  // 6. Guardar en BD
  const { error: updateError } = await supabase
    .from('leads')
    .update({
      estudio_completo: estudio,
      pain_points: (estudio.pain_points as string[]) || [],
      modulos_recomendados: [
        ...((estudio.modulos_criticos as string[]) || []),
        ...((estudio.modulos_secundarios as string[]) || []),
      ],
      mrr_estimado: estudio.mrr_estimado || null,
      tpv: estudio.tpv_actual as string || lead.tpv,
      propuesta_slug: slug,
      email_draft: emailCuerpo,
      email_asunto: emailData.asunto,
      estado_pipeline: 'propuesta_lista',
      research_at: new Date().toISOString(),
    })
    .eq('id', lead_id)

  if (updateError) {
    console.error('[research] Error update:', updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // 7. Añadir evento al historial
  const { data: current } = await supabase.from('leads').select('eventos').eq('id', lead_id).single()
  const eventos = Array.isArray(current?.eventos) ? current.eventos : []
  await supabase.from('leads').update({
    eventos: [...eventos, {
      tipo: '🔍',
      texto: `Research IA completado. Puntuación: ${estudio.puntuacion_lead}/100. MRR estimado: ${estudio.mrr_estimado}€/mes`,
      fecha: new Date().toISOString().split('T')[0]
    }]
  }).eq('id', lead_id)

  // 8. Notificar Telegram
  await tgAlert(
    `🎯 Research completado\n\n<b>${empresa}</b>\n💰 MRR estimado: ${estudio.mrr_estimado}€/mes\n📦 Módulos: ${(estudio.modulos_criticos as string[])?.join(', ')}\n⭐ Puntuación: ${estudio.puntuacion_lead}/100\n\nPropuesta: ${propuestaUrl}`,
    'info'
  )

  return NextResponse.json({
    ok: true,
    slug,
    propuesta_url: propuestaUrl,
    estudio,
    email_asunto: emailData.asunto,
    email_cuerpo: emailCuerpo,
  })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { tgAlert } from '@/lib/telegram'
import Anthropic from '@anthropic-ai/sdk'

interface LocalEncontrado {
  nombre: string
  ciudad: string | null
  tipo: string
  aforo: number | null
  fuente: string
  verificado: boolean // true = encontrado en web, false = inferido/dudoso
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { id: leadId } = await params
  const supabase = createServerClient()

  // 1. Cargar datos del lead
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, nombre, restaurante, empresa')
    .eq('id', leadId)
    .single()

  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
  }

  // 2. Cargar locales ya existentes para no duplicar
  const { data: localesExistentes } = await supabase
    .from('leads_locales')
    .select('nombre')
    .eq('lead_id', leadId)

  const nombresExistentes = new Set(
    (localesExistentes ?? []).map((l) => l.nombre.toLowerCase().trim())
  )

  // 3. Nombre del grupo a buscar
  const nombreGrupo = lead.empresa || lead.restaurante || lead.nombre

  // 4. Llamar a Anthropic con web_search para localizar los locales
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let localesEncontrados: LocalEncontrado[] = []

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
      system: `Eres un investigador comercial especializado en hostelería española.
Tu tarea es encontrar TODOS los locales (restaurantes, bares, cafeterías, etc.) 
de un grupo hostelero en España.
Responde SOLO con un JSON válido, sin backticks ni explicaciones.`,
      messages: [
        {
          role: 'user',
          content: `Busca todos los locales del grupo hostelero "${nombreGrupo}" en España.
Necesito: nombre exacto de cada local, ciudad, tipo (restaurante/bar/cafetería/catering/otro) y aforo si aparece.

Devuelve EXACTAMENTE este JSON (array de locales encontrados):
[
  {
    "nombre": "Nombre exacto del local",
    "ciudad": "Ciudad o null si no se encuentra",
    "tipo": "restaurante",
    "aforo": null,
    "fuente": "URL o descripción de dónde lo encontraste",
    "verificado": true
  }
]

Si no encuentras ningún local concreto del grupo, devuelve [].
Solo incluye locales que puedas verificar en internet. No inventes.`,
        },
      ],
    })

    // Extraer el texto de la respuesta final
    let textoRespuesta = ''
    for (const block of response.content) {
      if (block.type === 'text') {
        textoRespuesta += block.text
      }
    }

    // Si hay tool_use (búsquedas), puede haber más turnos — manejar stop_reason
    // Si stop_reason es 'tool_use', hacer follow-up
    let finalContent = response.content
    let currentResponse = response

    while (currentResponse.stop_reason === 'tool_use') {
      // Recopilar resultados de herramientas
      const toolUseBlocks = currentResponse.content.filter((b) => b.type === 'tool_use')
      const toolResults = toolUseBlocks.map((b) => {
        if (b.type !== 'tool_use') return null
        return {
          type: 'tool_result' as const,
          tool_use_id: b.id,
          content: 'Búsqueda completada',
        }
      }).filter(Boolean)

      if (toolResults.length === 0) break

      // Continuar conversación con resultados
      const followUp = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
        system: `Eres un investigador comercial especializado en hostelería española.
Responde SOLO con un JSON válido, sin backticks ni explicaciones.`,
        messages: [
          {
            role: 'user',
            content: `Busca todos los locales del grupo hostelero "${nombreGrupo}" en España.
Devuelve EXACTAMENTE un JSON array con: nombre, ciudad, tipo, aforo, fuente, verificado.`,
          },
          {
            role: 'assistant',
            content: currentResponse.content,
          },
          {
            role: 'user',
            content: toolResults as Anthropic.Messages.ToolResultBlockParam[],
          },
        ],
      })

      currentResponse = followUp
      finalContent = followUp.content
    }

    // Extraer texto final
    textoRespuesta = ''
    for (const block of finalContent) {
      if (block.type === 'text') {
        textoRespuesta += block.text
      }
    }

    // Parsear JSON
    const clean = textoRespuesta
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    const parsed = JSON.parse(clean)
    if (Array.isArray(parsed)) {
      localesEncontrados = parsed
    }
  } catch (err) {
    console.error('[buscar-locales] Error IA:', err)
    return NextResponse.json(
      { error: 'Error al buscar locales con IA', detalle: String(err) },
      { status: 500 }
    )
  }

  if (localesEncontrados.length === 0) {
    return NextResponse.json({
      ok: true,
      insertados: 0,
      pendientes_manual: [],
      mensaje: `No se encontraron locales de "${nombreGrupo}" en internet. Añádelos manualmente.`,
    })
  }

  // 5. Insertar los encontrados que no existan ya
  const nuevos: LocalEncontrado[] = []
  const yaExistian: string[] = []
  const pendientesManual: LocalEncontrado[] = []

  for (const local of localesEncontrados) {
    const nombreNorm = local.nombre.toLowerCase().trim()
    if (nombresExistentes.has(nombreNorm)) {
      yaExistian.push(local.nombre)
      continue
    }

    if (!local.verificado) {
      pendientesManual.push(local)
      continue
    }

    nuevos.push(local)
  }

  // Insertar en BD
  let insertados = 0
  if (nuevos.length > 0) {
    const { error: insErr } = await supabase.from('leads_locales').insert(
      nuevos.map((l) => ({
        lead_id: leadId,
        nombre: l.nombre,
        ciudad: l.ciudad || null,
        tipo: l.tipo || 'restaurante',
        aforo: l.aforo || null,
        notas: l.fuente ? `Encontrado por IA: ${l.fuente}` : 'Encontrado por IA',
      }))
    )
    if (!insErr) insertados = nuevos.length
  }

  // 6. Telegram con resumen
  const lineas = [
    `🔍 <b>Locales encontrados — ${nombreGrupo}</b>`,
    `✅ Insertados: ${insertados}`,
    yaExistian.length > 0 ? `↩️ Ya existían: ${yaExistian.length}` : null,
    pendientesManual.length > 0
      ? `⚠️ Pendientes verificación manual: ${pendientesManual.map((p) => p.nombre).join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  await tgAlert(lineas, 'info').catch(() => {})

  return NextResponse.json({
    ok: true,
    insertados,
    ya_existian: yaExistian,
    pendientes_manual: pendientesManual,
    todos_encontrados: localesEncontrados,
    mensaje:
      insertados > 0
        ? `Se añadieron ${insertados} locales automáticamente.`
        : 'No se añadieron locales nuevos.',
  })
}

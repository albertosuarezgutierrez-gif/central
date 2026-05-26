export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'
import Anthropic from '@anthropic-ai/sdk'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''

interface LocalEncontrado {
  nombre: string
  ciudad: string | null
  tipo: string
  aforo: number | null
  fuente: string
  verificado: boolean
}

async function buscarLocalesGrupo(nombreGrupo: string): Promise<LocalEncontrado[]> {
  if (!ANTHROPIC_KEY) return []

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_KEY })

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
      system: `Eres un investigador de hostelería española. Responde SOLO con JSON válido, sin backticks.`,
      messages: [{
        role: 'user',
        content: `Busca todos los locales (restaurantes, bares, haciendas, etc.) del grupo hostelero "${nombreGrupo}" en España.

Devuelve SOLO este JSON array:
[{"nombre":"Local exacto","ciudad":"Ciudad","tipo":"restaurante","aforo":null,"fuente":"URL donde lo viste","verificado":true}]

Si no encuentras ninguno con seguridad, devuelve []. No inventes locales.`,
      }],
    })

    // Seguir turnos si hay tool_use
    let current = response
    while (current.stop_reason === 'tool_use') {
      const toolUses = current.content.filter(b => b.type === 'tool_use')
      if (toolUses.length === 0) break

      const followUp = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
        system: `Eres un investigador de hostelería española. Responde SOLO con JSON válido, sin backticks.`,
        messages: [
          { role: 'user', content: `Busca todos los locales del grupo hostelero "${nombreGrupo}" en España. Devuelve SOLO JSON array con: nombre, ciudad, tipo, aforo, fuente, verificado.` },
          { role: 'assistant', content: current.content },
          { role: 'user', content: toolUses.map(b => b.type === 'tool_use' ? ({ type: 'tool_result' as const, tool_use_id: b.id, content: 'Búsqueda completada' }) : null).filter(Boolean) as Anthropic.Messages.ToolResultBlockParam[] },
        ],
      })
      current = followUp
    }

    const texto = current.content.filter(b => b.type === 'text').map(b => b.type === 'text' ? b.text : '').join('')
    const clean = texto.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
    const match = clean.match(/\[[\s\S]*\]/)
    if (!match) return []
    const parsed = JSON.parse(match[0])
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.error('[completar-locales] Error IA para', nombreGrupo, err)
    return []
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  // 1. Leads que no tienen ningún local registrado
  const { data: todosLeads } = await supabase
    .from('leads')
    .select('id, nombre, empresa, restaurante')
    .not('estado', 'eq', 'descartado')

  if (!todosLeads || todosLeads.length === 0) {
    return NextResponse.json({ ok: true, procesados: 0 })
  }

  // 2. Leads que ya tienen locales
  const { data: leadsConLocales } = await supabase
    .from('leads_locales')
    .select('lead_id')

  const idsConLocales = new Set((leadsConLocales ?? []).map(l => l.lead_id))

  // 3. Filtrar solo los que no tienen locales
  const leadsSinLocales = todosLeads.filter(l => !idsConLocales.has(l.id))

  if (leadsSinLocales.length === 0) {
    await tgAlert('📍 Completar locales: todos los leads ya tienen locales registrados.', 'info')
    return NextResponse.json({ ok: true, procesados: 0 })
  }

  // 4. Procesar hasta 5 por ejecución (para no superar maxDuration)
  const lote = leadsSinLocales.slice(0, 5)
  let totalInsertados = 0
  const resumen: string[] = []

  for (const lead of lote) {
    const nombreGrupo = lead.empresa || lead.restaurante || lead.nombre
    const locales = await buscarLocalesGrupo(nombreGrupo)

    const verificados = locales.filter(l => l.verificado && l.nombre?.trim())
    if (verificados.length === 0) {
      resumen.push(`• ${nombreGrupo}: no encontrado en web`)
      // Pausa entre llamadas
      await new Promise(r => setTimeout(r, 2000))
      continue
    }

    const { error } = await supabase.from('leads_locales').insert(
      verificados.map(l => ({
        lead_id: lead.id,
        nombre: l.nombre,
        ciudad: l.ciudad || null,
        tipo: l.tipo || 'restaurante',
        aforo: l.aforo || null,
        notas: l.fuente ? `IA: ${l.fuente}` : 'Encontrado automáticamente por IA',
      }))
    )

    if (!error) {
      totalInsertados += verificados.length
      resumen.push(`• ${nombreGrupo}: ${verificados.length} locales añadidos`)
    }

    // Pausa entre grupos para no saturar la API
    await new Promise(r => setTimeout(r, 2000))
  }

  const pendientesRestantes = leadsSinLocales.length - lote.length

  await tgAlert(
    `📍 <b>Locales completados automáticamente</b>\n${totalInsertados} locales insertados en ${lote.length} grupos\n\n${resumen.join('\n')}${pendientesRestantes > 0 ? `\n\n⏳ ${pendientesRestantes} grupos pendientes (próxima ejecución)` : ''}`,
    'info'
  )

  return NextResponse.json({ ok: true, procesados: lote.length, insertados: totalInsertados, pendientes: pendientesRestantes })
}

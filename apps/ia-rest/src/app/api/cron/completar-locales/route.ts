export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'
import { callAISearch, cleanJSON } from '@/lib/ai-client'

interface LocalEncontrado {
  nombre: string
  ciudad: string | null
  tipo: string
  aforo: number | null
  fuente: string
  verificado: boolean
}

async function buscarLocalesGrupo(nombreGrupo: string): Promise<LocalEncontrado[]> {
  try {
    const texto = await callAISearch(
      `Eres un investigador de hostelería española. Responde SOLO con JSON válido, sin backticks.`,
      `Busca todos los locales (restaurantes, bares, haciendas, etc.) del grupo hostelero "${nombreGrupo}" en España.

Devuelve SOLO este JSON array:
[{"nombre":"Local exacto","ciudad":"Ciudad","tipo":"restaurante","aforo":null,"fuente":"URL donde lo viste","verificado":true}]

Si no encuentras ninguno con seguridad, devuelve []. No inventes locales.`,
      1500,
      45_000
    )
    const match = cleanJSON(texto).match(/\[[\s\S]*\]/)
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

  // 4. Procesar 1 por ejecución (búsqueda web tarda ~15s, timeout 60s)
  const lote = leadsSinLocales.slice(0, 1)
  let totalInsertados = 0
  const resumen: string[] = []

  for (const lead of lote) {
    const nombreGrupo = lead.empresa || lead.restaurante || lead.nombre
    const locales = await buscarLocalesGrupo(nombreGrupo)

    const verificados = locales.filter(l => l.verificado && l.nombre?.trim())
    if (verificados.length === 0) {
      // Marcar como intentado para no reprocesar (registro centinela)
      await supabase.from('leads_locales').insert({
        lead_id: lead.id,
        nombre: '⚠️ Sin locales encontrados en internet',
        ciudad: null,
        tipo: 'otro',
        aforo: null,
        notas: 'auto:sin_resultado — añadir manualmente si procede',
      })
      resumen.push(`• ${nombreGrupo}: no encontrado en web`)
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

  // Solo alertar si hay inserciones reales
  if (totalInsertados > 0) {
    await tgAlert(
      `📍 <b>Locales completados automáticamente</b>\n${totalInsertados} locales insertados en ${lote.length} grupos\n\n${resumen.join('\n')}${pendientesRestantes > 0 ? `\n\n⏳ ${pendientesRestantes} grupos pendientes` : ''}`,
      'info'
    )
  }

  return NextResponse.json({ ok: true, procesados: lote.length, insertados: totalInsertados, pendientes: pendientesRestantes })
}

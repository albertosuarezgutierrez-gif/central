export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { callAI, cleanJSON } from '@/lib/ai-client'
import { tgAlert } from '@/lib/telegram'

const LOTE = 3

// Clasifica el vertical de un lead a partir de su nombre/web/notas.
async function clasificar(nombre: string, web: string, notas: string): Promise<string | null> {
  try {
    const raw = await callAI(
      `Clasificas negocios de hostelería española en un único tipo. Responde SOLO JSON.`,
      `Negocio: ${nombre} | Web: ${web || 'N/A'} | Notas: ${notas || 'N/A'}
JSON: {"tipo_negocio":"restaurante|bar|catering|eventos"}
Usa "eventos" si es hacienda, finca, cortijo o espacio para bodas/eventos. Usa "catering" si es empresa de catering.`,
      120, 10000, true
    )
    const parsed = JSON.parse(cleanJSON(raw)) as { tipo_negocio?: string }
    const t = (parsed.tipo_negocio || '').toLowerCase()
    if (['restaurante', 'bar', 'catering', 'eventos'].includes(t)) return t
    return null
  } catch {
    return null
  }
}

// Intenta extraer un email público de la web del negocio.
async function emailDeWeb(web: string): Promise<string | null> {
  if (!web) return null
  try {
    const url = web.startsWith('http') ? web : `https://${web}`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'Mozilla/5.0' } })
    const html = await res.text()
    const match = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
    const email = match?.[0]?.toLowerCase()
    if (!email) return null
    if (/\.(png|jpg|jpeg|gif|webp|svg)$/.test(email)) return null // falso positivo de assets
    if (email.includes('example.') || email.includes('sentry') || email.includes('wixpress')) return null
    return email
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const supabase = createServerClient()

  // Leads de Sevilla sin tipo_negocio (los que no entran al embudo por vertical).
  const { data: leads } = await supabase
    .from('leads')
    .select('id, nombre, empresa, restaurante, web, email, notas, tipo_negocio')
    .ilike('ciudad', '%Sevilla%')
    .or('tipo_negocio.is.null,tipo_negocio.eq.')
    .neq('estado', 'descartado')
    .limit(LOTE)

  if (!leads || leads.length === 0) {
    return NextResponse.json({ ok: true, procesados: 0, motivo: 'sin leads que clasificar' })
  }

  let procesados = 0
  const resumen: string[] = []
  for (const lead of leads) {
    const nombre = (lead.empresa || lead.restaurante || lead.nombre || '') as string
    const web = (lead.web || '') as string

    const tipo = await clasificar(nombre, web, (lead.notas as string) || '')
    const update: Record<string, unknown> = {}
    if (tipo) update.tipo_negocio = tipo

    if (!lead.email) {
      const email = await emailDeWeb(web)
      if (email) update.email = email
    }

    if (Object.keys(update).length > 0) {
      await supabase.from('leads').update(update).eq('id', lead.id)
      procesados++
      resumen.push(`• ${nombre}: ${tipo || '—'}${update.email ? ' +email' : ''}`)
    }
    await new Promise((r) => setTimeout(r, 1000))
  }

  if (procesados > 0) {
    await tgAlert(`🧩 Backfill leads Sevilla: ${procesados} clasificados.\n${resumen.join('\n')}`, 'info')
  }
  return NextResponse.json({ ok: true, procesados })
}

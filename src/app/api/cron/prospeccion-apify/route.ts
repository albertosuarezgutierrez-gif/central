export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'
import { startPlacesRun, getRunResults, apifyConfigurado, type ApifyVertical, type ApifyPlace } from '@/lib/apify'

// Rotación de queries de Sevilla: recorre los 3 verticales.
const QUERIES: Array<{ vertical: ApifyVertical; query: string }> = [
  { vertical: 'catering', query: 'empresas de catering Sevilla' },
  { vertical: 'eventos', query: 'haciendas para bodas Sevilla' },
  { vertical: 'restaurante', query: 'restaurantes Sevilla centro' },
  { vertical: 'catering', query: 'catering bodas y eventos Sevilla' },
  { vertical: 'eventos', query: 'fincas para eventos Sevilla provincia' },
  { vertical: 'restaurante', query: 'bares y restaurantes Sevilla' },
]
const MAX_PLACES = 18

function norm(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '').trim()
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!apifyConfigurado()) {
    return NextResponse.json({ ok: true, skipped: 'sin APIFY_TOKEN' })
  }

  const supabase = createServerClient()

  // ── FASE B: recoger un run pendiente ───────────────────────────────────────
  const { data: pendientes } = await supabase
    .from('prospeccion_apify_runs')
    .select('*')
    .eq('status', 'pending')
    .order('started_at', { ascending: true })
    .limit(1)

  const run = pendientes?.[0]
  if (run) {
    const res = await getRunResults(run.run_id)
    if (res.status !== 'SUCCEEDED') {
      // Sigue corriendo, o falló: marcar failed en estados terminales de error.
      if (['FAILED', 'ABORTED', 'TIMED-OUT', 'ERROR'].includes(res.status)) {
        await supabase.from('prospeccion_apify_runs')
          .update({ status: 'failed', finished_at: new Date().toISOString() })
          .eq('id', run.id)
        return NextResponse.json({ ok: true, fase: 'B', run: run.id, status: res.status })
      }
      return NextResponse.json({ ok: true, fase: 'B', run: run.id, status: res.status, esperando: true })
    }

    const items = res.items || []
    const insertados = await ingestar(supabase, items, run.vertical as ApifyVertical)
    await supabase.from('prospeccion_apify_runs').update({
      status: 'ingested',
      dataset_id: res.datasetId || null,
      items_total: items.length,
      items_ingestados: insertados,
      finished_at: new Date().toISOString(),
    }).eq('id', run.id)

    if (insertados > 0) {
      await tgAlert(`📍 Apify (${run.vertical}) Sevilla: ${insertados} leads nuevos de ${items.length} sitios.`, 'info')
    }
    return NextResponse.json({ ok: true, fase: 'B', run: run.id, insertados, total: items.length })
  }

  // ── FASE A: lanzar el siguiente run ────────────────────────────────────────
  const { count } = await supabase
    .from('prospeccion_apify_runs')
    .select('id', { count: 'exact', head: true })
  const idx = (count || 0) % QUERIES.length
  const next = QUERIES[idx]

  const runId = await startPlacesRun(next.query, MAX_PLACES)
  if (!runId) {
    return NextResponse.json({ ok: false, fase: 'A', error: 'no se pudo lanzar el run' }, { status: 502 })
  }
  await supabase.from('prospeccion_apify_runs').insert({
    vertical: next.vertical,
    query: next.query,
    run_id: runId,
    status: 'pending',
  })
  return NextResponse.json({ ok: true, fase: 'A', lanzado: next.query, run: runId })
}

// Normaliza items de Apify → leads, con dedup contra leads existentes.
async function ingestar(
  supabase: ReturnType<typeof createServerClient>,
  items: ApifyPlace[],
  vertical: ApifyVertical
): Promise<number> {
  if (items.length === 0) return 0

  const { data: existentes } = await supabase.from('leads').select('empresa, restaurante, web, ciudad')
  const websSet = new Set((existentes || []).map((l) => norm(l.web)).filter(Boolean))
  const nombreCiudadSet = new Set(
    (existentes || []).flatMap((l) =>
      [l.empresa, l.restaurante].filter(Boolean).map((n: string) => `${n.toLowerCase()}|${norm(l.ciudad)}`)
    )
  )

  const nuevos = items
    .filter((it) => it.title && it.title.trim())
    .filter((it) => {
      const w = norm(it.website)
      const nc = `${it.title!.toLowerCase()}|${norm(it.city || 'sevilla')}`
      if (w && websSet.has(w)) return false
      if (nombreCiudadSet.has(nc)) return false
      // dedup intra-lote
      if (w) websSet.add(w)
      nombreCiudadSet.add(nc)
      return true
    })
    .map((it) => ({
      nombre: it.title!,
      empresa: it.title!,
      restaurante: it.title!,
      ciudad: it.city || 'Sevilla',
      web: it.website || null,
      telefono: it.phone || it.phoneUnformatted || null,
      email: it.emails?.[0] || null,
      tipo_negocio: vertical,
      tipo: 'prospecto',
      estado: 'nuevo',
      estado_pipeline: 'prospecto_ia',
      origen: 'apify_google_places',
      notas: [it.categoryName, it.totalScore ? `⭐${it.totalScore}` : null].filter(Boolean).join(' · '),
      eventos: [{
        tipo: '🤖',
        texto: `Encontrado por Apify Google Places (Sevilla, ${vertical})`,
        fecha: new Date().toISOString().split('T')[0],
      }],
    }))

  if (nuevos.length === 0) return 0
  const { error } = await supabase.from('leads').insert(nuevos)
  if (error) { console.error('[prospeccion-apify] insert leads:', error.message); return 0 }
  return nuevos.length
}

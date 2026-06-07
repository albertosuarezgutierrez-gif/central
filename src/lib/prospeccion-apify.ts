// Núcleo del agente de sourcing Apify Google Places (Sevilla), en 2 fases.
// Lo usan el cron `/api/cron/prospeccion-apify` y el panel `/api/super/prospeccion-apify`.

import type { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'
import { startPlacesRun, getRunResults, apifyConfigurado, type ApifyVertical, type ApifyPlace } from '@/lib/apify'

type SupabaseSrv = ReturnType<typeof createServerClient>

// Rotación de queries de Sevilla: recorre los 3 verticales y varias zonas.
export const QUERIES: Array<{ vertical: ApifyVertical; query: string }> = [
  // Catering
  { vertical: 'catering', query: 'empresas de catering Sevilla' },
  { vertical: 'catering', query: 'catering bodas y eventos Sevilla' },
  { vertical: 'catering', query: 'catering para empresas Sevilla' },
  { vertical: 'catering', query: 'catering Aljarafe Sevilla' },
  { vertical: 'catering', query: 'catering Sevilla Este Dos Hermanas' },
  // Eventos / haciendas / espacios
  { vertical: 'eventos', query: 'haciendas para bodas Sevilla' },
  { vertical: 'eventos', query: 'fincas para eventos Sevilla provincia' },
  { vertical: 'eventos', query: 'haciendas para bodas Aljarafe Sevilla' },
  { vertical: 'eventos', query: 'salones de celebraciones y banquetes Sevilla' },
  { vertical: 'eventos', query: 'cortijos y haciendas eventos provincia de Sevilla' },
  // Restaurantes / bares
  { vertical: 'restaurante', query: 'restaurantes Sevilla centro' },
  { vertical: 'restaurante', query: 'bares y restaurantes Sevilla' },
  { vertical: 'restaurante', query: 'restaurantes Sevilla Este' },
  { vertical: 'restaurante', query: 'restaurantes Triana Sevilla' },
  { vertical: 'restaurante', query: 'restaurantes Dos Hermanas y Aljarafe' },
  // Franquicias / cadenas de hostelería (nacional — locales de marca)
  { vertical: 'franquicia', query: 'franquicias de restauración Madrid' },
  { vertical: 'franquicia', query: 'franquicias de hostelería Barcelona' },
  { vertical: 'franquicia', query: 'franquicias de comida rápida Valencia' },
  { vertical: 'franquicia', query: 'cadenas de restaurantes Sevilla' },
  { vertical: 'franquicia', query: 'franquicias de cafetería y heladería España' },
  { vertical: 'franquicia', query: 'franquicias de hamburgueserías Málaga' },
]
export const MAX_PLACES = 30

function norm(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '').trim()
}

// Avanza el agente una vuelta: recoge un run pendiente o lanza el siguiente.
export async function avanzarProspeccionApify(
  supabase: SupabaseSrv
): Promise<Record<string, unknown>> {
  if (!apifyConfigurado()) return { ok: true, skipped: 'sin APIFY_TOKEN' }

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
      if (['FAILED', 'ABORTED', 'TIMED-OUT', 'ERROR'].includes(res.status)) {
        await supabase.from('prospeccion_apify_runs')
          .update({ status: 'failed', finished_at: new Date().toISOString() })
          .eq('id', run.id)
        return { ok: true, fase: 'B', run: run.id, status: res.status }
      }
      return { ok: true, fase: 'B', run: run.id, status: res.status, esperando: true }
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
      const ambito = run.vertical === 'franquicia' ? 'nacional' : 'Sevilla'
      await tgAlert(`📍 Apify (${run.vertical}) ${ambito}: ${insertados} leads nuevos de ${items.length} sitios.`, 'info')
    }
    return { ok: true, fase: 'B', run: run.id, insertados, total: items.length }
  }

  // ── FASE A: lanzar el siguiente run ────────────────────────────────────────
  const { count } = await supabase
    .from('prospeccion_apify_runs')
    .select('id', { count: 'exact', head: true })
  const idx = (count || 0) % QUERIES.length
  const next = QUERIES[idx]

  const runId = await startPlacesRun(next.query, MAX_PLACES)
  if (!runId) return { ok: false, fase: 'A', error: 'no se pudo lanzar el run' }

  await supabase.from('prospeccion_apify_runs').insert({
    vertical: next.vertical,
    query: next.query,
    run_id: runId,
    status: 'pending',
  })
  return { ok: true, fase: 'A', lanzado: next.query, run: runId }
}

// Normaliza items de Apify → leads, con dedup contra leads existentes.
async function ingestar(
  supabase: SupabaseSrv,
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
      if (w) websSet.add(w)
      nombreCiudadSet.add(nc)
      return true
    })
    .map((it) => ({
      nombre: it.title!,
      empresa: it.title!,
      restaurante: it.title!,
      ciudad: it.city || (vertical === 'franquicia' ? 'España' : 'Sevilla'),
      web: it.website || null,
      telefono: it.phone || it.phoneUnformatted || '', // leads.telefono es NOT NULL
      email: it.emails?.[0] || null,
      tipo_negocio: vertical,
      tipo: 'online', // CHECK leads_tipo_check: solo 'online' | 'personal'
      estado: 'nuevo',
      estado_pipeline: 'prospecto_ia',
      origen: 'apify_google_places',
      notas: [it.categoryName, it.totalScore ? `⭐${it.totalScore}` : null].filter(Boolean).join(' · '),
      eventos: [{
        tipo: '🤖',
        texto: `Encontrado por Apify Google Places (${vertical === 'franquicia' ? 'nacional' : 'Sevilla'}, ${vertical})`,
        fecha: new Date().toISOString().split('T')[0],
      }],
    }))

  if (nuevos.length === 0) return 0
  const { error } = await supabase.from('leads').insert(nuevos)
  if (error) { console.error('[prospeccion-apify] insert leads:', error.message); return 0 }
  return nuevos.length
}

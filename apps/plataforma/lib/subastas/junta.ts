// ────────────────────────────────────────────────────────────────────────────
// Adaptador de la D.G. de Patrimonio de la Junta de Andalucía (Fase 3).
// Aquí va SOLO la red; el parseo es puro (`@central/module-subastas/junta`).
//
// Dos páginas Drupal renderizadas en servidor (verificadas el 29/07/2026):
//   · subastas-abierto.html    → subastas administrativas con plazo abierto
//     (ese día: «Sin subastas y procedimientos abiertos actualmente»)
//   · inmueb-adqu-directa.html → lotes desiertos en venta directa por precio
//     mínimo (ese día: 18 lotes reales, 4 de Sevilla y 2 de Cádiz)
//
// Una página que cambie de forma NO rompe el cron: cada una se ingiere en su
// try/catch y el fallo se devuelve como aviso.
// ────────────────────────────────────────────────────────────────────────────
import { loteASubasta, parsearPatrimonioJunta } from '@central/module-subastas'
import { upsertSubastas, type SubastaEnriquecida } from '@/lib/subastas-ingesta'

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const BASE = 'https://www.juntadeandalucia.es/organismos/economiahaciendayfondoseuropeos/areas/patrimonio/subastas-concursos/paginas'

const PAGINAS = [
  { origen: 'subasta' as const, url: `${BASE}/subastas-abierto.html` },
  { origen: 'directa' as const, url: `${BASE}/inmueb-adqu-directa.html` },
]

async function bajar(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.text()
}

/** Ingesta de las dos páginas de patrimonio. Best-effort por página. */
export async function ingerirJunta(): Promise<{ lotes: number; upserts: number; avisos: string[] }> {
  const subastas: SubastaEnriquecida[] = []
  const avisos: string[] = []

  for (const p of PAGINAS) {
    try {
      const html = await bajar(p.url)
      for (const lote of parsearPatrimonioJunta(html)) {
        subastas.push(loteASubasta(lote, p.origen, p.url))
      }
    } catch (e: any) {
      console.error('[subastas-junta]', p.origen, e)
      avisos.push(`${p.origen}: ${e?.message ?? String(e)}`)
    }
  }

  const upserts = subastas.length ? await upsertSubastas(subastas) : 0
  return { lotes: subastas.length, upserts, avisos }
}

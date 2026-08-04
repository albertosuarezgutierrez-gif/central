// Ingesta de BORME. Corre en el servidor (Vercel), donde hay salida a boe.es.
// Flujo real: sumario diario → items de la Sección A (uno por provincia, con url_xml) → se baja el
// XML de cada provincia (en paralelo) y se parsean los pares empresa/acto → upsert en lote.
import { Prisma } from '@prisma/client'
import { XMLParser } from 'fast-xml-parser'
import { prisma } from '@/lib/db'
import { parseActosProvincia, type EventoBorme, type PElem, type TipoEvento } from '@/lib/borme'

const BASE = 'https://www.boe.es/datosabiertos/api/borme'
const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

// Fase 1: feed de DIFICULTAD + tocó financiación. Los ceses/nombramientos (cambio de administración)
// son ruido rutinario → no se ingieren.
const TIPOS_INGERIDOS: ReadonlySet<TipoEvento> = new Set<TipoEvento>(['concurso', 'disolucion', 'ampliacion_capital'])

export interface ItemProvincia {
  provincia: string | null
  urlXml: string
  id: string
}

/** Ejecuta `fn` sobre `items` con concurrencia limitada. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return out
}

/** Descarga el sumario de una fecha (YYYYMMDD) y devuelve los boletines provinciales de la Sección A. */
export async function descargarSumario(fechaYYYYMMDD: string): Promise<ItemProvincia[]> {
  const r = await fetch(`${BASE}/sumario/${fechaYYYYMMDD}`, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`BORME sumario ${fechaYYYYMMDD}: HTTP ${r.status}`)
  const j = (await r.json()) as any
  const secciones = j?.data?.sumario?.diario?.[0]?.seccion ?? j?.sumario?.diario?.[0]?.seccion ?? []
  const arr = Array.isArray(secciones) ? secciones : [secciones]
  const secA = arr.filter((s: any) => s?.codigo === 'A') // "Empresarios. Actos inscritos"
  const items: any[] = secA.flatMap((s: any) => (Array.isArray(s.item) ? s.item : s.item ? [s.item] : []))
  return items
    .filter((it) => it?.url_xml)
    .map((it) => ({ provincia: (it.titulo ?? null) as string | null, urlXml: it.url_xml as string, id: String(it.identificador ?? '') }))
}

/** Baja y parsea el XML de un boletín provincial → eventos. */
export async function ingerirProvincia(item: ItemProvincia, fecha: string): Promise<EventoBorme[]> {
  const r = await fetch(item.urlXml)
  if (!r.ok) throw new Error(`BORME xml ${item.id}: HTTP ${r.status}`)
  const doc = xmlParser.parse(await r.text()) as any
  const rawPs = doc?.documento?.texto?.p ?? []
  const arr = Array.isArray(rawPs) ? rawPs : [rawPs]
  const ps: PElem[] = arr.map((p: any) => ({
    clazz: String(p?.['@_class'] ?? ''),
    text: typeof p === 'string' ? p : String(p?.['#text'] ?? ''),
  }))
  return parseActosProvincia(ps, item.provincia, item.id, fecha)
}

/** Upsert en LOTE (chunks) de una lista de eventos, deduplicada por dedupe_key. Devuelve cuántos. */
export async function ingerirEventos(eventos: EventoBorme[]): Promise<number> {
  // Dedup en memoria: un mismo dedupe_key dos veces en un INSERT rompe el ON CONFLICT.
  const byKey = new Map<string, EventoBorme>()
  for (const e of eventos) byKey.set(e.dedupeKey, e)
  const uniq = [...byKey.values()]
  if (!uniq.length) return 0

  const CHUNK = 200
  let n = 0
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const slice = uniq.slice(i, i + CHUNK)
    const rows = slice.map(
      (e) =>
        Prisma.sql`(${e.dedupeKey}, ${e.fecha}::date, ${e.empresa}, ${e.empresaNorm}, ${e.provincia}, ${e.tipo}, ${e.actoRaw}, ${e.bormeId}, ${e.url})`,
    )
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO borme_eventos (dedupe_key, fecha, empresa, empresa_norm, provincia, tipo, acto_raw, borme_id, url)
      VALUES ${Prisma.join(rows)}
      ON CONFLICT (dedupe_key) DO UPDATE SET acto_raw = EXCLUDED.acto_raw, actualizado_en = now()`)
    n += slice.length
  }
  return n
}

/** Ingesta completa de un día. isoDate = 'YYYY-MM-DD'. */
export async function ingestaDia(isoDate: string): Promise<{ eventos: number; provincias: number }> {
  const yyyymmdd = isoDate.replace(/-/g, '')
  const items = await descargarSumario(yyyymmdd)
  const listas = await mapLimit(items, 8, (item) =>
    ingerirProvincia(item, isoDate).catch((e) => {
      console.error('[borme] provincia', item.id, e)
      return [] as EventoBorme[]
    }),
  )
  const todos = listas.flat().filter((e) => TIPOS_INGERIDOS.has(e.tipo))
  const n = await ingerirEventos(todos)
  return { eventos: n, provincias: items.length }
}

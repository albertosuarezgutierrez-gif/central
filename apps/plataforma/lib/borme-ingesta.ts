// Ingesta de BORME. Corre en el servidor (Vercel), donde hay salida a boe.es.
// Flujo real: sumario diario → items de la Sección A (uno por provincia, con url_xml) → se baja el
// XML de cada provincia y se parsean los pares empresa/acto → upsert idempotente en borme_eventos.
import { Prisma } from '@prisma/client'
import { XMLParser } from 'fast-xml-parser'
import { prisma } from '@/lib/db'
import { parseActosProvincia, type EventoBorme, type PElem } from '@/lib/borme'

const BASE = 'https://www.boe.es/datosabiertos/api/borme'
const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

export interface ItemProvincia {
  provincia: string | null
  urlXml: string
  id: string
}

/** Descarga el sumario de una fecha (YYYYMMDD) y devuelve los boletines provinciales de la Sección A. */
export async function descargarSumario(fechaYYYYMMDD: string): Promise<ItemProvincia[]> {
  const r = await fetch(`${BASE}/sumario/${fechaYYYYMMDD}`, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`BORME sumario ${fechaYYYYMMDD}: HTTP ${r.status}`)
  const j = (await r.json()) as any
  const secciones = j?.data?.sumario?.diario?.[0]?.seccion ?? j?.sumario?.diario?.[0]?.seccion ?? []
  const arr = Array.isArray(secciones) ? secciones : [secciones]
  const secA = arr.filter((s: any) => s?.codigo === 'A') // "Empresarios. Actos inscritos" (concurso/disolución/…)
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

/** Upsert idempotente de una lista de eventos. Devuelve cuántos se procesaron. */
export async function ingerirEventos(eventos: EventoBorme[]): Promise<number> {
  let n = 0
  for (const e of eventos) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO borme_eventos (dedupe_key, fecha, empresa, empresa_norm, provincia, tipo, acto_raw, borme_id, url)
      VALUES (${e.dedupeKey}, ${e.fecha}::date, ${e.empresa}, ${e.empresaNorm}, ${e.provincia}, ${e.tipo}, ${e.actoRaw}, ${e.bormeId}, ${e.url})
      ON CONFLICT (dedupe_key) DO UPDATE SET acto_raw = EXCLUDED.acto_raw, actualizado_en = now()`)
    n++
  }
  return n
}

/** Ingesta completa de un día. isoDate = 'YYYY-MM-DD'. */
export async function ingestaDia(isoDate: string): Promise<{ eventos: number; provincias: number }> {
  const yyyymmdd = isoDate.replace(/-/g, '')
  const items = await descargarSumario(yyyymmdd)
  const todos: EventoBorme[] = []
  for (const item of items) {
    try {
      todos.push(...(await ingerirProvincia(item, isoDate)))
    } catch (e) {
      console.error('[borme] provincia', item.id, e)
    }
  }
  const n = await ingerirEventos(todos)
  return { eventos: n, provincias: items.length }
}

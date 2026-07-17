// Ingesta de BORME: descarga el sumario de una fecha, parsea los anuncios y hace upsert idempotente
// en public.borme_eventos. Corre en el servidor (Vercel), donde hay salida a boe.es.
// OJO: la ruta de extracción de anuncios del sumario se confirma contra el feed real en el primer
// despliegue (este entorno de desarrollo bloquea boe.es). La lectura es defensiva.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { parseAnuncio, type EventoBorme } from '@/lib/borme'

const BASE = 'https://www.boe.es/datosabiertos/api/borme'

/** Descarga el sumario BORME de una fecha (YYYYMMDD) y devuelve la lista de anuncios. */
export async function descargarSumario(fechaYYYYMMDD: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(`${BASE}/sumario/${fechaYYYYMMDD}`, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`BORME sumario ${fechaYYYYMMDD}: HTTP ${r.status}`)
  const j = (await r.json()) as any
  // El sumario del BOE anida diario[].seccion[].item[]. Se recorre de forma tolerante.
  const diarios: any[] = j?.data?.sumario?.diario ?? j?.sumario?.diario ?? []
  const items: any[] = diarios.flatMap((d: any) => {
    const secciones: any[] = d?.seccion ?? d?.secciones ?? []
    return secciones.flatMap((s: any) => {
      const it = s?.item ?? s?.items ?? []
      return Array.isArray(it) ? it : [it]
    })
  })
  return items.filter(Boolean) as Array<Record<string, unknown>>
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
export async function ingestaDia(isoDate: string): Promise<{ eventos: number; total: number }> {
  const yyyymmdd = isoDate.replace(/-/g, '')
  const anuncios = await descargarSumario(yyyymmdd)
  const eventos = anuncios
    .flatMap((a) => parseAnuncio(a, isoDate))
    .filter((e) => e.tipo !== 'otro') // Fase 1: solo eventos relevantes (concurso/disolución/ampliación/cese)
  const procesados = await ingerirEventos(eventos)
  return { eventos: procesados, total: anuncios.length }
}

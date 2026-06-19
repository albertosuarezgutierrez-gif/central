// Ingesta del corpus compartido de licitaciones desde la sindicación ATOM de
// PLACSP. Aísla la descarga (red) y el upsert (BD) para reutilizarlas tanto en
// el cron (`/api/cron/concursos-ingesta`) como en el disparador manual del panel
// (`/api/admin/concursos/ingesta`). El parseo es puro (lib/concursos-radar.ts).
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { parsearAtomPlacsp, dedupeKey } from '@/lib/concursos-radar'

const FEED_URL = process.env.PLACSP_FEED_URL
  || 'https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom'
const MAX_PAGINAS = 3

/** Descarga hasta MAX_PAGINAS del ATOM siguiendo <link rel="next">, concatenadas. */
export async function descargarAtom(): Promise<string> {
  let url: string | null = FEED_URL
  const partes: string[] = []
  for (let i = 0; i < MAX_PAGINAS && url; i++) {
    const res: Response = await fetch(url, { headers: { 'User-Agent': 'ialimp-buscador/1.0' }, cache: 'no-store' })
    if (!res.ok) break
    const xml: string = await res.text()
    partes.push(xml)
    const m: RegExpMatchArray | null = xml.match(/<link[^>]+rel=["']next["'][^>]+href=["']([^"']+)["']/i)
    url = m ? m[1] : null
  }
  return partes.join('\n')
}

/** Parsea el ATOM y hace upsert al corpus compartido `concursos_licitaciones`. Devuelve nº de upserts. */
export async function ingerirAnuncios(xml: string): Promise<number> {
  const anuncios = parsearAtomPlacsp(xml)
  let upserts = 0
  for (const a of anuncios) {
    const k = dedupeKey(a)
    if (!k) continue
    const objeto = a.objeto ?? a.titulo
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO concursos_licitaciones
        (dedupe_key, titulo, objeto, cpv, presupuesto, organo, provincia, tipo_contrato, estado, fin_presentacion, url, fuente, fts, actualizado_en)
      VALUES (
        ${k}, ${a.titulo}, ${objeto}, ${a.cpv ?? []}::text[], ${a.presupuesto ?? null}, ${a.organo ?? null},
        ${a.provincia ?? null}, ${a.tipo_contrato ?? null}, ${a.estado ?? null}, ${a.fin_presentacion ?? null}::date,
        ${a.url ?? null}, 'placsp', to_tsvector('spanish', ${a.titulo + ' ' + objeto}), now()
      )
      ON CONFLICT (dedupe_key) DO UPDATE SET
        titulo = EXCLUDED.titulo, objeto = EXCLUDED.objeto, cpv = EXCLUDED.cpv, presupuesto = EXCLUDED.presupuesto,
        organo = EXCLUDED.organo, provincia = EXCLUDED.provincia, tipo_contrato = EXCLUDED.tipo_contrato,
        estado = EXCLUDED.estado, fin_presentacion = EXCLUDED.fin_presentacion, url = EXCLUDED.url,
        fts = EXCLUDED.fts, actualizado_en = now()
    `)
    upserts++
  }
  return upserts
}

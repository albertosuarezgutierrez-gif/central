import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { parsearAtomPlacsp, dedupeKey } from '@/lib/concursos-radar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const FEED_URL = process.env.PLACSP_FEED_URL
  || 'https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom'
const MAX_PAGINAS = 3

async function descargarAtom(): Promise<string> {
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

export async function GET() {
  let xml = ''
  try { xml = await descargarAtom() }
  catch (e: any) { return NextResponse.json({ ok: false, error: 'fetch ATOM: ' + (e?.message || e) }, { status: 200 }) }
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
  return NextResponse.json({ ok: true, ingeridos: upserts })
}

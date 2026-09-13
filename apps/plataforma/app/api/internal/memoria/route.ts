// /api/internal/memoria — Puerto de INYECCIÓN de la memoria semántica (docs/CONTEXTO-SESIONES.md +
// docs/memoria/*.md) en Supabase. Lo llama scripts/memoria-inyectar.mjs desde auditoria.yml (solo
// desde main) con el JSON que genera scripts/memoria-parsear.mjs, partido en lotes (mismo límite
// ~4,5 MB de Vercel que el grafo de código). Tablas/funciones: prisma/sql/2026-09-12_memoria_semantica.sql.
// Upsert idempotente por id ('fuente#hash'); el último lote borra las entradas que ya no están en
// el corpus (por sha). Auth: Bearer CRON_SECRET.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Entrada = { id: string; fuente: string; fecha: string | null; texto: string }

const CHUNK = 200 // filas de texto largo por statement, bajo el tope de params de Postgres

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const sha: string = typeof body?.sha === 'string' ? body.sha : ''
  // Number.isInteger descarta NaN/Infinity de un tirón (typeof x==='number' los deja pasar: NaN<1 y
  // NaN>total son ambos false, así que un lote/total no numérico burlaba la validación de abajo).
  const lote: number = Number.isInteger(body?.lote) ? body.lote : 0
  const total: number = Number.isInteger(body?.total) ? body.total : 0
  const entradas: Entrada[] = Array.isArray(body?.entradas) ? body.entradas : []

  if (!sha || lote < 1 || total < 1 || lote > total) {
    return NextResponse.json({ error: 'sha no vacío, lote/total ≥1 y lote ≤ total requeridos' }, { status: 400 })
  }

  try {
    let upsertadas = 0
    for (let i = 0; i < entradas.length; i += CHUNK) {
      const chunk = entradas.slice(i, i + CHUNK)
      if (chunk.length === 0) continue
      const values = chunk.map((e) =>
        Prisma.sql`(${e.id}, ${e.fuente}, ${e.fecha}, ${e.texto}, md5(${e.texto}), ${sha}, now())`
      )
      // id = 'fuente#md5(texto)' (memoria-parsear.mjs): a diferencia de grafo_embeddings (id =
      // ruta, estable aunque el texto cambie), aquí un conflicto de id YA garantiza que
      // fuente/texto/hash son idénticos — un texto editado genera un id nuevo, no un conflicto.
      // Por eso el UPDATE solo toca `sha` (para que el DELETE del último lote no lo borre):
      // tocar embedding/hash aquí sería código muerto que nunca se ejecuta.
      upsertadas += await prisma.$executeRaw(Prisma.sql`
        INSERT INTO memoria_embeddings (id, fuente, fecha, texto, hash, sha, updated_at)
        VALUES ${Prisma.join(values)}
        ON CONFLICT (id) DO UPDATE SET sha = EXCLUDED.sha
      `)
    }

    let borradas = 0
    if (lote === total) {
      borradas = await prisma.$executeRaw(Prisma.sql`DELETE FROM memoria_embeddings WHERE sha IS DISTINCT FROM ${sha}`)
    }

    return NextResponse.json({ ok: true, lote, total, upsertadas, borradas: lote === total ? borradas : null, sha })
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : 'error'
    return NextResponse.json({ error: 'fallo al inyectar la memoria', detalle: msg }, { status: 500 })
  }
}

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
  const lote: number = typeof body?.lote === 'number' ? body.lote : 0
  const total: number = typeof body?.total === 'number' ? body.total : 0
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
      upsertadas += await prisma.$executeRaw(Prisma.sql`
        INSERT INTO memoria_embeddings (id, fuente, fecha, texto, hash, sha, updated_at)
        VALUES ${Prisma.join(values)}
        ON CONFLICT (id) DO UPDATE SET
          fuente = EXCLUDED.fuente, fecha = EXCLUDED.fecha, texto = EXCLUDED.texto,
          sha = EXCLUDED.sha,
          embedding  = CASE WHEN memoria_embeddings.hash IS DISTINCT FROM EXCLUDED.hash THEN NULL  ELSE memoria_embeddings.embedding  END,
          hash       = EXCLUDED.hash,
          updated_at = CASE WHEN memoria_embeddings.hash IS DISTINCT FROM EXCLUDED.hash THEN now() ELSE memoria_embeddings.updated_at END
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

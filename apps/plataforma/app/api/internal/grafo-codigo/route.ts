// /api/internal/grafo-codigo — Puerto de INYECCIÓN del grafo de código (nodos + aristas) en Supabase.
// Lo llama scripts/grafo-codigo-inyectar.mjs desde el workflow .github/workflows/auditoria.yml (solo
// desde main) con el JSON que genera scripts/grafo-codigo.mjs (NO se commitea: ~15 MB), partido en
// lotes porque el archivo completo no cabe en un POST (límite ~4,5 MB de Vercel). Las tablas y las
// funciones de consulta: apps/plataforma/prisma/sql/2026-09-12_grafo_codigo.sql. Upsert idempotente por nodo.id y arista (origen, destino, tipo, linea),
// y borra las filas de código eliminado. Auth: Bearer CRON_SECRET (o ?secret=).
// Así el SHA/DATABASE_URL NUNCA viajan a CI: CI solo necesita PLATAFORMA_URL + CRON_SECRET.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Nodo = {
  id: string; tipo: string; ruta: string; nombre: string; linea: number | null
  exportado: boolean | null; ambito: string; es_test: boolean
}
type Arista = {
  origen: string; destino: string; tipo: string; linea: number; simbolos: string[]
}

const CHUNK = 300 // ~9 params/fila → <2700 params/statement (bajo el tope de Postgres)

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const sha: string = typeof body?.sha === 'string' ? body.sha : ''
  const lote: number = typeof body?.lote === 'number' ? body.lote : 0
  const total: number = typeof body?.total === 'number' ? body.total : 0
  const nodos: Nodo[] = Array.isArray(body?.nodos) ? body.nodos : []
  const aristas: Arista[] = Array.isArray(body?.aristas) ? body.aristas : []

  // Valida parámetros
  if (!sha || lote < 1 || total < 1 || lote > total) {
    return NextResponse.json({ error: 'sha no vacío, lote/total ≥1 y lote ≤ total requeridos' }, { status: 400 })
  }

  try {
    // Upsert de nodos en chunks
    let nodosInsertados = 0
    for (let i = 0; i < nodos.length; i += CHUNK) {
      const chunk = nodos.slice(i, i + CHUNK)
      if (chunk.length === 0) continue
      const values = chunk.map(n =>
        Prisma.sql`(${n.id}, ${n.tipo}, ${n.ruta}, ${n.nombre}, ${n.linea}, ${n.exportado}, ${n.ambito}, ${n.es_test}, ${sha}, now())`
      )
      nodosInsertados += await prisma.$executeRaw(Prisma.sql`
        INSERT INTO grafo_nodos (id, tipo, ruta, nombre, linea, exportado, ambito, es_test, sha, updated_at)
        VALUES ${Prisma.join(values)}
        ON CONFLICT (id) DO UPDATE SET
          tipo = EXCLUDED.tipo, ruta = EXCLUDED.ruta, nombre = EXCLUDED.nombre,
          linea = EXCLUDED.linea, exportado = EXCLUDED.exportado, ambito = EXCLUDED.ambito,
          es_test = EXCLUDED.es_test, sha = EXCLUDED.sha, updated_at = now()
      `)
    }

    // Upsert de aristas en chunks
    let aristasInsertadas = 0
    for (let i = 0; i < aristas.length; i += CHUNK) {
      const chunk = aristas.slice(i, i + CHUNK)
      if (chunk.length === 0) continue
      const values = chunk.map(a =>
        Prisma.sql`(${a.origen}, ${a.destino}, ${a.tipo}, ${a.linea}, ${a.simbolos}::text[], ${sha}, now())`
      )
      aristasInsertadas += await prisma.$executeRaw(Prisma.sql`
        INSERT INTO grafo_aristas (origen, destino, tipo, linea, simbolos, sha, updated_at)
        VALUES ${Prisma.join(values)}
        ON CONFLICT (origen, destino, tipo, linea) DO UPDATE SET
          simbolos = EXCLUDED.simbolos, sha = EXCLUDED.sha, updated_at = now()
      `)
    }

    // Si es el último lote, borra las filas viejas (código eliminado)
    let nodosBorrados = 0
    let aristasBorradas = 0
    // En UNA transacción: si el segundo DELETE fallara suelto, quedarían aristas cuyos extremos ya no existen.
    if (lote === total) {
      ;[aristasBorradas, nodosBorrados] = await prisma.$transaction([
        prisma.$executeRaw(Prisma.sql`DELETE FROM grafo_aristas WHERE sha IS DISTINCT FROM ${sha}`),
        prisma.$executeRaw(Prisma.sql`DELETE FROM grafo_nodos WHERE sha IS DISTINCT FROM ${sha}`),
      ])
    }

    return NextResponse.json({
      ok: true,
      lote,
      total,
      nodos: nodosInsertados,
      aristas: aristasInsertadas,
      borradas: lote === total ? { nodos: nodosBorrados, aristas: aristasBorradas } : null,
      sha: sha || null,
    })
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : 'error'
    return NextResponse.json({ error: 'fallo al inyectar el grafo de código', detalle: msg }, { status: 500 })
  }
}

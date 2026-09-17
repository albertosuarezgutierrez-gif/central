// /api/internal/memoria/embeddings — Calcula los embeddings de la memoria semántica propia
// (memoria_buscar, sustituto de recall/memories_about de Graphify). Lo llama auditoria.yml
// (scripts/memoria-embeddings-inyectar.mjs) tras inyectar las entradas; se puede llamar varias
// veces, cada pasada embebe lo pendiente hasta agotar el tiempo. Auth: Bearer CRON_SECRET.
//
// No guarda clave propia: reutiliza grafo_embed_textos(), que ya lee grafo_openrouter_api_key de
// Vault (la escribe /api/internal/grafo-codigo/embeddings) — misma clave, mismo modelo.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const LOTE = 96
const MARGEN_MS = 95_000 // ≥ el CURLOPT_TIMEOUT_MS (90 s) de grafo_embed_textos

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const inicio = Date.now()
  const limite = inicio + maxDuration * 1000 - MARGEN_MS
  try {
    let embebidas = 0
    let llamadas = 0
    while (Date.now() < limite) {
      const [r] = await prisma.$queryRaw<Array<{ n: number }>>`SELECT memoria_embed_lote(${LOTE}::int) AS n`
      llamadas++
      if (!r || r.n <= 0) break
      embebidas += r.n
    }
    const [p] = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM memoria_embeddings WHERE embedding IS NULL`
    const pendientes = Number(p?.n ?? 0)
    return NextResponse.json({ ok: true, embebidas, llamadas, pendientes, ms: Date.now() - inicio })
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 400) : 'error'
    if (/grafo_embed_textos: no hay clave/.test(msg)) {
      return NextResponse.json({ error: 'sin clave de OpenRouter en Vault (grafo_openrouter_api_key)', detalle: msg }, { status: 503 })
    }
    return NextResponse.json({ error: 'fallo al calcular embeddings de memoria', detalle: msg }, { status: 500 })
  }
}

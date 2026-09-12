// /api/internal/grafo-codigo/embeddings — Calcula los embeddings del grafo de código (búsqueda
// semántica propia, sustituto de query_graph/rank_files de Graphify). Lo llama auditoria.yml
// (scripts/grafo-embeddings-inyectar.mjs) tras inyectar el mapa; se puede llamar varias veces:
// cada pasada sincroniza los textos con mapa_arquitectura y embebe lo pendiente hasta agotar el
// tiempo. Auth: Bearer CRON_SECRET.
//
// La clave de OpenRouter se guarda en Vault (grafo_guardar_clave) para que la búsqueda pueda
// hacerse por SQL puro desde las sesiones (grafo_buscar). Usa GRAFO_OPENROUTER_API_KEY (key
// dedicada con límite de gasto) y cae a OPENROUTER_API_KEY si no está.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const LOTE = 96              // textos por llamada a OpenRouter (~50 tokens cada uno)
const MARGEN_MS = 45_000     // se para antes del maxDuration para devolver el recuento

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clave = process.env.GRAFO_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY
  if (!clave) {
    return NextResponse.json({ error: 'Sin GRAFO_OPENROUTER_API_KEY ni OPENROUTER_API_KEY: no se pueden calcular embeddings' }, { status: 503 })
  }

  const inicio = Date.now()
  const limite = inicio + maxDuration * 1000 - MARGEN_MS
  try {
    await prisma.$queryRaw`SELECT grafo_guardar_clave(${clave})`
    const [sync] = await prisma.$queryRaw<Array<{ insertadas: number; cambiadas: number; borradas: number }>>`SELECT * FROM grafo_embeddings_sync()`

    let embebidas = 0
    let llamadas = 0
    while (Date.now() < limite) {
      const [r] = await prisma.$queryRaw<Array<{ n: number }>>`SELECT grafo_embed_lote(${LOTE}) AS n`
      llamadas++
      if (!r || r.n <= 0) break
      embebidas += r.n
    }
    const [p] = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM grafo_embeddings WHERE embedding IS NULL`
    const pendientes = Number(p?.n ?? 0)
    return NextResponse.json({ ok: true, sync, embebidas, llamadas, pendientes, ms: Date.now() - inicio })
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 400) : 'error'
    return NextResponse.json({ error: 'fallo al calcular embeddings', detalle: msg }, { status: 500 })
  }
}

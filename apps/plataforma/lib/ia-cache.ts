// Caché SEMÁNTICA de la pasarela de IA (pgvector + Gemini embeddings). OPT-IN doble:
// env IA_CACHE_SEMANTICA=1 (interruptor global, apagado por defecto) Y el caller manda
// `cache:{ambito, ttlHoras?}` en el body — nunca se cachea a callers que no lo piden
// (las consultas sobre datos vivos —finanzas, reservas— quedan fuera por diseño).
// Umbral ALTO (similitud coseno >= 0.97) para no responder a una pregunta PARECIDA pero
// distinta ("¿gasto de junio?" vs "¿de julio?"). FAIL-OPEN: cualquier error → camino normal.

import { prisma } from '@/lib/db'
import { geminiEmbed } from '@central/core-ai'

const UMBRAL_SIMILITUD = Number(process.env.IA_CACHE_UMBRAL ?? 0.97)
const TTL_HORAS_DEFAULT = 24

export function cacheActiva(): boolean {
  return process.env.IA_CACHE_SEMANTICA === '1'
}

async function embed(texto: string): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  try { return await geminiEmbed({ apiKey }, texto.slice(0, 6_000)) } catch { return null }
}

export type CacheHit = { respuesta: string; modelo: string | null }

/** Busca una respuesta cacheada semánticamente equivalente dentro del ámbito. null = miss. */
export async function buscarCache(app: string, ambito: string, texto: string): Promise<CacheHit | null> {
  try {
    const vector = await embed(texto)
    if (!vector) return null
    const emb = JSON.stringify(vector)
    // `<=>` = distancia coseno en pgvector (0 = idénticos) → similitud = 1 - distancia.
    const rows = await prisma.$queryRaw<Array<{ id: string; respuesta: string; modelo: string | null; sim: number }>>`
      SELECT id, respuesta, modelo, 1 - (embedding <=> ${emb}::vector) AS sim
      FROM ia_cache_semantica
      WHERE app = ${app} AND ambito = ${ambito} AND expira_at > now()
      ORDER BY embedding <=> ${emb}::vector
      LIMIT 1`
    const hit = rows[0]
    if (!hit || Number(hit.sim) < UMBRAL_SIMILITUD) return null
    prisma.$executeRaw`UPDATE ia_cache_semantica SET hits = hits + 1 WHERE id = ${hit.id}::uuid`
      .catch(() => { /* el contador nunca rompe el hit */ })
    return { respuesta: hit.respuesta, modelo: hit.modelo }
  } catch { return null }
}

/** Guarda una respuesta en la caché (fire-and-forget desde la ruta; nunca lanza). */
export async function guardarCache(
  app: string, ambito: string, texto: string, respuesta: string,
  opts: { modelo?: string | null; ttlHoras?: number } = {},
): Promise<void> {
  try {
    const vector = await embed(texto)
    if (!vector) return
    const emb = JSON.stringify(vector)
    const ttl = Math.max(1, Math.min(24 * 30, Number(opts.ttlHoras) || TTL_HORAS_DEFAULT))
    await prisma.$executeRaw`
      INSERT INTO ia_cache_semantica (app, ambito, pregunta, embedding, respuesta, modelo, expira_at)
      VALUES (${app}, ${ambito}, ${texto.slice(0, 4_000)}, ${emb}::vector, ${respuesta}, ${opts.modelo ?? null},
              -- ::int OBLIGATORIO: Prisma manda los números como bigint y
              -- make_interval(hours => bigint) no existe (42883) → NADA se cacheaba.
              now() + make_interval(hours => ${ttl}::int))`
  } catch { /* fail-open */ }
}

/** Métricas para el panel /operador/ia: hit-rate del mes (hits vs misses registrados en ai_usos). */
export async function statsCache(): Promise<{ entradas: number; hitsMes: number }> {
  try {
    const [ent, hits] = await Promise.all([
      prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM ia_cache_semantica WHERE expira_at > now()`,
      prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*) AS n FROM ai_usos
        WHERE proveedor = 'cache' AND ok = true AND creada_at >= date_trunc('month', now())`,
    ])
    return { entradas: Number(ent[0]?.n ?? 0), hitsMes: Number(hits[0]?.n ?? 0) }
  } catch { return { entradas: 0, hitsMes: 0 } }
}

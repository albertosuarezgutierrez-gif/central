// lib/sivra/agente-huesped/similitud.ts — consultas de recuperación por parecido.
//
// El criterio (las dos señales, los umbrales y por qué) vive en `similitud-reglas.ts`, que es puro y
// está testeado. Aquí solo van las consultas.
//
// 🚨 `null` NO es «no hay nada»: es «no se ha podido leer» (regla del repo sobre el NULL). El
// llamador conserva entonces lo que ya tenía por recencia, en vez de quedarse con un prompt vacío
// que el modelo rellenaría de memoria.
//
// `extensions.word_similarity(...)` va cualificado a propósito: el `search_path` del rol de la app
// no tiene por qué incluir `extensions` (donde vive pg_trgm en esta Supabase), y un fallo ahí se
// leería como «este piso no tiene nada aprendido».
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { Aprendizaje } from './contexto'
import type { Hecho } from './hechos'
import {
  palabrasClave, regexClaves, mezclarPorRelevancia,
  UMBRAL_PARECIDO, LONGITUD_MINIMA, MAX_APRENDIZAJES, RESERVA_RECIENTES,
} from './similitud-reglas'

export {
  palabrasClave, regexClaves, mezclarPorRelevancia,
  UMBRAL_PARECIDO, LONGITUD_MINIMA, MAX_APRENDIZAJES, RESERVA_RECIENTES,
}

// Tope de hechos. No caducan y van todos al prompt; el parecido solo cambia el ORDEN (lo más
// pertinente primero) hasta que un piso pase de este tope.
const MAX_HECHOS = 40

/**
 * Aprendizajes del piso pertinentes para ESTA pregunta, mezclados con los más recientes.
 * Devuelve `null` si no se pudo leer (≠ «este piso no tiene nada aprendido»).
 */
export async function aprendizajesRelevantes(propertyId: string, pregunta: string): Promise<Aprendizaje[] | null> {
  const q = (pregunta || '').trim().slice(0, 300)
  if (!q) return null
  const trigramaVale = q.length >= LONGITUD_MINIMA
  const re = regexClaves(palabrasClave(q))
  try {
    const [parecidas, recientes] = await Promise.all([
      (!trigramaVale && !re)
        ? Promise.resolve([] as Aprendizaje[])
        : prisma.$queryRaw<Aprendizaje[]>(Prisma.sql`
            SELECT categoria, pregunta_norm, respuesta_final FROM mensajes_aprendizaje
            WHERE property_id = ${propertyId}
              AND (
                (${trigramaVale}::boolean AND extensions.word_similarity(${q}, pregunta_norm) >= ${UMBRAL_PARECIDO})
                OR (${re}::text IS NOT NULL AND pregunta_norm ~* ${re})
              )
            ORDER BY (${re}::text IS NOT NULL AND pregunta_norm ~* ${re}) DESC,
                     extensions.word_similarity(${q}, pregunta_norm) DESC,
                     created_at DESC
            LIMIT ${MAX_APRENDIZAJES}
          `),
      prisma.$queryRaw<Aprendizaje[]>(Prisma.sql`
        SELECT categoria, pregunta_norm, respuesta_final FROM mensajes_aprendizaje
        WHERE property_id = ${propertyId} ORDER BY created_at DESC LIMIT ${RESERVA_RECIENTES}
      `),
    ])
    return mezclarPorRelevancia(parecidas, recientes, a => `${a.pregunta_norm}|${a.respuesta_final}`)
  } catch {
    return null
  }
}

/**
 * Hechos confirmados del piso, ordenados por pertinencia para ESTA pregunta (y por recencia dentro
 * de lo demás). No filtra: los hechos no caducan y van todos al prompt; lo que cambia es el ORDEN.
 * `null` si no se pudo leer.
 */
export async function hechosRelevantes(propertyId: string, pregunta: string): Promise<Hecho[] | null> {
  const q = (pregunta || '').trim().slice(0, 300)
  if (!q) return null
  const re = regexClaves(palabrasClave(q))
  try {
    return await prisma.$queryRaw<Hecho[]>(Prisma.sql`
      SELECT id::int AS id, pregunta, hecho, origen FROM mensajes_hechos
      WHERE property_id = ${propertyId} AND estado = 'confirmado'
      ORDER BY (${re}::text IS NOT NULL AND (hecho ~* ${re} OR COALESCE(pregunta,'') ~* ${re})) DESC,
               GREATEST(
                 extensions.word_similarity(${q}, hecho),
                 extensions.word_similarity(${q}, COALESCE(pregunta, ''))
               ) DESC,
               created_at DESC
      LIMIT ${MAX_HECHOS}
    `)
  } catch {
    return null
  }
}

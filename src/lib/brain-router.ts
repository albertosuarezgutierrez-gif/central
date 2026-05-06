/**
 * brain-router.ts
 * Router de destilación para BRAIN.
 *
 * Pipeline:
 *   1. Intenta reconocimiento por patrones (brain-patron) → <10ms, coste €0
 *   2. Si confianza < THRESHOLD → fallback a Claude Haiku → ~500ms, coste €0.0023
 *   3. Loguea fuente ('patron' | 'claude_api' | 'modelo_propio') en ia_training_log
 *   4. En el futuro: insertar modelo propio entre patron y Claude
 *
 * Así el modelo propio aprende de cada fallback y con el tiempo
 * el coste marginal por comanda tiende a €0.
 */

import { BrainResult } from '@/types'
import { getMenuCache } from './brain-cache'
import { reconocerPatron } from './brain-patron'
import { parsearComanda } from './brain'

/** Resultado extendido con información de destilación */
export interface BrainResultRouted extends BrainResult {
  fuente: 'patron' | 'claude_api' | 'modelo_propio'
  latencia_brain_ms: number
}

/** Umbral de confianza: por debajo → Claude */
const THRESHOLD_CONFIANZA = 0.80

export async function routearComanda(
  texto: string,
  restaurante_id: string
): Promise<BrainResultRouted> {
  const start = Date.now()

  // ── Capa 1: Cache de menú (evita DB queries en cada llamada) ─────────────
  const cache = await getMenuCache(restaurante_id)

  // ── Capa 2: Reconocimiento por patrones ───────────────────────────────────
  const patronResult = reconocerPatron(texto, cache)

  if (patronResult && patronResult.confianza >= THRESHOLD_CONFIANZA) {
    const latencia = Date.now() - start
    console.log(`[BRAIN-ROUTER] patron OK: ${patronResult.tipo} ${patronResult.mesa} conf=${patronResult.confianza.toFixed(2)} ${latencia}ms`)
    return {
      ...patronResult,
      fuente: 'patron',
      latencia_brain_ms: latencia,
    }
  }

  // ── Capa 3: [FUTURO] Modelo propio ───────────────────────────────────────
  // Aquí se insertará el modelo fine-tuned sobre ia_training_log
  // cuando alcancemos ~2.000 pares de entrenamiento limpios.
  // if (modeloPropio) {
  //   const propioResult = await modeloPropio.inferir(texto, cache)
  //   if (propioResult.confianza >= THRESHOLD_CONFIANZA) {
  //     return { ...propioResult, fuente: 'modelo_propio', latencia_brain_ms: Date.now() - start }
  //   }
  // }

  // ── Capa 4: Claude Haiku (fallback) ──────────────────────────────────────
  const claudeResult = await parsearComanda(texto, restaurante_id)
  const latencia = Date.now() - start
  console.log(`[BRAIN-ROUTER] claude_api: ${claudeResult.tipo} ${claudeResult.mesa} conf=${claudeResult.confianza?.toFixed(2) ?? '?'} ${latencia}ms`)
  return {
    ...claudeResult,
    fuente: 'claude_api',
    latencia_brain_ms: latencia,
  }
}

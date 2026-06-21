/**
 * training-log.ts
 * Helper centralizado para guardar pares de entrenamiento en ia_training_log.
 * Nunca lanza excepciones — el flujo principal nunca se interrumpe por logging.
 *
 * Fuentes y calidades:
 *   patron            → 4  (reconocimiento directo, sin IA)
 *   claude_api        → 2-4 (según confianza)
 *   sintetico         → 5  (datos generados para entrenamiento)
 *   nim_conversacional → 3-5 (3=pregunta en curso, 5=resuelto con confirmación humana)
 *   nim_analitico     → 3  (respuestas del copiloto, forecaster, etc.)
 */

import { createServerClient } from '@/lib/supabase'

export interface TrainingEntry {
  local_id: string
  input_raw: string
  input_context?: Record<string, unknown>
  output_brain?: Record<string, unknown>
  fuente: 'patron' | 'claude_api' | 'sintetico' | 'nim_conversacional' | 'nim_analitico'
  calidad: 1 | 2 | 3 | 4 | 5
  confianza?: number
  fue_corregido?: boolean
  correccion?: Record<string, unknown> | null
  nim_historial?: { role: string; content: string }[] | null
  texto_normalizado?: string | null
  latencia_ms?: number
  modelo_usado?: string
  turno_id?: string | null
  camarero_id?: string | null
}

export async function logTraining(entry: TrainingEntry): Promise<void> {
  try {
    const supabase = createServerClient()
    await supabase.from('ia_training_log').insert({
      local_id: entry.local_id,
      input_raw: entry.input_raw,
      input_context: entry.input_context ?? null,
      output_brain: entry.output_brain ?? null,
      fuente: entry.fuente,
      calidad: entry.calidad,
      confianza: entry.confianza ?? null,
      fue_corregido: entry.fue_corregido ?? false,
      correccion: entry.correccion ?? null,
      nim_historial: entry.nim_historial ?? null,
      texto_normalizado: entry.texto_normalizado ?? null,
      latencia_ms: entry.latencia_ms ?? null,
      modelo_usado: entry.modelo_usado ?? null,
      turno_id: entry.turno_id ?? null,
      camarero_id: entry.camarero_id ?? null,
    })
  } catch {
    /* silencioso — nunca interrumpir flujo principal */
  }
}

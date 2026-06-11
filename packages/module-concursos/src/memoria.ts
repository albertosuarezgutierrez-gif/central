// ────────────────────────────────────────────────────────────────────────────
// Memoria técnica (F4) — PURO. Planifica las secciones desde los criterios de
// juicio de valor, construye el prompt por sección (la app llama al LLM) y
// estima la cobertura de puntos. Determinista.
// ────────────────────────────────────────────────────────────────────────────

import type {
  CoberturaMemoria,
  FichaConcurso,
  SeccionMemoria,
  SeccionMemoriaRellena,
} from './types'

/** Longitud mínima de contenido para considerar que una sección "puntúa". */
export const MIN_CONTENIDO_CHARS = 80

/**
 * Esquema de la memoria: una sección por cada criterio de JUICIO DE VALOR,
 * ordenadas por puntos descendente (atacar primero lo que más reparte).
 */
export function planificarMemoria(ficha: FichaConcurso): SeccionMemoria[] {
  return ficha.criterios
    .filter(c => c.tipo === 'juicio_valor')
    .slice()
    .sort((a, b) => b.puntos - a.puntos)
    .map(c => ({
      criterio: c.nombre,
      puntos_max: c.puntos,
      guia: `Demuestra de forma concreta y verificable cómo la propuesta satisface «${c.nombre}» `
        + `(reparte hasta ${c.puntos} puntos). Aporta medios, metodología, plazos y ejemplos; evita el relleno genérico.`,
    }))
}

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

const SYSTEM_MEMORIA = `Eres un consultor experto en redactar memorias técnicas para concursos públicos españoles (LCSP).
Redactas la sección que responde a un criterio de adjudicación de "juicio de valor" para MAXIMIZAR la puntuación.

Reglas:
- Escribe en español, en prosa profesional y estructurada (puedes usar subtítulos y listas).
- Sé concreto y verificable: medios, metodología, plazos, indicadores, ejemplos. Nada de relleno genérico.
- No inventes datos de la empresa: usa solo el contexto aportado; si falta un dato, descríbelo como compromiso ("se asignará…").
- No te salgas del criterio de esta sección. No incluyas precios.
- Devuelve SOLO el texto de la sección (sin JSON, sin comentarios meta).`

/**
 * Prompt para redactar UNA sección de la memoria. La app pasa {system, user}
 * al LLM por el puerto AiRunner y guarda la respuesta como `contenido`.
 */
export function construirPromptMemoria(
  ficha: FichaConcurso,
  seccion: SeccionMemoria,
  contextoEmpresa?: string,
): { system: string; user: string } {
  const contexto = (contextoEmpresa || '').trim()
  const user = `Objeto del contrato: ${ficha.objeto}
Criterio a puntuar: «${seccion.criterio}» (hasta ${seccion.puntos_max} puntos).
Qué debe demostrar: ${seccion.guia}
${contexto ? `\nContexto de la empresa (úsalo, no lo contradigas):\n${contexto}\n` : ''}
Redacta la sección de la memoria técnica para este criterio. Devuelve SOLO el texto.`
  return { system: SYSTEM_MEMORIA, user }
}

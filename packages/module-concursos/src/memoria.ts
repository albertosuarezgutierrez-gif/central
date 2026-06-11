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

/**
 * Estima la cobertura de puntos de la memoria. Una sección "puntúa" si su
 * contenido alcanza MIN_CONTENIDO_CHARS. Los criterios de juicio de valor sin
 * sección suficiente se listan en `vacias`. `pct` se redondea a entero (0 si no
 * hay puntos técnicos en juego).
 */
export function coberturaMemoria(
  secciones: SeccionMemoriaRellena[],
  ficha: FichaConcurso,
): CoberturaMemoria {
  const criteriosJV = ficha.criterios.filter(c => c.tipo === 'juicio_valor')
  const puntos_totales = criteriosJV.reduce((s, c) => s + c.puntos, 0)

  const suficiente = new Map<string, number>() // criterio → puntos, si está bien cubierto
  for (const s of secciones) {
    if ((s.contenido || '').trim().length >= MIN_CONTENIDO_CHARS) {
      suficiente.set(s.criterio, s.puntos_max)
    }
  }

  let puntos_cubiertos = 0
  const vacias: string[] = []
  for (const c of criteriosJV) {
    if (suficiente.has(c.nombre)) puntos_cubiertos += c.puntos
    else vacias.push(c.nombre)
  }

  const pct = puntos_totales > 0 ? Math.round((puntos_cubiertos / puntos_totales) * 100) : 0
  return { puntos_cubiertos, puntos_totales, pct, vacias }
}

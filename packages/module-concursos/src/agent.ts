// ────────────────────────────────────────────────────────────────────────────
// Agente — orquesta el análisis del pliego. El LLM entra por el puerto AiRunner
// (la app lo respalda con core-ai). Aquí no hay red ni secretos: sólo
// prompt → runner → parsing puro.
// ────────────────────────────────────────────────────────────────────────────

import type { AiRunner, FichaConcurso, PerfilEmpresa, ItemChecklist, EvaluacionGoNoGo } from './types'
import { construirPromptPliego } from './prompts'
import { parseFichaConcurso } from './parsing'
import { derivarChecklist } from './checklist'
import { evaluarGoNoGo } from './redflags'
import { calcularGarantias, type GarantiasCalculadas } from './scoring'

/**
 * Lee un pliego (texto ya extraído del PDF por la app) y devuelve la ficha
 * estructurada y validada. El módulo no conoce el proveedor IA: lo recibe por
 * `runner`.
 */
export async function analizarPliego(runner: AiRunner, textoPliego: string): Promise<FichaConcurso> {
  if (!textoPliego || !textoPliego.trim()) {
    throw new Error('El pliego está vacío: no hay texto que analizar')
  }
  const { system, user } = construirPromptPliego(textoPliego)
  const raw = await runner(system, user)
  return parseFichaConcurso(raw)
}

/** Resultado completo del análisis de un pliego (ficha + derivados puros). */
export interface AnalisisConcurso {
  ficha: FichaConcurso
  checklist: ItemChecklist[]
  goNoGo: EvaluacionGoNoGo
  garantias: GarantiasCalculadas
}

/**
 * Análisis de extremo a extremo: extrae la ficha con el LLM y calcula los
 * derivados puros (checklist, Go/No-Go y garantías) en una sola llamada.
 *
 * @param hoy fecha de referencia para el cálculo de plazos (inyectable en tests)
 */
export async function analizarConcurso(
  runner: AiRunner,
  textoPliego: string,
  perfil: PerfilEmpresa = {},
  hoy: Date = new Date(),
): Promise<AnalisisConcurso> {
  const ficha = await analizarPliego(runner, textoPliego)
  return {
    ficha,
    checklist: derivarChecklist(ficha),
    goNoGo: evaluarGoNoGo(ficha, perfil, hoy),
    garantias: calcularGarantias(ficha),
  }
}

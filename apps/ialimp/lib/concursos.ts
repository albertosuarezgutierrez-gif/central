// Adaptador de ialimp para el módulo @central/module-concursos.
// El módulo es puro: aquí inyectamos (a) el AiRunner respaldado por core-ai y
// (b) la extracción de texto del PDF del pliego. Los secretos (NVIDIA_API_KEY)
// viven en la app, nunca en el módulo.

import type { AiRunner } from '@central/module-concursos'
import { aiComplete } from '@central/core-ai'

/**
 * Puerto del LLM para el módulo de concursos: envía system+user al proveedor
 * IA centralizado de la casa de marcas (NVIDIA NIM vía core-ai, lee
 * NVIDIA_API_KEY del entorno de la app).
 */
export const aiRunner: AiRunner = (system, user) =>
  aiComplete([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ])

/**
 * Extrae el texto de un PDF de pliego. `pdf-parse` es CommonJS y trae artefactos
 * de test al cargarse en el índice, por eso se importa de forma perezosa y
 * apuntando al implementador interno (`lib/pdf-parse.js`).
 */
export async function extraerTextoPdf(buffer: Buffer): Promise<string> {
  const mod: any = await import('pdf-parse/lib/pdf-parse.js')
  const pdf = mod.default || mod
  const data = await pdf(buffer)
  return (data?.text || '').trim()
}

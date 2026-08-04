// PLANIFICADOR de la Fase 2 ("caro planifica / barato ejecuta"). Dada una orden de desarrollo y los
// archivos candidatos (acotados a ~0 tokens por el Director de código), un modelo ALTO (categoría
// `plan` del catálogo: Claude alto vía OpenRouter) produce un PLAN estructurado por archivo: qué
// instrucción precisa aplicar a cada uno y su criterio de aceptación. NO escribe código: eso lo hace
// después el EJECUTOR barato (categoría `codigo`, endpoint /api/ai/ejecutar), archivo a archivo.
//
// Filosofía idéntica al resto del Director: NUNCA lanza hacia arriba de forma incontrolada; si el plan
// no se puede parsear, devuelve plan vacío + el texto crudo para que el orquestador degrade.

import { chatConDirector } from '@/lib/pasarela'
import { cleanJSON, type NimChatMessage } from '@central/core-ai'

export type ArchivoContexto = {
  ruta: string
  resumen?: string | null
  /** Contenido ACTUAL del archivo. El planificador lo usa para instrucciones precisas. */
  contenido?: string
}

export type PasoPlan = {
  ruta: string
  instruccion: string
  criterio?: string
}

export type ResultadoPlan = {
  plan: PasoPlan[]
  /** Modelo que planificó (para telemetría; ideal: categoría `plan` = Claude alto). */
  modelo: string | null
  /** Texto crudo si no se pudo parsear el JSON (para diagnóstico/degradación). */
  crudo?: string
}

const SYSTEM = [
  'Eres un PLANIFICADOR de desarrollo senior. Recibes una ORDEN y los ARCHIVOS candidatos (con su',
  'contenido). Tu tarea es ORGANIZAR el trabajo: decidir qué archivos tocar y, por cada uno, una',
  'INSTRUCCIÓN precisa e inequívoca para que un programador junior la ejecute sin ambigüedad, más un',
  'CRITERIO de aceptación. NO escribas código: solo el plan. Incluye SOLO los archivos que haya que',
  'cambiar (si uno no se toca, omítelo). Responde EXCLUSIVAMENTE con un array JSON, sin texto alrededor',
  'ni fences: [{"ruta": "<ruta exacta>", "instruccion": "<qué hacer>", "criterio": "<cómo se valida>"}].',
].join(' ')

/** Recorta el contenido de cada archivo para no reventar el contexto del planificador. */
function recortar(contenido: string | undefined, max = 8000): string {
  if (!contenido) return '(sin contenido)'
  return contenido.length > max ? `${contenido.slice(0, max)}\n… [recortado, ${contenido.length} chars]` : contenido
}

/**
 * Planifica la tarea con el modelo ALTO (categoría `plan`). Devuelve el plan por archivo.
 * `archivos` los aporta el caller (el orquestador los lee del repo tras el acotado). NUNCA lanza:
 * ante cualquier fallo devuelve `{ plan: [], modelo, crudo }` para que el orquestador degrade.
 */
export async function planificarTarea(
  tarea: string,
  archivos: ArchivoContexto[],
  opts: { app?: string; clienteRef?: string | null } = {},
): Promise<ResultadoPlan> {
  const contexto = archivos.map(a =>
    `### ${a.ruta}${a.resumen ? ` — ${a.resumen}` : ''}\n\`\`\`\n${recortar(a.contenido)}\n\`\`\``,
  ).join('\n\n')
  const user = `ORDEN: ${tarea}\n\nARCHIVOS CANDIDATOS:\n${contexto}`
  const messages: NimChatMessage[] = [{ role: 'user', content: user }]

  const res = await chatConDirector(messages, {
    app: opts.app ?? 'programar',
    endpoint: 'programar',
    categoria: 'plan', // Claude alto vía OpenRouter (si el cron ya lo metió; si no, degrada al default)
    system: SYSTEM,
    temperature: 0.1,
    maxTokens: 2000,
    timeoutMs: 45_000,
    clienteRef: opts.clienteRef ?? null,
  }).catch(() => ({ text: '', modelo: null }))

  let plan: PasoPlan[] = []
  try {
    const parsed = JSON.parse(cleanJSON(res.text))
    if (Array.isArray(parsed)) {
      plan = parsed
        .filter((p): p is PasoPlan => p && typeof p.ruta === 'string' && typeof p.instruccion === 'string')
        .map(p => ({ ruta: p.ruta, instruccion: p.instruccion, criterio: typeof p.criterio === 'string' ? p.criterio : undefined }))
    }
  } catch { /* deja plan vacío + crudo para degradar */ }

  return plan.length ? { plan, modelo: res.modelo } : { plan: [], modelo: res.modelo, crudo: res.text?.slice(0, 500) }
}

// "Segunda opinión" de IA para un posible cargo duplicado. Alberto pidió una capa de IA que revise
// posibles errores "sobre todo hasta que funcione 100% bien". Respeta el principio canónico del
// sistema: la IA SOLO OPINA (entiende el contexto y lo explica en una frase); NUNCA decide importes
// ni resuelve el par — eso lo sigue haciendo Alberto con los botones "Es normal" / "Es un cobro
// doble". Degrada limpio a "incierto" si la IA no está disponible o no devuelve algo parseable, así
// que nunca bloquea ni ensucia la bandeja determinista. Mismo cliente gratis que lib/reclamacion.ts.
// La lógica pura (prompt + parseo) vive en `duplicados-opinion-core.ts` (testeable sin red).
import { aiComplete } from '@central/core-ai'
import { SYSTEM_OPINION, construirPromptOpinion, parseOpinion, type DupOpinion, type DupOpinionInput } from './duplicados-opinion-core'

export type { DupOpinion, DupOpinionInput, DupOpinionMov, DupVeredicto } from './duplicados-opinion-core'

export async function segundaOpinionDuplicado(input: DupOpinionInput): Promise<DupOpinion> {
  try {
    const raw = await aiComplete(construirPromptOpinion(input), {
      system: SYSTEM_OPINION, maxTokens: 300, temperature: 0.1, timeoutMs: 30_000,
    })
    return parseOpinion(raw || '')
  } catch {
    return { veredicto: 'incierto', explicacion: 'La IA no está disponible ahora; revísalo tú.', confianza: 0 }
  }
}

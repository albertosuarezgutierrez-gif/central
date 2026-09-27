// Las conversaciones REALES en las que el asistente de la correduría preguntó lo que ya decía el
// documento (27/09/2026). Alberto: «el agente tiene que saber más que yo». Cada caso deja un documento
// recién subido y pide la oportunidad con otras palabras: lo correcto es llamar a proponer_oportunidad
// con usarDocumentos=true, NO contestar con una pregunta. Lo corre `scripts/eval-asistente-correduria.ts`
// contra el modelo de verdad; el veredicto es puro para que CI lo vigile sin gastar tokens.
import type { NimToolMessage } from '@central/core-ai'

export type CasoEval = { nombre: string; historial: NimToolMessage[]; pregunta: string }

const LEIDO = '🛡️ He leído el documento que subiste: es de Rafael Campa Álvarez, recibo de auto de Línea Directa.'

export const CASOS_EVAL: readonly CasoEval[] = [
  { nombre: '«Crealw oportunidad» (preguntó «¿A quién?»)', historial: [], pregunta: 'Crealw oportunidad' },
  { nombre: '«Abre oportunidad» a secas (pidió «de quién»)', historial: [], pregunta: 'Abre oportunidad' },
  {
    nombre: '«Otra oportunidad del mismo cliente» (preguntó los datos)',
    historial: [{ role: 'user', content: 'Revisa te mando recibo para que analices' }, { role: 'assistant', content: LEIDO }],
    pregunta: 'Otra oportunidad del mismo cliente',
  },
  {
    nombre: '«Abre oportunidad» tras leerlo (contestó «no tengo claro»)',
    historial: [{ role: 'assistant', content: LEIDO }, { role: 'user', content: 'Otra oportunidad del mismo cliente' }],
    pregunta: 'Abre oportunidad',
  },
  { nombre: 'Documento marcado «de un cliente» (propuesta sin preguntar)', historial: [], pregunta: 'ORDEN_DOCUMENTO_CLIENTE' },
]

export type Veredicto = { ok: boolean; motivo: string }

/** Primera vuelta del modelo → ¿hizo lo que tocaba? Solo vale proponer_oportunidad con usarDocumentos=true. */
export function veredictoEval(r: { content?: string | null; tool_calls?: { function?: { name?: string; arguments?: string } }[] }): Veredicto {
  const llamada = (r.tool_calls ?? []).find((c) => c.function?.name === 'proponer_oportunidad')
  if (!llamada) {
    const otra = r.tool_calls?.[0]?.function?.name
    return { ok: false, motivo: otra ? `llamó a ${otra} en vez de proponer_oportunidad` : `contestó sin herramienta: «${(r.content ?? '').slice(0, 120)}»` }
  }
  let args: Record<string, unknown> = {}
  try { args = JSON.parse(llamada.function?.arguments || '{}') } catch { return { ok: false, motivo: 'argumentos no son JSON' } }
  if (args.usarDocumentos !== true) return { ok: false, motivo: 'propuso sin usarDocumentos=true (no leería el documento)' }
  return { ok: true, motivo: 'propone con el documento' }
}

// lib/sivra/agente-huesped/hilo.ts — helper PURO (solo import de tipo, sin deps de runtime) para
// dar el HILO de la conversación como contexto a la IA. Testeable con `node --test` sin dependencias.
import type { MensajeHist } from './contexto'

// Convierte el historial del hilo en mensajes de chat (huésped=user, anfitrión=assistant), los
// `max` más recientes. Quita el último si coincide con la pregunta actual (se añade aparte como
// turno a responder, para no duplicarlo) y descarta vacíos.
export function hiloComoMensajes(
  historial: MensajeHist[],
  pregunta: string,
  max = 15,
): { role: 'user' | 'assistant'; content: string }[] {
  const norm = (s: string) => (s || '').trim().toLowerCase()
  let hist = (historial || []).filter(h => h.text && h.text.trim())
  if (hist.length && norm(hist[hist.length - 1].text) === norm(pregunta)) hist = hist.slice(0, -1)
  return hist.slice(-max).map(h => ({
    role: h.from === 'guest' ? ('user' as const) : ('assistant' as const),
    content: h.text,
  }))
}

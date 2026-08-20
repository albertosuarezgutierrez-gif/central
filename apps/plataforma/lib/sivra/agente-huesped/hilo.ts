// lib/sivra/agente-huesped/hilo.ts — helper PURO (solo import de tipo, sin deps de runtime) para
// dar el HILO de la conversación como contexto a la IA. Testeable con `node --test` sin dependencias.
import type { MensajeHist } from './contexto'

// Convierte el historial del hilo en mensajes de chat (huésped=user, anfitrión=assistant), los
// `max` más recientes. Quita el último si coincide con la pregunta actual (se añade aparte como
// turno a responder, para no duplicarlo) y descarta vacíos.
export function hiloComoMensajes(
  historial: MensajeHist[],
  pregunta: string,
  max = 25,
): { role: 'user' | 'assistant'; content: string }[] {
  const norm = (s: string) => (s || '').trim().toLowerCase()
  let hist = (historial || []).filter(h => h.text && h.text.trim())
  if (hist.length && norm(hist[hist.length - 1].text) === norm(pregunta)) hist = hist.slice(0, -1)
  return hist.slice(-max).map(h => ({
    role: h.from === 'guest' ? ('user' as const) : ('assistant' as const),
    content: h.text,
  }))
}

const VENTANA_DUP_MS = 120_000

// Smoobu manda CADA mensaje automático por duplicado (en el hilo de la reserva 152291091, 8 de 25
// mensajes eran copias exactas) y esos duplicados se comían la ventana de contexto del modelo.
// Quitamos un mensaje si ya hubo otro idéntico, del mismo emisor, en los 2 minutos anteriores: mata
// las copias sin tocar a un huésped que repite su pregunta una hora después.
export function dedupHilo(historial: MensajeHist[]): MensajeHist[] {
  const vistos: { clave: string; t: number }[] = []
  const out: MensajeHist[] = []
  for (const m of historial || []) {
    const clave = `${m.from}|${(m.text || '').trim().toLowerCase()}`
    const t = Date.parse((m.ts || '').replace(' ', 'T'))
    const dup = vistos.some(v => v.clave === clave && (!Number.isFinite(t) || Math.abs(t - v.t) <= VENTANA_DUP_MS))
    if (dup) continue
    vistos.push({ clave, t: Number.isFinite(t) ? t : 0 })
    out.push(m)
  }
  return out
}

// lib/sivra/agente-huesped/atribucion.ts
// Atribución fiable host/guest a partir de lo que NOSOTROS hemos enviado (ground truth). Puro y
// testeable con `node --test`.
//
// PROBLEMA: la única señal de emisor en el hilo de Smoobu es `sent_by_owner`, que /api/threads NO
// trae y /api/reservations/{id}/messages a veces deja vacío. Cuando nuestra propia respuesta
// (auto-enviada o aprobada) reaparece en el hilo SIN esa marca, se etiqueta como 'guest' y el
// agente acaba "respondiéndose a sí mismo" (lo detectó Alberto: reserva 142771692, 25/06/2026 —
// nos auto-respondió "Sí, el alojamiento dispone de cafetera y microondas." y una hora después
// propuso "Genial, David, me alegra que hayas encontrado lo que necesitas en la cocina").
//
// SOLUCIÓN: cruzamos el hilo contra el registro de lo que YA enviamos (mensajes_log.auto_sent=true).
// Un mensaje cuyo texto coincide con una respuesta nuestra es del HOST, diga lo que diga Smoobu.

import type { MensajeHist } from './contexto'

// Longitud mínima para fiarnos de una coincidencia de texto: un huésped no reproduce una frase
// entera nuestra, pero un "sí"/"ok" suelto sí podría coincidir por azar → no lo tratamos como propio.
const MIN_LONGITUD_ECO = 15

export function normalizarTexto(t: string): string {
  return (t || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Conjunto normalizado de respuestas que ya hemos enviado (descarta las triviales por longitud).
export function setEnviados(respuestas: Array<string | null | undefined>): Set<string> {
  const s = new Set<string>()
  for (const r of respuestas) {
    const n = normalizarTexto(r || '')
    if (n.length >= MIN_LONGITUD_ECO) s.add(n)
  }
  return s
}

// Reescribe a 'host' los mensajes del historial cuyo texto coincide con algo que enviamos nosotros.
export function corregirAtribucion(historial: MensajeHist[], enviados: Set<string>): MensajeHist[] {
  if (enviados.size === 0) return historial
  return historial.map(m =>
    m.from === 'guest' && enviados.has(normalizarTexto(m.text)) ? { ...m, from: 'host' as const } : m,
  )
}

// ¿`texto` es un eco de una respuesta nuestra? (defensa para el sondeo, que pasa la pregunta directa
// de /api/threads aunque aún no figure en el historial de Smoobu).
export function esEcoPropio(texto: string, enviados: Set<string>): boolean {
  return enviados.has(normalizarTexto(texto))
}

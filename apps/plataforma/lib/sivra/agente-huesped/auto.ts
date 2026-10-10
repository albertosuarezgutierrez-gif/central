// lib/sivra/agente-huesped/auto.ts — la regla que decide si un mensaje sale SOLO hacia el huésped.
//
// Vivía como tres expresiones sueltas dentro de `procesarMensajeHuesped`, que es una función con
// I/O (Smoobu, BD, Telegram) y por tanto no se testeaba: sus ingredientes tenían test uno a uno
// (`esDespedida`, `esSensible`, `contieneDatoInventado`, `revisarCoherencia`…) pero la expresión que
// los combina —lo único que de verdad decide si un huésped recibe un mensaje sin que Alberto lo
// vea— no tenía ninguno. Aquí es pura y se testea en `auto.test.ts`.
import type { Decision } from './decidir'
import { peticionCambioHorario } from './cambio-horario.ts'

export type ViaAuto = 'cortesia' | 'apoyada' | null

/**
 * ¿Puede salir solo? Dos vías, sobre una misma guarda común.
 *
 * Guardas comunes: nunca se auto-envía nada que requiera ojo humano (sensible / negativo / dato
 * inventado / escalado IA / control de calidad caído fuera de la cortesía pura), ni sin borrador,
 * ni con sentimiento negativo.
 *
 * (a) CORTESÍA de fin de estancia (despedidas / agradecimientos / cierres puros): respuestas
 *     "siempre iguales" y de riesgo mínimo. Decisión de Alberto (26/07/2026).
 * (b) RESPUESTA APOYADA EN UNA FUENTE (20/08/2026, decisión de Alberto): si lo que contesta sale de
 *     la guía real del piso, de la ficha de la reserva o de los hechos que él ha enseñado, se manda
 *     solo. Sustituyó a la graduación por categorías, que era un contador de aprobaciones y no sabía
 *     nada de si la respuesta estaba respaldada. `apoyada_en_fuente` ya exige que la guía se haya
 *     PODIDO leer y que nada la marque dudosa.
 */
export function decidirAutoEnvio(dec: Decision, pregunta: string): { auto: boolean; via: ViaAuto } {
  // 🚨 COMPUERTA (03/10/2026, decisión de Alberto): entrada anticipada, salida tardía o guardar maletas
  // NUNCA salen solas, en ningún piso y con ninguna vía (cortesía incluida). Un huésped pidió quedarse
  // hasta las 15:00, salió automático y prometía un «coste según la hora» que no existe. Siempre Telegram.
  if (peticionCambioHorario(pregunta, dec.categoria)) return { auto: false, via: null }
  const guardasOk = !dec.needs_human && !!dec.reply && dec.sentimiento !== 'negativo'
  if (!guardasOk) return { auto: false, via: null }
  if (dec.es_cortesia === true) return { auto: true, via: 'cortesia' }
  if (dec.requiere_respuesta !== false && dec.apoyada_en_fuente === true) return { auto: true, via: 'apoyada' }
  return { auto: false, via: null }
}

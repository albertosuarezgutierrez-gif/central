// Precedentes para el CONTROL DE CALIDAD — lo que Alberto ya respondió a preguntas parecidas.
//
// Por qué existe (04/09/2026, «el agente tiene que ir aprendiendo, he respondido varias veces a
// preguntas similares y no ha aprendido»): `debeEscalar` ve la ficha, la guía y los HECHOS del piso,
// pero NO `ctx.aprendizajes`. Así que un asunto respondido tres veces a mano —el aviso de phishing
// por WhatsApp, sin ir más lejos— seguía cayendo en «la INFORMACIÓN no cubre la pregunta», que es
// justo el veredicto que enciende el «❓ Esto no lo encuentro en la guía».
//
// 🚨 PERO `mensajes_aprendizaje` NO es una base de conocimiento: es el registro de lo que se
// contestó, y lo escribe el propio agente cada vez que Alberto aprueba un borrador — nadie lo cura.
// Medido el 04/09/2026 sobre las 30 filas reales: más de la mitad son cortesías vacías («merci a
// vous») o, peor, respuestas atadas a UNA reserva concreta y CADUCAS:
//   · «tu reserva está confirmada para las fechas del 20 al 22 de noviembre»  (de Esther)
//   · «me aparece el Bizum de 20 € recibido»                                   (de Raquel)
//   · «puedes salir a las 12:00, ya que no entra nadie después de ti»          (de Manuel)
//   · «la noche anterior está ocupado, no es posible entrar antes de las 15:00»
// Volcarlas como INFORMACIÓN haría que el control aprobara un borrador que le confirma a OTRO
// huésped una reserva de noviembre o una salida a las 12:00 sin comprobar la ocupación — y como
// `apoyada_en_fuente` cuelga de ese veredicto, se auto-enviaría. Es el mismo fallo de los
// `mensajes_hechos` que resultaron ser cartas enteras (03/09/2026), por un camino peor: automático.
//
// De ahí las dos decisiones de este módulo:
//   1. Al control le llegan como PRECEDENTES, en su propio bloque, con la instrucción explícita de
//      que NO son fuente de datos. Sirven para responder «este asunto ya está resuelto y así se
//      resolvió», que es exactamente el hueco que Alberto señaló.
//   2. Antes se filtra lo VOLÁTIL, aquí, de forma determinista y conservadora: ante la duda se
//      descarta. Un precedente de menos solo devuelve el escalado de antes; uno de más valida una
//      afirmación que nadie ha comprobado.
import type { Aprendizaje } from './contexto'
import { esCierre } from './cortesia.ts'

/** Cuántos precedentes como mucho llegan al control de calidad. Van ya ordenados por pertinencia
 *  (`similitud.ts`), así que recortar por la cola es quedarse con lo más parecido a la pregunta. */
export const MAX_PRECEDENTES = 4

/** Tope de caracteres por precedente. No es cosmética: el prompt del control es corto a propósito
 *  (responde UNA palabra) y una carta de 900 caracteres entierra la pregunta que tiene que juzgar. */
export const MAX_CHARS = 300

// Señales de que la respuesta valía para ESE huésped y ESE día, no para el piso. Cada una está
// sacada de una fila real de `mensajes_aprendizaje` (ver la cabecera).
const VOLATIL: Array<[RegExp, string]> = [
  // Fechas concretas: «del 20 al 22 de noviembre», «09/07», «el viernes 9».
  [/\b\d{1,2}\s*[/-]\s*\d{1,2}\b|\b\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|se[pt]tiembre|octubre|noviembre|diciembre)\b|\bdel?\s+\d{1,2}\s+al\s+\d{1,2}\b/i, 'fecha concreta'],
  // Dinero: un importe es siempre de una gestión puntual (el precio de la cuna, un Bizum).
  [/[€$£]|\b\d+([.,]\d+)?\s*(?:eur|euros?)\b|\bbizum\b/i, 'importe'],
  // Horas concretas: la política de horarios ya viaja en la ficha; una hora en un precedente es
  // casi siempre una excepción concedida ese día («puedes salir a las 12:00»).
  [/\b\d{1,2}\s*[:.]\s*\d{2}\b|\b\d{1,2}\s*h\b/i, 'hora concreta'],
  // Comprobación hecha en el momento: lo que se verificó entonces no consta ahora.
  [/\b(?:acabo de|acabamos de)\s+\w+|\bhe (?:comprobado|consultado|verificado|revisado|mirado)\b|\bme aparece\b|\bconfirm(?:o|ado|amos) que\b|\bnos han (?:informado|confirmado)\b|\bi(?:'| ha)?ve (?:just )?checked\b|\bjust checked\b/i, 'comprobación puntual'],
  // Disponibilidad y ocupación: cambia cada día, y es lo más caro de dar por bueno.
  [/\bocupad[oa]s?\b|\blibre\b|\bdisponibilidad\b|\bdisponible\b|\bno entra nadie\b|\bsin problema\b|\boccupied\b|\bavailable\b|\bavailability\b/i, 'disponibilidad'],
  // Estado de una reserva concreta.
  [/\b(?:tu|su|la)\s+reserva\b|\breserva\s+(?:est[áa]|confirmada|hecha)\b|\byour booking\b|\bvotre r[ée]servation\b/i, 'estado de la reserva'],
  // Datos de contacto: un teléfono o un correo en un precedente es una fuga, no un aprendizaje.
  [/\+?\d[\d\s.-]{7,}\d|\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i, 'dato de contacto'],
]

export type Descarte = { util: false; motivo: string }
export type Aceptado = { util: true; motivo: '' }

/**
 * ¿Este par (pregunta, respuesta aprobada) enseña algo del PISO, o solo resolvió un caso?
 * Conservador por diseño: cualquier señal de volatilidad lo descarta ENTERO, aunque el resto del
 * texto sea conocimiento estable (una respuesta que mezcla «el parking está ocupado» con la lista de
 * parkings cercanos no se puede partir sin adivinar cuál de las dos mitades juzga el control).
 */
export function juzgarPrecedente(a: Aprendizaje): Aceptado | Descarte {
  const pregunta = (a?.pregunta_norm || '').trim()
  const respuesta = (a?.respuesta_final || '').trim()
  if (!pregunta || !respuesta) return { util: false, motivo: 'incompleto' }
  // Si el huésped no preguntaba nada, la respuesta aprobada no enseña nada que el control pueda usar.
  if (esCierre(pregunta)) return { util: false, motivo: 'cortesía: no se preguntó nada' }
  for (const [re, motivo] of VOLATIL) {
    if (re.test(respuesta)) return { util: false, motivo }
  }
  return { util: true, motivo: '' }
}

export type Precedente = { pregunta: string; respuesta: string }

function recortar(t: string): string {
  const limpio = t.replace(/\s+/g, ' ').trim()
  return limpio.length <= MAX_CHARS ? limpio : `${limpio.slice(0, MAX_CHARS - 1).trimEnd()}…`
}

/**
 * Los precedentes que el control de calidad puede ver. La lista de entrada ya viene filtrada por
 * PARECIDO con la pregunta actual (`similitud.ts`), así que aquí solo se decide qué es estable.
 * Devuelve `[]` cuando no sobrevive ninguno: el control se queda exactamente como estaba.
 */
export function precedentesEstables(aprendizajes: Aprendizaje[] | undefined, max = MAX_PRECEDENTES): Precedente[] {
  const out: Precedente[] = []
  for (const a of aprendizajes || []) {
    if (out.length >= max) break
    if (!juzgarPrecedente(a).util) continue
    out.push({ pregunta: recortar(a.pregunta_norm), respuesta: recortar(a.respuesta_final) })
  }
  return out
}

/**
 * El bloque tal cual entra en el prompt del control. Va SEPARADO del bloque INFORMACIÓN y lleva su
 * propia instrucción: sin ella, el modelo trata todo lo que le des como fuente de verdad, que es
 * justo lo que este módulo existe para evitar.
 */
export function bloquePrecedentes(precedentes: Precedente[]): string {
  if (!precedentes.length) return ''
  const lista = precedentes.map(p => `- Preguntaron: «${p.pregunta}» → el anfitrión aprobó: «${p.respuesta}»`).join('\n')
  return `PRECEDENTES (respuestas que el anfitrión YA dio por buenas a preguntas parecidas en este mismo piso). Úsalos SOLO para saber que el asunto está resuelto y con qué criterio: si el borrador responde en la misma línea que un precedente, NO escales alegando que falta en la INFORMACIÓN. NO son fuente de datos: no des por buena ninguna cifra, hora, disponibilidad ni importe apoyándote en ellos.\n${lista}`
}

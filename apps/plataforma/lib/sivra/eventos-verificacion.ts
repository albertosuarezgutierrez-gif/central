// lib/sivra/eventos-verificacion.ts — qué hace el sistema, SOLO, con un evento previsto.
//
// POR QUÉ (12/08/2026, petición de Alberto: «esto tiene q ser automático, yo no sé de esta
// información»). El descubrimiento de previstos (01/08) acababa en un Telegram que le pedía
// pasarlos a `confirmado` a mano. Dos cosas mal: le pide un dato que no tiene —saber si un
// festival anunciado en prensa se celebrará es rastreo, no conocimiento del dueño de los pisos—
// y deja una cola humana que se atasca; y un previsto atascado NO es inocuo: protege el suelo de
// esa noche y, desde la v2 del 09/08, sube el precio ponderado por confianza si la fecha está
// lejos. Un evento inventado que nadie retira se paga en reservas perdidas.
//
// LA IDEA: sustituir el juicio de Alberto por CORROBORACIÓN INDEPENDIENTE, y hacerlo con la
// regla de la casa — «dato que no hay ≠ dato que no se ha mirado». Cada señal tiene TRES
// estados, y el «no lo sé» nunca vale como «no».
//
//   1. Fuente DURA   — otra fila `confirmado` (Ticketmaster / websearch) en la misma fecha con
//                      nombre parecido. Traducción: ya hay entradas a la venta.
//   2. PRENSA        — una búsqueda dirigida sobre ESE evento («¿confirmado? ¿entradas? ¿se ha
//                      caído o movido?»). Si la búsqueda no responde → `no_verificable`, que NO
//                      es «no hay nada».
//   3. MERCADO       — los comparables FIABLES de esa noche por encima de la línea del mes. Es
//                      la señal que de verdad importa (dinero, no titulares), pero hoy la
//                      cobertura de `booking_mcp` es joven y casi siempre dirá `sin_datos`.
//
// LA ASIMETRÍA, otra vez. Confirmar de más se deshace: el raíl de ±%/día tarda 2-3 pasadas en
// llegar al precio y a meses vista apenas hay reservas que perder. Descartar de más solo cuesta
// la protección de suelo de una noche. Por eso el umbral de la prensa es alto (0,8) para
// confirmar, pero para DESCARTAR por caducidad basta con haber mirado dos veces de verdad.
//
// Módulo PURO: sin Prisma, sin `@/`, testeable con `node --test`.

import type { EstadoEvento } from './eventos-estado.ts'

/** Lo que responde la búsqueda dirigida sobre UN evento. */
export type VeredictoPrensa =
  /** hay fecha oficial y/o entradas: es un evento, no una apuesta */
  | 'confirmado'
  /** se sigue anunciando, pero sin fecha cerrada ni entradas */
  | 'sigue_previsto'
  /** cancelado, trasladado a otra ciudad, o la noticia era falsa */
  | 'desmentido'
  /** la búsqueda funcionó y no encontró nada sobre esto */
  | 'sin_informacion'
  /** 🚨 la búsqueda NO se pudo hacer (caída, JSON ilegible). NO es «no hay nada». */
  | 'no_verificable'

export type SenalDura = {
  corrobora: boolean
  /** de dónde salió la corroboración, para el motivo */
  fuente?: string | null
}

export type SenalPrensa = {
  veredicto: VeredictoPrensa
  confianza?: number | null
  evidencia?: string | null
  /** fecha que da la prensa, si difiere de la registrada (YYYY-MM-DD) */
  fechaConfirmada?: string | null
}

export type SenalMercado =
  /** los comps fiables de esa noche están claramente por encima de la línea del mes */
  | { estado: 'sube'; ratio: number; comps: number }
  /** hay corpus fiable y NO destaca */
  | { estado: 'plano'; ratio: number; comps: number }
  /** sin cobertura fiable: no dice ni que sí ni que no */
  | { estado: 'sin_datos' }

export type ContextoVerificacion = {
  /** días que faltan para la fecha del evento */
  diasVista: number
  /** verificaciones ÚTILES acumuladas ANTES de esta pasada */
  verificacionesPrevias: number
  /** fecha registrada del evento (YYYY-MM-DD), para detectar que la prensa da otra */
  fecha: string
  /** hoy (YYYY-MM-DD): no se reubica un evento a una fecha ya pasada */
  desde?: string
  /** última fecha del horizonte de pricing (YYYY-MM-DD): fuera de él no se reubica nada */
  hasta?: string
}

export type Decision = {
  /** estado nuevo; `null` = no se toca (no hay con qué decidir) */
  estado: EstadoEvento | null
  /** confianza nueva; `null`/`undefined` = se deja la que había */
  confianza?: number | null
  /** etiqueta corta y auditable de por qué */
  veredicto: string
  motivo: string
  /** ¿esta pasada ha podido MIRAR? Solo las útiles cuentan para caducar. */
  util: boolean
  /**
   * La prensa da otra fecha dentro del horizonte: hay que crear ahí el evento y descartar esta
   * fila. Un evento que se mueve de día, sin esto, cuesta una fecha protegida de menos y otra de
   * más — y ninguna de las dos se corrige sola.
   */
  reubicarA?: string
  /** estado con el que nace la fila reubicada */
  reubicarComo?: EstadoEvento
}

/** Confianza mínima de la prensa para CONFIRMAR (mueve el precio al factor pleno). */
export const CONFIANZA_CONFIRMA = 0.8
/** A partir de aquí de cerca, un previsto sin corroborar se descarta. */
export const DIAS_CADUCIDAD = 21
/** Verificaciones ÚTILES mínimas para poder caducar. Con 0 NUNCA se descarta. */
export const MIN_VERIFICACIONES_CADUCAR = 2
/** Cuánto tiene que destacar el mercado de esa noche sobre la línea del mes. */
export const MERCADO_RATIO_SUBE = 1.25
/** Comps fiables mínimos de la FECHA para que el mercado opine. */
export const MERCADO_MIN_COMPS = 4
/** Fechas distintas mínimas en la línea del mes (una fecha no es un mes). */
export const MERCADO_MIN_FECHAS_BASE = 3

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Decide qué hacer con UN previsto. No lanza nunca: ante cualquier duda devuelve `estado: null`,
 * que es «déjalo como está y vuelve mañana».
 */
export function decidirVerificacion(
  dura: SenalDura,
  prensa: SenalPrensa,
  mercado: SenalMercado,
  ctx: ContextoVerificacion,
): Decision {
  // Una pasada es ÚTIL si se ha podido mirar ALGO de verdad. El mercado no cuenta a propósito:
  // su silencio es lo normal (corpus fiable joven) y no puede autorizar a caducar nada.
  const prensaLegible = prensa.veredicto !== 'no_verificable'
  const util = dura.corrobora || prensaLegible
  const utiles = ctx.verificacionesPrevias + (util ? 1 : 0)
  const confianzaPrensa = Number(prensa.confianza)
  const confianzaValida = Number.isFinite(confianzaPrensa) && confianzaPrensa > 0 ? confianzaPrensa : null

  // 1. Ya hay entradas: es un hecho, no una apuesta.
  if (dura.corrobora) {
    return {
      estado: 'confirmado',
      confianza: 1,
      veredicto: 'corroborado_fuente_dura',
      motivo: `confirmado por ${dura.fuente || 'otra fuente'} en la misma fecha: ya está a la venta`,
      util: true,
    }
  }

  // 2. Desmentido: cancelado, movido de ciudad o noticia falsa. No vuelve a proponerse.
  if (prensa.veredicto === 'desmentido') {
    return {
      estado: 'descartado',
      veredicto: 'desmentido',
      motivo: `la búsqueda lo desmiente${prensa.evidencia ? `: ${prensa.evidencia}` : ''}`,
      util: true,
    }
  }

  // 3. La prensa da OTRA fecha. La fila actual deja de valer y el evento se muda a la buena.
  const otraFecha = prensa.fechaConfirmada
  if (
    otraFecha && ISO.test(otraFecha) && otraFecha !== ctx.fecha &&
    (!ctx.desde || otraFecha >= ctx.desde) && (!ctx.hasta || otraFecha <= ctx.hasta)
  ) {
    const confirmadoAlli = prensa.veredicto === 'confirmado' && (confianzaValida ?? 0) >= CONFIANZA_CONFIRMA
    return {
      estado: 'descartado',
      veredicto: 'fecha_movida',
      motivo: `la fecha real es ${otraFecha}, no ${ctx.fecha}: se traslada allí`,
      util: true,
      reubicarA: otraFecha,
      reubicarComo: confirmadoAlli ? 'confirmado' : 'previsto',
    }
  }

  // 4. La prensa lo da por confirmado con confianza suficiente.
  if (prensa.veredicto === 'confirmado' && (confianzaValida ?? 0) >= CONFIANZA_CONFIRMA) {
    return {
      estado: 'confirmado',
      confianza: confianzaValida,
      veredicto: 'prensa_confirma',
      motivo: `fecha oficial/entradas confirmadas (confianza ${confianzaValida})${prensa.evidencia ? `: ${prensa.evidencia}` : ''}`,
      util: true,
    }
  }

  // 5. El mercado de esa noche ya cotiza el evento y la prensa no lo contradice. Es la señal de
  //    dinero: si los comparables de esa fecha se han ido arriba, la demanda existe aunque
  //    todavía no haya nota de prensa que lo cierre.
  const prensaEnPie = prensa.veredicto === 'confirmado' || prensa.veredicto === 'sigue_previsto'
  if (mercado.estado === 'sube' && prensaEnPie) {
    return {
      estado: 'confirmado',
      confianza: confianzaValida,
      veredicto: 'mercado_confirma',
      motivo:
        `el mercado de esa noche va x${mercado.ratio.toFixed(2)} sobre la línea del mes ` +
        `(${mercado.comps} comps fiables) y la prensa lo mantiene`,
      util: true,
    }
  }

  // 6. Caducidad: se acerca la fecha, se ha MIRADO de verdad varias veces y nadie lo corrobora.
  //
  // 🚨 Exige `util` — que ESTA pasada haya podido mirar — además del acumulado. Sin ese `util` un
  // previsto con historial se descartaría el primer día que la búsqueda estuviera caída, que es
  // justo el día en que menos se sabe. Retirar la protección de una noche tiene que ser el
  // resultado de haber mirado y no encontrar nada, no de no haber podido mirar.
  if (util && ctx.diasVista <= DIAS_CADUCIDAD && utiles >= MIN_VERIFICACIONES_CADUCAR) {
    return {
      estado: 'descartado',
      veredicto: 'caducado',
      motivo:
        `a ${ctx.diasVista} días y ${utiles} verificaciones sin que nadie lo confirme: ` +
        `se retira (no protege el suelo de una noche inventada)`,
      util,
    }
  }

  // 7. Nada que decidir todavía. Se refresca la confianza si la prensa trae una mejor lectura.
  if (!util) {
    return {
      estado: null,
      veredicto: 'no_verificable',
      motivo: 'no se ha podido verificar en esta pasada (búsqueda caída): se reintenta, NO se decide',
      util: false,
    }
  }
  return {
    estado: null,
    confianza: prensa.veredicto === 'sigue_previsto' ? confianzaValida : null,
    veredicto: prensa.veredicto === 'sin_informacion' ? 'sin_novedad' : 'sigue_previsto',
    motivo:
      prensa.veredicto === 'sin_informacion'
        ? `verificado (${utiles}ª vez): nadie publica nada nuevo, sigue en previsto`
        : `verificado (${utiles}ª vez): se sigue anunciando pero sin fecha cerrada`,
    util: true,
  }
}

// ─── Nombres «parecidos» ────────────────────────────────────────────────────────────────────
// Dos filas de la misma fecha no son el mismo evento por compartir el día: en Sevilla puede
// haber un concierto de sala y una final de Copa el mismo sábado, y dar por confirmada la final
// porque hay entradas del concierto sería inventarse el pelotazo. Se compara por palabras.

const VACIAS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'en', 'y', 'a', 'al', 'con', 'por', 'para', 'sobre',
  'sevilla', 'espana', 'sevillano', 'sevillana', 'edicion', 'edition', 'gira', 'tour',
])

function tokens(nombre: string): string[] {
  return String(nombre ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(t => t.length >= 4 && !VACIAS.has(t) && !/^\d+$/.test(t))
}

/**
 * ¿Hablan del mismo evento? Exige 2 palabras significativas en común, salvo que uno de los dos
 * nombres solo tenga una (`Mangafest` vs `Mangafest Winter Edition`), donde basta esa.
 */
export function nombresParecidos(a: string, b: string): boolean {
  const ta = tokens(a), tb = tokens(b)
  if (!ta.length || !tb.length) return false
  const set = new Set(tb)
  const comunes = ta.filter(t => set.has(t)).length
  return comunes >= Math.min(2, ta.length, tb.length)
}

// ─── Señal de mercado ───────────────────────────────────────────────────────────────────────

export type FilaMercado = {
  /** piso al que pertenece el comparable */
  scenario: string
  /** p50 de comps fiables de la FECHA del evento */
  p50Fecha: number
  compsFecha: number
  /** p50 de comps fiables del MES, excluyendo fechas con evento conocido */
  p50Base: number | null
  /** fechas distintas que sostienen la línea del mes */
  fechasBase: number
}

/**
 * Traduce el corpus a una señal. Devuelve `sin_datos` en cuanto no hay con qué comparar — que es
 * lo que va a pasar casi siempre mientras `booking_mcp` acumula cobertura, y está bien: una
 * señal sin datos no confirma ni descarta nada.
 */
export function senalMercado(filas: FilaMercado[]): SenalMercado {
  let mejor: { ratio: number; comps: number } | null = null
  for (const f of filas) {
    if (!Number.isFinite(f.p50Fecha) || f.p50Fecha <= 0) continue
    if (f.compsFecha < MERCADO_MIN_COMPS) continue
    if (!f.p50Base || !Number.isFinite(f.p50Base) || f.p50Base <= 0) continue
    if (f.fechasBase < MERCADO_MIN_FECHAS_BASE) continue
    const ratio = f.p50Fecha / f.p50Base
    if (!mejor || ratio > mejor.ratio) mejor = { ratio, comps: f.compsFecha }
  }
  if (!mejor) return { estado: 'sin_datos' }
  return mejor.ratio >= MERCADO_RATIO_SUBE
    ? { estado: 'sube', ratio: mejor.ratio, comps: mejor.comps }
    : { estado: 'plano', ratio: mejor.ratio, comps: mejor.comps }
}

// ─── Parte de la pasada ─────────────────────────────────────────────────────────────────────

export type ResumenVerificacion = {
  revisados: number
  confirmados: number
  descartados: number
  reubicados: number
  /** intentos en los que NO se pudo mirar (búsqueda caída) */
  sinVerificar: number
  errores: string[]
}

/**
 * Igual que en el barrido de mercado y en el escaneo de facturas: lo que NO se pudo mirar va
 * PRIMERO. «0 cambios» con la búsqueda caída y «0 cambios» porque no había novedades se leen
 * igual en un parte mal escrito, y son cosas opuestas.
 */
export function detalleVerificacion(r: ResumenVerificacion): string {
  if (r.revisados === 0) return 'sin previstos que verificar (nada pendiente)'
  const partes: string[] = []
  if (r.sinVerificar) {
    partes.push(
      `⚠️ ${r.sinVerificar} sin poder verificar (búsqueda caída: NO es «no hay evento»)`,
    )
  }
  partes.push(
    `${r.revisados} previstos revisados · ${r.confirmados} confirmados · ` +
    `${r.descartados} descartados${r.reubicados ? ` · ${r.reubicados} movidos de fecha` : ''}`,
  )
  if (r.errores.length) partes.push(`${r.errores.length} fallos: ${r.errores[0]}`)
  return partes.join(' · ')
}

/**
 * ¿Vale la pasada? Conservador como `barridoFiable`/`ingestaFiable`: si se intentó verificar y la
 * mayoría no se pudo mirar, el latido va en ROJO. Un verificador que no verifica deja previstos
 * eternos exactamente igual que el estado anterior, pero en silencio.
 */
export function verificacionFiable(r: ResumenVerificacion): boolean {
  if (r.errores.length) return false
  if (r.revisados === 0) return true // no había cola: eso sí es «todo en orden»
  return r.sinVerificar * 2 < r.revisados
}

/**
 * Ventana de renovación de una póliza — la máquina comercial de una correduría.
 *
 * La regla no es «faltan X días» a ojo: la marca la **LCS 50/1980 art. 22**. El
 * TOMADOR debe oponerse a la prórroga con UN MES de antelación al vencimiento
 * (el asegurador necesita dos). Consecuencia práctica, y es la que decide si
 * merece la pena llamar:
 *
 *   - a más de un mes del vencimiento → aún se puede mover a otra compañía con
 *     efecto en la próxima anualidad;
 *   - a menos de un mes → la póliza SE PRORROGA sí o sí. Se puede seguir
 *     trabajando (retarificar para el año siguiente, negociar con la compañía),
 *     pero ya no cabe la oposición en plazo.
 *
 * Todo aquí es puro y testeable: la lógica del titular NO vive en el JSX
 * (regla global de CLAUDE.md).
 */

/** Preaviso mínimo del tomador para oponerse a la prórroga (LCS art. 22). */
export const DIAS_PREAVISO_TOMADOR = 30

/**
 * Preaviso del ASEGURADOR (LCS art. 22): dos meses, tanto para oponerse a la
 * prórroga como para comunicar **cualquier modificación del contrato**.
 *
 * Lo segundo es la palanca que más se usa en una renovación: **una subida de
 * prima ES una modificación**, no una prórroga a secas (criterio publicado de
 * la DGSFP). Si la compañía no la comunicó con dos meses, no puede imponerla:
 * el contrato se prorroga en los términos anteriores.
 */
export const DIAS_PREAVISO_ASEGURADOR = 60

/** Horizonte por defecto al pedir «los próximos vencimientos». */
export const DIAS_HORIZONTE_RENOVACION = 90

export type UrgenciaRenovacion =
  /** Ya venció: no es una renovación, es una recuperación. */
  | 'vencida'
  /** Dentro del mes de preaviso: la prórroga ya no se puede evitar en plazo. */
  | 'prorroga_inevitable'
  /** Entre 1 y 2 meses: hay plazo, pero justo. Es la llamada de esta semana. */
  | 'ultima_llamada'
  /** Más de 2 meses y dentro del horizonte: se prepara con calma. */
  | 'a_tiempo'

/** Días naturales de hoy al vencimiento (negativo si ya pasó). */
export function diasHastaVencimiento(vencimiento: Date, hoy: Date): number {
  const dia = 24 * 60 * 60 * 1000
  const v = Date.UTC(vencimiento.getUTCFullYear(), vencimiento.getUTCMonth(), vencimiento.getUTCDate())
  const h = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  return Math.round((v - h) / dia)
}

/** Último día en que el tomador puede oponerse a la prórroga (LCS art. 22). */
export function fechaLimiteOposicion(vencimiento: Date): Date {
  const d = new Date(Date.UTC(vencimiento.getUTCFullYear(), vencimiento.getUTCMonth(), vencimiento.getUTCDate()))
  d.setUTCDate(d.getUTCDate() - DIAS_PREAVISO_TOMADOR)
  return d
}

/** Último día en que el asegurador puede comunicar una subida de prima o
 *  cualquier otra modificación para esta renovación (LCS art. 22). */
export function fechaLimiteComunicacionAseguradora(vencimiento: Date): Date {
  const d = new Date(Date.UTC(vencimiento.getUTCFullYear(), vencimiento.getUTCMonth(), vencimiento.getUTCDate()))
  d.setUTCDate(d.getUTCDate() - DIAS_PREAVISO_ASEGURADOR)
  return d
}

/**
 * ¿La compañía comunicó la modificación a tiempo?
 *
 * `null` cuando NO consta la fecha de comunicación, que es distinto de «llegó
 * tarde»: significa que no se ha mirado. Afirmar que una subida es inoponible
 * sin tener la fecha es exactamente el error que hay que evitar — el cliente
 * llamaría a la compañía con un argumento falso.
 */
export function comunicacionEnPlazo(
  vencimiento: Date,
  comunicadaEl: Date | null | undefined,
): boolean | null {
  if (!comunicadaEl) return null
  return comunicadaEl.getTime() <= fechaLimiteComunicacionAseguradora(vencimiento).getTime()
}

export function urgenciaRenovacion(dias: number): UrgenciaRenovacion {
  if (dias < 0) return 'vencida'
  if (dias <= DIAS_PREAVISO_TOMADOR) return 'prorroga_inevitable'
  if (dias <= 2 * DIAS_PREAVISO_TOMADOR) return 'ultima_llamada'
  return 'a_tiempo'
}

/** Etiqueta corta para pantalla/informe. En español, sin jerga de código. */
export function etiquetaUrgencia(u: UrgenciaRenovacion): string {
  switch (u) {
    case 'vencida': return 'Vencida'
    case 'prorroga_inevitable': return 'Se prorroga (fuera de plazo)'
    case 'ultima_llamada': return 'Última llamada'
    case 'a_tiempo': return 'A tiempo'
  }
}

/**
 * Prima de referencia de una póliza para priorizar la llamada.
 *
 * `null` es un TERCER estado con significado propio: «la compañía no ha
 * informado la prima» (medido: las de Allianz vienen así por EIAC). Nunca se
 * colapsa a 0 — un 0 diría «no vale nada» y es justo lo contrario de lo que
 * sabemos, que es que no lo sabemos.
 */
export function primaReferencia(
  p: { primaAnual?: number | null; primaBruta?: number | null },
): number | null {
  // 🚨 Un 0 NO es una prima: 24 de las 109 vivas traen `prima_anual=0` o
  // `prima_bruta=0` del EIAC (medido 02/09/2026, casi todas canceladas) y
  // pintarlo como «0,00€» afirma que el seguro es gratis. Es «no informada».
  if (typeof p.primaBruta === 'number' && Number.isFinite(p.primaBruta) && p.primaBruta > 0) return p.primaBruta
  if (typeof p.primaAnual === 'number' && Number.isFinite(p.primaAnual) && p.primaAnual > 0) return p.primaAnual
  return null
}

/** Suma de primas conocidas + cuántas no lo son. Nunca «X €» a secas cuando falta información. */
export function primaEnRiesgo(
  polizas: Array<{ primaAnual?: number | null; primaBruta?: number | null }>,
): { total: number; conocidas: number; sinPrima: number } {
  let total = 0
  let conocidas = 0
  let sinPrima = 0
  for (const p of polizas) {
    const prima = primaReferencia(p)
    if (prima === null) sinPrima++
    else { total += prima; conocidas++ }
  }
  return { total: Math.round(total * 100) / 100, conocidas, sinPrima }
}

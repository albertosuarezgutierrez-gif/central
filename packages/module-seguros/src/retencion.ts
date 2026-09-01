// Un recibo devuelto es un cliente que se está yendo, y casi siempre sin
// saberlo. Este módulo dice CUÁNTO tiempo queda y QUÉ se puede hacer todavía.
//
// ─── La ley pone el reloj, y son tres tramos (art. 15 LCS) ──────────────────
// Para una prima SUCESIVA impagada (la renovación de siempre, que es el 99% de
// los casos de una cartera viva):
//
//   día 0            vence el recibo. Se devuelve. No pasa nada todavía.
//   +1 mes           🔴 la COBERTURA QUEDA SUSPENDIDA. El cliente sigue
//                    conduciendo y cree que está asegurado. Si tiene un
//                    accidente, la compañía no responde.
//   +6 meses         ⚫ el contrato queda EXTINGUIDO si el asegurador no ha
//                    reclamado el pago. Ya no hay póliza que rescatar: retener
//                    a ese cliente es hacerle una PÓLIZA NUEVA.
//
// Y la parte buena, que es la que hace que llamar merezca la pena: mientras el
// contrato no esté resuelto ni extinguido, **pagar devuelve la cobertura 24
// horas después**. O sea, entre el mes y los seis meses una llamada de dos
// minutos vuelve a cubrir al cliente. Ese es el trabajo.
//
// ⚠️ Los plazos corren desde el vencimiento del recibo, pero la resolución
// depende de lo que haya RECLAMADO la compañía, y eso no viaja por CIMA. Por
// eso todo lo de aquí es ORIENTATIVO y así se dice en pantalla: sirve para
// ordenar las llamadas, no para afirmarle a nadie que está sin seguro.
//
// ─── Y la regla de la casa, aquí más que en ningún sitio ────────────────────
// Sin fecha de vencimiento del recibo NO se calcula nada. Un impagado sin fecha
// no es «recién devuelto»: es que no se sabe desde cuándo, y suponerlo reciente
// lo manda al final de la cola de llamadas justo cuando podría ser el más viejo.

/** Días desde el vencimiento hasta que la cobertura queda suspendida. */
export const DIAS_SUSPENSION = 30
/** Días desde el vencimiento hasta que el contrato se puede dar por extinguido. */
export const DIAS_EXTINCION = 180

export type EstadoRetencion =
  /** Devuelto hace poco: se paga y no ha pasado nada. */
  | 'en_plazo'
  /** 🔴 Pasado el mes: el cliente circula sin cobertura y no lo sabe. */
  | 'suspendida'
  /** ⚫ Pasados 6 meses: la póliza ya no se rescata, hay que rehacerla. */
  | 'extinguida'
  /** No se sabe desde cuándo. NO es «recién devuelto». */
  | 'sin_fecha'

export type Retencion = {
  estado: EstadoRetencion
  /** Días desde que venció el recibo. `null` cuando no consta la fecha. */
  dias: number | null
  /** Días que quedan para que se suspenda la cobertura. `null` si ya pasó. */
  diasParaSuspension: number | null
  /** Días que quedan para que el contrato se extinga. `null` si ya pasó. */
  diasParaExtincion: number | null
  /** Qué hacer, en una frase. Es la columna que se lee al descolgar. */
  accion: string
  /** Para ordenar la lista de llamadas: cuanto más alto, antes se llama. */
  prioridad: number
}

function diasDesde(desde: string | null, hoy: Date): number | null {
  if (desde === null) return null
  const d = new Date(`${desde}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((hoy.getTime() - d.getTime()) / 86_400_000)
}

/**
 * Qué se puede hacer todavía con un recibo devuelto.
 *
 * `vencimiento` es la fecha del RECIBO (ISO `aaaa-mm-dd`), no la de la póliza.
 */
export function retencion(vencimiento: string | null, hoy: Date = new Date()): Retencion {
  const d = diasDesde(vencimiento, hoy)

  if (d === null) {
    return {
      estado: 'sin_fecha',
      dias: null,
      diasParaSuspension: null,
      diasParaExtincion: null,
      accion:
        'La compañía no informa cuándo venció el recibo, así que no se sabe si la cobertura ' +
        'sigue en pie. Consúltalo en su portal antes de llamar.',
      // Alta a propósito: un impagado sin fecha puede ser el más viejo de todos,
      // y dejarlo al final de la cola es justo lo que no se puede permitir.
      prioridad: 80,
    }
  }

  if (d >= DIAS_EXTINCION) {
    return {
      estado: 'extinguida',
      dias: d,
      diasParaSuspension: null,
      diasParaExtincion: null,
      accion:
        'Han pasado más de 6 meses: el contrato se da por extinguido y pagar ya no lo revive. ' +
        'Retenerlo es hacerle póliza nueva — pide precio y compáralo con lo que pagaba.',
      prioridad: 40,
    }
  }

  if (d >= DIAS_SUSPENSION) {
    return {
      estado: 'suspendida',
      dias: d,
      diasParaSuspension: null,
      diasParaExtincion: DIAS_EXTINCION - d,
      accion:
        'La cobertura está suspendida y el cliente probablemente no lo sabe. Llama hoy: si paga, ' +
        'vuelve a estar cubierto en 24 horas.',
      // Lo más urgente que hay en la cartera: alguien circulando sin seguro.
      prioridad: 100,
    }
  }

  return {
    estado: 'en_plazo',
    dias: d,
    diasParaSuspension: DIAS_SUSPENSION - d,
    diasParaExtincion: DIAS_EXTINCION - d,
    accion:
      `Aún está cubierto. Quedan ${DIAS_SUSPENSION - d} día(s) para que se suspenda: con una ` +
      'llamada y el pago no llega a pasar nada.',
    prioridad: 60,
  }
}

/**
 * El titular de una lista de retención. Separa las tres cosas que se hacen
 * distinto, en vez de dar un total que las mezcla.
 */
export type ResumenRetencion = {
  suspendidas: number
  enPlazo: number
  extinguidas: number
  sinFecha: number
  /** Prima anual de las pólizas en juego. `null` = ninguna la informa. */
  primaEnRiesgo: number | null
  /** Cuántas no informan prima: sin esto el total parecería completo. */
  sinPrima: number
}

export function resumirRetencion(
  filas: readonly { estado: EstadoRetencion; prima: number | null }[],
): ResumenRetencion {
  let suspendidas = 0
  let enPlazo = 0
  let extinguidas = 0
  let sinFecha = 0
  let suma = 0
  let conPrima = 0
  for (const f of filas) {
    if (f.estado === 'suspendida') suspendidas++
    else if (f.estado === 'en_plazo') enPlazo++
    else if (f.estado === 'extinguida') extinguidas++
    else sinFecha++
    if (f.prima !== null) {
      suma += f.prima
      conPrima++
    }
  }
  return {
    suspendidas,
    enPlazo,
    extinguidas,
    sinFecha,
    // Si NINGUNA informa prima, el riesgo es «no se sabe», no 0,00€.
    primaEnRiesgo: conPrima === 0 ? null : Math.round(suma * 100) / 100,
    sinPrima: filas.length - conPrima,
  }
}

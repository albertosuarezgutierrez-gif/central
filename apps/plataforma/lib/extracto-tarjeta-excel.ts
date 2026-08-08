// apps/plataforma/lib/extracto-tarjeta-excel.ts
// El MISMO extracto de tarjeta que el PDF, pero descargado en Excel («Información de movimientos de
// tarjetas» de Kutxabank). Módulo PURO (sin BD ni red, testeable con `node --test`).
//
// El problema: el Excel NO trae el número de tarjeta en ninguna cabecera, así que `parseExtractoXls`
// lo deja en el `ccc` genérico 'CUENTA-IMPORTADA' y los movimientos acabarían en una cuenta cajón en
// vez de en la tarjeta real. El número sí está, pero DENTRO del concepto de la línea de liquidación:
//   `PAGO RECIBO 4662032019750300`
// De ahí se deriva el mismo `ccc` que usa el parser del PDF (`TARJETA-KUTXA-<últimos 4>`), así el
// Excel y el PDF del mismo mes caen en la MISMA cuenta y el dedupe por contenido los colapsa.
//
// REGLA: si el fichero no permite identificar la tarjeta sin adivinar (no hay liquidación, o hay
// varias tarjetas mezcladas), se devuelve `null` y quien llame pregunta. Meter movimientos en la
// cuenta equivocada es peor que no importarlos.

import type { ExtractoN43 } from './norma43'

/** Nº de tarjeta dentro del concepto de la liquidación: `PAGO RECIBO 4662032019750300`. */
const RE_PAN_RECIBO = /PAGO\s+RECIBO\s+(\d{15,19})/i
/** Una compra con tarjeta; es lo que distingue un extracto de tarjeta de uno de cuenta corriente. */
const RE_COMPRA = /^\s*COMPRA\s+EN\b/i

/** Proporción mínima de líneas «COMPRA EN …» para dar el fichero por extracto de tarjeta. */
const MIN_RATIO_COMPRAS = 0.6

export interface TarjetaExcel {
  /** `TARJETA-KUTXA-0300` — mismo formato que produce el parser del PDF. */
  ccc: string
  /** PAN completo hallado en la liquidación (para trazas; no se persiste). */
  pan: string
}

/**
 * ¿Este Excel es un extracto de TARJETA y de cuál? `null` si no lo es o si no se puede identificar
 * la tarjeta sin adivinar (sin línea de liquidación, o con varias tarjetas mezcladas).
 */
export function identificarTarjetaExcel(ex: ExtractoN43 | undefined | null): TarjetaExcel | null {
  const movs = ex?.movimientos ?? []
  if (movs.length < 3) return null

  const compras = movs.filter(m => RE_COMPRA.test(m.concepto || '')).length
  if (compras / movs.length < MIN_RATIO_COMPRAS) return null

  const pans = new Set<string>()
  for (const m of movs) {
    const pan = (m.concepto || '').match(RE_PAN_RECIBO)?.[1]
    if (pan) pans.add(pan)
  }
  // 0 → no hay liquidación de la que sacar el número; >1 → el fichero mezcla tarjetas. En ambos
  // casos habría que adivinar la cuenta destino, y eso no se hace.
  if (pans.size !== 1) return null

  const pan = [...pans][0]
  return { ccc: `TARJETA-KUTXA-${pan.slice(-4)}`, pan }
}

/**
 * Deja el extracto del Excel EXACTAMENTE con la forma que produce el parser del PDF, listo para
 * `importarExtracto`.
 *
 * 🚨 LANDMINE — el mismo mes en PDF y en Excel se DUPLICABA. El `dedupeHash` (lib/norma43.ts) se
 * calcula sobre `fecha|fechaValor|importe|conceptoComun|concepto|referencia|saldo`, y el Excel SÍ
 * trae la columna «fecha valor», que difiere de la de operación en la mayoría de las compras (63 de
 * 109 en el fichero real de julio de 2026). Con eso, subir los dos ficheros del mismo extracto —que
 * es justo lo que uno hace cuando el PDF no se lee— metía 63 compras por segunda vez (~1.990€ de
 * gasto fantasma). Igualando `fechaValor` a la fecha de operación y soltando el saldo, los 109
 * hashes coinciden byte a byte con los del PDF y el `ON CONFLICT` los descarta.
 */
export function comoExtractoTarjeta(ex: ExtractoN43, ccc: string): ExtractoN43 {
  return {
    ...ex,
    ccc,
    // `banco: ''` a propósito: el upsert de importarExtracto hace COALESCE, así que no renombra la
    // cuenta existente (p. ej. «💳 Tarjeta Kutxabank Pilar») — misma decisión que el parser del PDF.
    banco: '',
    movimientos: ex.movimientos.map(m => ({
      ...m,
      fechaValor: m.fechaOperacion,
      conceptoComun: '',
      referencia: '',
      saldoPosterior: undefined,
    })),
  }
}

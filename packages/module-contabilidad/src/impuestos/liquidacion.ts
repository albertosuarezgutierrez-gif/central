// Asientos de LIQUIDACIÓN que se generan al marcar una declaración como presentada. PURO: devuelve apuntes, quien persiste los asienta.
//  · IVA (303): regularización 477/472 → 4750 (a ingresar) o 4700 (a compensar), compensación de cuotas anteriores (4750/4700) y, si se
//    ingresa, el pago 4750 → 572.
//  · Retenciones (111, 115): el pasivo ya está en 4751 (lo dejaron nóminas/compras); al pagar, 4751 → 572.
//  · 130: NO genera asiento (pago a cuenta del IRPF del titular). 390/190/180/347/349: informativos, sin asiento.
// Todo desde el SNAPSHOT del cálculo guardado en la declaración (no se recalcula): lo que se asienta es lo que se revisó.
import { ErrorContable, type Centimos } from '../partida/dinero.ts'
import type { ApunteAsiento } from '../partida/asiento.ts'
import { importeDe, type CalculoModelo } from './comun.ts'

export type AsientoPropuesto = { concepto: string; apuntes: ApunteAsiento[]; /** Rol del asiento dentro de la presentación. */ rol: 'liquidacion' | 'pago' }

const ap = (cuenta: string, debe: Centimos, haber: Centimos, documento: string): ApunteAsiento | null => (debe === 0 && haber === 0 ? null : { cuenta, debe, haber, documento })
const limpio = (xs: (ApunteAsiento | null)[]): ApunteAsiento[] => xs.filter((x): x is ApunteAsiento => x !== null)

export const CUENTAS_LIQUIDACION = { ivaRepercutido: '477', ivaSoportado: '472', hpAcreedoraIva: '4750', hpDeudoraIva: '4700', hpAcreedoraRetenciones: '4751', bancos: '572' } as const

/**
 * Asientos de la presentación del 303. `pagar` = el titular ingresa el resultado (domiciliación/NRC) con cargo a bancos; si no, queda en 4750.
 * Con resultado a compensar (negativo) deja el saldo en 4700 (la devolución en el 4T no se contabiliza aquí).
 */
export function asientosPresentacion303(c: CalculoModelo, opts: { pagar: boolean }): AsientoPropuesto[] {
  if (c.modelo !== '303') throw new ErrorContable('modelo_invalido', 'solo para el modelo 303')
  if (c.noSoportado.length || c.resultado === null) throw new ErrorContable('no_liquidable', 'el cálculo contiene casos no soportados: no se puede liquidar')
  const doc = `303-${c.anio}-${c.periodo}`
  const dev = importeDe(c, '27')
  const ded = importeDe(c, '45')
  const r46 = importeDe(c, '46')
  const comp = importeDe(c, '68')
  if (dev - ded !== r46) throw new ErrorContable('calculo_incoherente', 'la casilla 46 no es 27 − 45')
  const out: AsientoPropuesto[] = []
  const liq = limpio([
    ap(CUENTAS_LIQUIDACION.ivaRepercutido, dev, 0, doc),
    ap(CUENTAS_LIQUIDACION.ivaSoportado, 0, ded, doc),
    r46 > 0 ? ap(CUENTAS_LIQUIDACION.hpAcreedoraIva, 0, r46, doc) : ap(CUENTAS_LIQUIDACION.hpDeudoraIva, -r46, 0, doc),
    ap(CUENTAS_LIQUIDACION.hpAcreedoraIva, comp, 0, doc),
    ap(CUENTAS_LIQUIDACION.hpDeudoraIva, 0, comp, doc),
  ])
  if (liq.length >= 2) out.push({ rol: 'liquidacion', concepto: `Liquidación de IVA ${c.periodo} ${c.anio} (modelo 303)`, apuntes: liq })
  const aIngresar = r46 > 0 ? r46 - comp : 0
  if (opts.pagar && aIngresar > 0) {
    out.push({ rol: 'pago', concepto: `Pago de IVA ${c.periodo} ${c.anio} (modelo 303)`, apuntes: limpio([ap(CUENTAS_LIQUIDACION.hpAcreedoraIva, aIngresar, 0, doc), ap(CUENTAS_LIQUIDACION.bancos, 0, aIngresar, doc)]) })
  }
  return out
}

/** Pago de retenciones (111/115): 4751 → 572 por el resultado a ingresar. Sin asiento si no hay nada que pagar. */
export function asientosPresentacionRetenciones(c: CalculoModelo, opts: { pagar: boolean }): AsientoPropuesto[] {
  if (c.modelo !== '111' && c.modelo !== '115') throw new ErrorContable('modelo_invalido', 'solo para los modelos 111 y 115')
  if (c.noSoportado.length || c.resultado === null) throw new ErrorContable('no_liquidable', 'el cálculo contiene casos no soportados')
  if (!opts.pagar || c.resultado <= 0) return []
  const doc = `${c.modelo}-${c.anio}-${c.periodo}`
  return [{ rol: 'pago', concepto: `Ingreso de retenciones ${c.periodo} ${c.anio} (modelo ${c.modelo})`, apuntes: limpio([ap(CUENTAS_LIQUIDACION.hpAcreedoraRetenciones, c.resultado, 0, doc), ap(CUENTAS_LIQUIDACION.bancos, 0, c.resultado, doc)]) }]
}

/** Asientos de la presentación según el modelo (los que no contabilizan devuelven []). */
export function asientosDePresentacion(c: CalculoModelo, opts: { pagar: boolean }): AsientoPropuesto[] {
  switch (c.modelo) {
    case '303': return asientosPresentacion303(c, opts)
    case '111':
    case '115': return asientosPresentacionRetenciones(c, opts)
    default: return []
  }
}

// F5 — Periodificaciones al cierre (480 gastos anticipados · 485 ingresos anticipados). PURO, céntimos enteros.
// Un gasto pagado por adelantado (seguro anual, alquiler…) o un ingreso cobrado por adelantado se reparte por DÍAS entre el ejercicio que cierra
// y los siguientes. Al cierre se difiere lo que corresponde al futuro; el 1 de enero se revierte (contraasiento) y el gasto/ingreso vuelve a
// imputarse en el ejercicio al que pertenece.
import { ErrorContable, validarCentimos, type Centimos } from '../partida/dinero.ts'
import { esFechaISO, type ApunteAsiento, type Asiento } from '../partida/asiento.ts'

export type Periodificacion = {
  ref: string
  tipo: 'gasto' | 'ingreso'
  descripcion: string
  /** Cuenta del gasto (6xx) o del ingreso (7xx) donde se asentó el importe completo. */
  cuentaOrigen: string
  /** Importe TOTAL asentado en la cuenta de origen (céntimos, > 0). */
  importe: Centimos
  /** ISO inclusivos: periodo al que corresponde el gasto/ingreso. */
  inicio: string
  fin: string
}

const MS_DIA = 86_400_000
const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_DIA) + 1

export function validarPeriodificacion(p: Periodificacion): string[] {
  const e: string[] = []
  if (!p.ref || !/^[A-Za-z0-9._:\-/]{1,64}$/.test(p.ref)) e.push('referencia no válida')
  if (p.tipo !== 'gasto' && p.tipo !== 'ingreso') e.push('tipo debe ser gasto o ingreso')
  if (!p.descripcion?.trim()) e.push('descripción obligatoria')
  if (!Number.isSafeInteger(p.importe) || p.importe <= 0) e.push('el importe debe ser un entero positivo en céntimos')
  if (!esFechaISO(p.inicio) || !esFechaISO(p.fin)) e.push('fechas inválidas')
  else if (p.fin < p.inicio) e.push('el fin es anterior al inicio')
  if (p.tipo === 'gasto' && !/^6/.test(p.cuentaOrigen)) e.push('la cuenta de origen de un gasto debe ser del grupo 6')
  if (p.tipo === 'ingreso' && !/^7/.test(p.cuentaOrigen)) e.push('la cuenta de origen de un ingreso debe ser del grupo 7')
  return e
}

export type ReparticionPeriodo = { diasTotales: number; diasHastaCierre: number; imputado: Centimos; diferido: Centimos }

/** Reparto lineal por días entre «hasta el cierre» (inclusive) y lo posterior. Redondeo al céntimo sobre lo imputado; el diferido es el resto. */
export function repartirPeriodificacion(p: Periodificacion, cierre: string): ReparticionPeriodo {
  const errs = validarPeriodificacion(p)
  if (errs.length) throw new ErrorContable('periodificacion_invalida', errs.join('; '))
  if (!esFechaISO(cierre)) throw new ErrorContable('fecha_invalida', 'fecha de cierre inválida')
  const total = dias(p.inicio, p.fin)
  const hasta = cierre < p.inicio ? 0 : cierre >= p.fin ? total : dias(p.inicio, cierre)
  const imputado = Number((BigInt(2) * BigInt(p.importe) * BigInt(hasta) + BigInt(total)) / (BigInt(2) * BigInt(total)))
  return { diasTotales: total, diasHastaCierre: hasta, imputado, diferido: p.importe - imputado }
}

export const refPeriodificacion = (anio: number) => `periodificacion:${anio}`
export const refReversaPeriodificacion = (anio: number) => `periodificacion-reversa:${anio}`

/**
 * Asiento de periodificación al cierre del ejercicio `anio` (31/12): gasto → Debe 480 / Haber 6xx; ingreso → Debe 7xx / Haber 485.
 * `null` si nada queda por diferir.
 */
export function asientoPeriodificacion(lista: readonly Periodificacion[], anio: number): Asiento | null {
  const cierre = `${anio}-12-31`
  const g = new Map<string, Centimos>()
  const i = new Map<string, Centimos>()
  let anticipadoGasto = 0
  let anticipadoIngreso = 0
  for (const p of lista) {
    const { diferido } = repartirPeriodificacion(p, cierre)
    if (diferido <= 0) continue
    // Un gasto/ingreso que empieza DESPUÉS del cierre se difiere entero; uno que ya acabó no se difiere.
    if (p.tipo === 'gasto') { g.set(p.cuentaOrigen, (g.get(p.cuentaOrigen) ?? 0) + diferido); anticipadoGasto += diferido }
    else { i.set(p.cuentaOrigen, (i.get(p.cuentaOrigen) ?? 0) + diferido); anticipadoIngreso += diferido }
  }
  const apuntes: ApunteAsiento[] = []
  if (anticipadoGasto > 0) {
    apuntes.push({ cuenta: '480', debe: anticipadoGasto, haber: 0 })
    for (const [cuenta, haber] of [...g.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) apuntes.push({ cuenta, debe: 0, haber })
  }
  if (anticipadoIngreso > 0) {
    for (const [cuenta, debe] of [...i.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) apuntes.push({ cuenta, debe, haber: 0 })
    apuntes.push({ cuenta: '485', debe: 0, haber: anticipadoIngreso })
  }
  if (!apuntes.length) return null
  validarCentimos(anticipadoGasto + anticipadoIngreso)
  return { fecha: cierre, ejercicio: anio, concepto: `Periodificaciones al cierre del ejercicio ${anio}`, apuntes, origen: { tipo: 'periodificacion', ref: refPeriodificacion(anio) } }
}

/** Reversa del 1 de enero del ejercicio siguiente: mismos apuntes con debe/haber intercambiados. El de cierre no se toca. */
export function asientoReversaPeriodificacion(cierre: Asiento): Asiento {
  const sig = cierre.ejercicio + 1
  return {
    fecha: `${sig}-01-01`, ejercicio: sig, concepto: `Reversa de las periodificaciones del ejercicio ${cierre.ejercicio}`,
    apuntes: cierre.apuntes.map((p) => ({ cuenta: p.cuenta, debe: p.haber, haber: p.debe })),
    origen: { tipo: 'periodificacion', ref: refReversaPeriodificacion(sig) },
    rectificaA: cierre.origen?.ref ?? cierre.concepto,
  }
}

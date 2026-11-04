// Libros contables: diario, mayor, sumas y saldos, balance de situación y cuenta de PyG abreviados.
// Convención: saldo = debe − haber (positivo = deudor). Todo en céntimos.

import type { Asiento } from './asiento.ts'
import type { Centimos } from './dinero.ts'

export interface Periodo {
  /** ISO inclusivo. */
  desde?: string
  hasta?: string
}

function enPeriodo(a: Asiento, p?: Periodo): boolean {
  return !(p?.desde && a.fecha < p.desde) && !(p?.hasta && a.fecha > p.hasta)
}

function ordenar(asientos: readonly Asiento[]): Asiento[] {
  return asientos
    .map((a, i) => ({ a, i }))
    .sort((x, y) =>
      x.a.fecha < y.a.fecha ? -1 : x.a.fecha > y.a.fecha ? 1
        : (x.a.numero ?? Infinity) - (y.a.numero ?? Infinity) || x.i - y.i)
    .map(x => x.a)
}

/** Libro diario: asientos ordenados por fecha + número (estable). */
export function libroDiario(asientos: readonly Asiento[], periodo?: Periodo): Asiento[] {
  return ordenar(asientos.filter(a => enPeriodo(a, periodo)))
}

export interface LineaMayor {
  fecha: string
  numero?: number
  concepto: string
  cuenta: string
  documento?: string
  debe: Centimos
  haber: Centimos
  /** Saldo acumulado (debe − haber). */
  saldo: Centimos
}

export interface Mayor {
  cuenta: string
  lineas: LineaMayor[]
  totalDebe: Centimos
  totalHaber: Centimos
  saldo: Centimos
}

/**
 * Mayor de una cuenta. Con `subcuentas` (por defecto) incluye las que cuelgan de ella por prefijo
 * (mayor de 430 = 430 + 430000001…). `saldoInicial` permite arrancar en un periodo posterior.
 */
export function libroMayor(
  asientos: readonly Asiento[],
  cuenta: string,
  opts: Periodo & { subcuentas?: boolean; saldoInicial?: Centimos } = {},
): Mayor {
  const sub = opts.subcuentas ?? true
  const lineas: LineaMayor[] = []
  let saldo = opts.saldoInicial ?? 0
  let totalDebe = 0
  let totalHaber = 0
  for (const a of libroDiario(asientos, opts)) {
    for (const p of a.apuntes) {
      if (!(sub ? p.cuenta.startsWith(cuenta) : p.cuenta === cuenta)) continue
      saldo += p.debe - p.haber
      totalDebe += p.debe
      totalHaber += p.haber
      lineas.push({
        fecha: a.fecha, concepto: a.concepto, cuenta: p.cuenta, debe: p.debe, haber: p.haber, saldo,
        ...(a.numero !== undefined ? { numero: a.numero } : {}),
        ...(p.documento ? { documento: p.documento } : {}),
      })
    }
  }
  return { cuenta, lineas, totalDebe, totalHaber, saldo }
}

export interface FilaSumasSaldos {
  cuenta: string
  debe: Centimos
  haber: Centimos
  saldoDeudor: Centimos
  saldoAcreedor: Centimos
}

export interface SumasYSaldos {
  filas: FilaSumasSaldos[]
  totales: { debe: Centimos; haber: Centimos; saldoDeudor: Centimos; saldoAcreedor: Centimos }
  /** Σdebe = Σhaber y Σsaldo deudor = Σsaldo acreedor. */
  cuadra: boolean
}

function acumular(asientos: readonly Asiento[], periodo?: Periodo): Map<string, { debe: Centimos; haber: Centimos }> {
  const m = new Map<string, { debe: Centimos; haber: Centimos }>()
  for (const a of asientos) {
    if (!enPeriodo(a, periodo)) continue
    for (const p of a.apuntes) {
      const f = m.get(p.cuenta) ?? { debe: 0, haber: 0 }
      f.debe += p.debe
      f.haber += p.haber
      m.set(p.cuenta, f)
    }
  }
  return m
}

export function sumasYSaldos(asientos: readonly Asiento[], periodo?: Periodo): SumasYSaldos {
  const filas = [...acumular(asientos, periodo).entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([cuenta, v]): FilaSumasSaldos => {
      const s = v.debe - v.haber
      return { cuenta, debe: v.debe, haber: v.haber, saldoDeudor: s > 0 ? s : 0, saldoAcreedor: s < 0 ? -s : 0 }
    })
  const totales = filas.reduce(
    (t, f) => ({ debe: t.debe + f.debe, haber: t.haber + f.haber, saldoDeudor: t.saldoDeudor + f.saldoDeudor, saldoAcreedor: t.saldoAcreedor + f.saldoAcreedor }),
    { debe: 0, haber: 0, saldoDeudor: 0, saldoAcreedor: 0 },
  )
  return { filas, totales, cuadra: totales.debe === totales.haber && totales.saldoDeudor === totales.saldoAcreedor }
}

// ── Rúbricas abreviadas ──────────────────────────────────────────────────────────────────────────
// Dato, no lógica: prefijo de cuenta (el más largo gana) → rúbrica.

export interface Rubrica {
  clave: string
  etiqueta: string
  importe: Centimos
}

function saldoPorPrefijo(m: Map<string, { debe: Centimos; haber: Centimos }>): (cuenta: string) => Centimos {
  return cuenta => { const v = m.get(cuenta)!; return v.debe - v.haber }
}

function rubricaDe(cuenta: string, tabla: readonly (readonly [string, string])[], porDefecto: string): string {
  let mejor = ''
  let clave = porDefecto
  for (const [pref, c] of tabla) if (cuenta.startsWith(pref) && pref.length > mejor.length) { mejor = pref; clave = c }
  return clave
}

const ACTIVO: readonly (readonly [string, string])[] = [
  ['20', 'A.I'], ['21', 'A.II'], ['28', 'A.II'], ['29', 'A.II'],
  ['3', 'B.I'], ['407', 'B.I'],
  ['43', 'B.II'], ['44', 'B.II'], ['460', 'B.II'], ['47', 'B.II'], ['480', 'B.III'],
  ['57', 'B.IV'],
]
const ETIQ_ACTIVO: Record<string, string> = {
  'A.I': 'A) I. Inmovilizado intangible',
  'A.II': 'A) II. Inmovilizado material (neto de amortización)',
  'B.I': 'B) I. Existencias',
  'B.II': 'B) II. Deudores comerciales y otras cuentas a cobrar',
  'B.III': 'B) III. Periodificaciones',
  'B.IV': 'B) IV. Efectivo y otros activos líquidos',
  'B.V': 'B) V. Otros activos',
}
const PASIVO: readonly (readonly [string, string])[] = [
  ['10', 'A.I'], ['11', 'A.II'], ['12', 'A.III'],
  ['17', 'B.I'],
  ['40', 'C.I'], ['41', 'C.I'], ['438', 'C.I'], ['465', 'C.I'], ['475', 'C.I'], ['476', 'C.I'], ['477', 'C.I'], ['485', 'C.II'],
  ['52', 'C.III'], ['523', 'C.III'], ['55', 'C.III'],
]
const ETIQ_PASIVO: Record<string, string> = {
  'A.I': 'A) I. Capital',
  'A.II': 'A) II. Reservas',
  'A.III': 'A) III. Resultados de ejercicios anteriores',
  'A.IV': 'A) IV. Resultado del ejercicio',
  'B.I': 'B) Pasivo no corriente: deudas a largo plazo',
  'C.I': 'C) I. Acreedores comerciales y otras cuentas a pagar',
  'C.II': 'C) II. Periodificaciones',
  'C.III': 'C) III. Deudas a corto plazo',
  'C.IV': 'C) IV. Otros pasivos',
}

export interface BalanceSituacion {
  activo: Rubrica[]
  patrimonioNetoYPasivo: Rubrica[]
  totalActivo: Centimos
  totalPatrimonioNetoYPasivo: Centimos
  resultadoEjercicio: Centimos
  cuadra: boolean
}

/**
 * Balance de situación abreviado a una fecha (acumulado desde el inicio de los datos recibidos).
 * El resultado del ejercicio es el saldo de los grupos 6 y 7 aún sin cerrar. Cuentas de saldo contrario
 * a su rúbrica natural (p. ej. cliente acreedor) se reclasifican a «Otros» para no netear deudas con activos.
 */
export function balanceSituacion(asientos: readonly Asiento[], hasta?: string): BalanceSituacion {
  const m = acumular(asientos, { hasta })
  const saldo = saldoPorPrefijo(m)
  const act = new Map<string, Centimos>()
  const pas = new Map<string, Centimos>()
  let resultado = 0
  const suma = (mp: Map<string, Centimos>, k: string, v: Centimos) => mp.set(k, (mp.get(k) ?? 0) + v)
  for (const cuenta of m.keys()) {
    const s = saldo(cuenta)
    const g = cuenta[0]
    if (g === '6' || g === '7') { resultado -= s; continue }
    if (s === 0) continue
    if (g === '8' || g === '9') { suma(pas, 'A.II', -s); continue } // fuera del alcance abreviado
    const ra = rubricaDe(cuenta, ACTIVO, '')
    const rp = rubricaDe(cuenta, PASIVO, '')
    // Rúbrica natural: la del prefijo MÁS LARGO entre ambas tablas.
    const lenA = ra ? Math.max(...ACTIVO.filter(([p, c]) => cuenta.startsWith(p) && c === ra).map(([p]) => p.length)) : 0
    const lenP = rp ? Math.max(...PASIVO.filter(([p, c]) => cuenta.startsWith(p) && c === rp).map(([p]) => p.length)) : 0
    const naturalActivo = lenA > lenP
    const netea = /^(28|29|10|11|12)/.test(cuenta) // amortizaciones y patrimonio netean con su propio signo
    if (naturalActivo) {
      if (s > 0 || netea) suma(act, ra, s)
      else suma(pas, 'C.IV', -s)
    } else if (lenP > 0) {
      if (s < 0 || netea) suma(pas, rp, -s)
      else suma(act, 'B.V', s)
    } else if (s > 0) suma(act, 'B.V', s)
    else suma(pas, 'C.IV', -s)
  }
  suma(pas, 'A.IV', resultado)
  const aRubricas = (mp: Map<string, Centimos>, et: Record<string, string>): Rubrica[] =>
    Object.keys(et).filter(k => mp.has(k) && mp.get(k) !== 0).map(k => ({ clave: k, etiqueta: et[k], importe: mp.get(k)! }))
  const activo = aRubricas(act, ETIQ_ACTIVO)
  const patrimonioNetoYPasivo = aRubricas(pas, ETIQ_PASIVO)
  const totalActivo = activo.reduce((t, r) => t + r.importe, 0)
  const totalPatrimonioNetoYPasivo = patrimonioNetoYPasivo.reduce((t, r) => t + r.importe, 0)
  return { activo, patrimonioNetoYPasivo, totalActivo, totalPatrimonioNetoYPasivo, resultadoEjercicio: resultado, cuadra: totalActivo === totalPatrimonioNetoYPasivo }
}

const PYG: readonly (readonly [string, string])[] = [
  ['70', '1'], ['71', '5'], ['73', '5'], ['74', '5'], ['75', '5'],
  ['60', '4'], ['61', '4'],
  ['64', '6'], ['62', '7'], ['63', '7'], ['630', '14'], ['633', '14'], ['634', '14'], ['638', '14'], ['65', '7'], ['67', '7'],
  ['68', '8'], ['66', '12'], ['76', '11'],
]
const ETIQ_PYG: Record<string, string> = {
  '1': '1. Importe neto de la cifra de negocios',
  '4': '4. Aprovisionamientos',
  '5': '5. Otros ingresos de explotación',
  '6': '6. Gastos de personal',
  '7': '7. Otros gastos de explotación',
  '8': '8. Amortización del inmovilizado',
  '11': '11. Ingresos financieros',
  '12': '12. Gastos financieros',
  '14': '14. Impuestos sobre beneficios',
}

export interface CuentaPyG {
  lineas: Rubrica[]
  resultadoExplotacion: Centimos
  resultadoFinanciero: Centimos
  resultadoAntesImpuestos: Centimos
  resultadoEjercicio: Centimos
}

/** Cuenta de pérdidas y ganancias abreviada. Ingresos en positivo, gastos en negativo. */
export function cuentaPyG(asientos: readonly Asiento[], periodo?: Periodo): CuentaPyG {
  const m = acumular(asientos, periodo)
  const por = new Map<string, Centimos>()
  for (const [cuenta, v] of m) {
    if (cuenta[0] !== '6' && cuenta[0] !== '7') continue
    const k = rubricaDe(cuenta, PYG, cuenta[0] === '6' ? '7' : '5')
    por.set(k, (por.get(k) ?? 0) + (v.haber - v.debe))
  }
  const g = (k: string) => por.get(k) ?? 0
  const resultadoExplotacion = g('1') + g('4') + g('5') + g('6') + g('7') + g('8')
  const resultadoFinanciero = g('11') + g('12')
  const resultadoAntesImpuestos = resultadoExplotacion + resultadoFinanciero
  const lineas: Rubrica[] = Object.keys(ETIQ_PYG)
    .sort((a, b) => Number(a) - Number(b))
    .filter(k => g(k) !== 0)
    .map(k => ({ clave: k, etiqueta: ETIQ_PYG[k], importe: g(k) }))
  return { lineas, resultadoExplotacion, resultadoFinanciero, resultadoAntesImpuestos, resultadoEjercicio: resultadoAntesImpuestos + g('14') }
}

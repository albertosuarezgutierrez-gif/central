// F5 — Cuentas anuales ABREVIADAS (modelo PGC pymes): balance y cuenta de pérdidas y ganancias desde SALDOS, y memoria como BORRADOR de texto.
// PURO, céntimos enteros. Convención de saldo: debe − haber.
//
// ⚠️ La numeración y composición de las rúbricas es la del modelo abreviado recordada, PENDIENTE DE CONTRASTAR con el modelo oficial vigente
// (`MODELO_PENDIENTE_DE_CONTRASTAR`). El mapa cuenta → rúbrica es DATO (tablas al principio), no lógica.
// «Dato que no hay ≠ cero»: la columna del ejercicio anterior es `null` cuando no se aportaron saldos anteriores; nunca 0 por defecto.
import { ErrorContable, formatearCentimos, type Centimos } from '../partida/dinero.ts'
import { SEMILLA_PGC_PYMES } from '../partida/plan.ts'
import type { SaldoCuenta } from './cierre.ts'

export const MODELO_PENDIENTE_DE_CONTRASTAR = 'numeración y composición de rúbricas pendientes de contrastar con el modelo abreviado oficial vigente'

export type LineaCuentaAnual = {
  clave: string
  etiqueta: string
  nivel: 0 | 1 | 2
  importe: Centimos
  /** Ejercicio anterior; `null` = no se aportaron saldos del ejercicio anterior (no es un 0). */
  anterior: Centimos | null
}

// ── Balance ──────────────────────────────────────────────────────────────────────────────────────────────────
type Lado = 'A' | 'P'
const ACTIVO_TABLA: readonly (readonly [string, string])[] = [
  ['20', 'A.I'], ['280', 'A.I'], ['290', 'A.I'],
  ['21', 'A.II'], ['281', 'A.II'], ['291', 'A.II'],
  ['22', 'A.III'], ['282', 'A.III'], ['292', 'A.III'],
  ['24', 'A.IV'], ['25', 'A.V'], ['26', 'A.V'], ['474', 'A.VI'],
  ['3', 'B.I'], ['407', 'B.I'],
  ['43', 'B.II'], ['44', 'B.II'], ['460', 'B.II'], ['47', 'B.II'], ['4709', 'B.II'],
  ['53', 'B.III'], ['54', 'B.IV'], ['55', 'B.IV'], ['480', 'B.V'], ['57', 'B.VI'],
]
const PASIVO_TABLA: readonly (readonly [string, string])[] = [
  ['10', 'PN.I'], ['110', 'PN.II'],
  ['11', 'PN.III'], ['118', 'PN.VI'], ['119', 'PN.VI'], ['12', 'PN.V'], ['129', 'PN.V'], ['13', 'PN.A3'],
  ['14', 'PNC.I'], ['17', 'PNC.II'], ['18', 'PNC.V'], ['479', 'PNC.IV'],
  ['499', 'PC.II'], ['529', 'PC.II'], ['52', 'PC.III'], ['555', 'PC.III'],
  ['40', 'PC.V'], ['41', 'PC.V'], ['438', 'PC.V'], ['465', 'PC.V'], ['475', 'PC.V'], ['476', 'PC.V'], ['477', 'PC.V'], ['485', 'PC.VI'],
]
const NETEA = /^(28|29|103|104|108|109|121|129|198|199)/
const ETIQ_ACTIVO: Record<string, string> = {
  'A.I': 'I. Inmovilizado intangible', 'A.II': 'II. Inmovilizado material', 'A.III': 'III. Inversiones inmobiliarias', 'A.IV': 'IV. Inversiones en empresas del grupo y asociadas a largo plazo',
  'A.V': 'V. Inversiones financieras a largo plazo', 'A.VI': 'VI. Activos por impuesto diferido',
  'B.I': 'I. Existencias', 'B.II': 'II. Deudores comerciales y otras cuentas a cobrar', 'B.III': 'III. Inversiones en empresas del grupo y asociadas a corto plazo',
  'B.IV': 'IV. Inversiones financieras a corto plazo', 'B.V': 'V. Periodificaciones a corto plazo', 'B.VI': 'VI. Efectivo y otros activos líquidos equivalentes',
  'X.A': 'Otras partidas de activo (sin rúbrica asignada)',
}
const ETIQ_PASIVO: Record<string, string> = {
  'PN.I': 'I. Capital', 'PN.II': 'II. Prima de emisión', 'PN.III': 'III. Reservas', 'PN.V': 'V. Resultados de ejercicios anteriores (incl. resultado pendiente de aplicar)',
  'PN.VI': 'VI. Otras aportaciones de socios', 'PN.VII': 'VII. Resultado del ejercicio', 'PN.A3': 'A-3) Subvenciones, donaciones y legados recibidos',
  'PNC.I': 'I. Provisiones a largo plazo', 'PNC.II': 'II. Deudas a largo plazo', 'PNC.IV': 'IV. Pasivos por impuesto diferido', 'PNC.V': 'V. Periodificaciones a largo plazo',
  'PC.II': 'II. Provisiones a corto plazo', 'PC.III': 'III. Deudas a corto plazo', 'PC.V': 'V. Acreedores comerciales y otras cuentas a pagar', 'PC.VI': 'VI. Periodificaciones a corto plazo',
  'X.P': 'Otras partidas de pasivo (sin rúbrica asignada)',
}
const ORDEN_ACTIVO = ['A.I', 'A.II', 'A.III', 'A.IV', 'A.V', 'A.VI', 'B.I', 'B.II', 'B.III', 'B.IV', 'B.V', 'B.VI', 'X.A']
const ORDEN_PASIVO = ['PN.I', 'PN.II', 'PN.III', 'PN.V', 'PN.VI', 'PN.VII', 'PN.A3', 'PNC.I', 'PNC.II', 'PNC.IV', 'PNC.V', 'PC.II', 'PC.III', 'PC.V', 'PC.VI', 'X.P']

function claveDe(cuenta: string, tabla: readonly (readonly [string, string])[]): { clave: string; len: number } | null {
  let mejor = -1
  let clave = ''
  for (const [pref, c] of tabla) if (cuenta.startsWith(pref) && pref.length > mejor) { mejor = pref.length; clave = c }
  return mejor < 0 ? null : { clave, len: mejor }
}

type AcumBalance = { activo: Map<string, Centimos>; pasivo: Map<string, Centimos>; sinClasificar: string[]; resultado: Centimos }

function acumularBalance(saldos: readonly SaldoCuenta[]): AcumBalance {
  const activo = new Map<string, Centimos>()
  const pasivo = new Map<string, Centimos>()
  const sinClasificar: string[] = []
  let resultado = 0
  const suma = (m: Map<string, Centimos>, k: string, v: Centimos) => m.set(k, (m.get(k) ?? 0) + v)
  for (const s of saldos) {
    const saldo = s.debe - s.haber
    const g = s.cuenta[0]
    if (g === '6' || g === '7') { resultado -= saldo; continue }
    if (saldo === 0) continue
    const a = claveDe(s.cuenta, ACTIVO_TABLA)
    const p = claveDe(s.cuenta, PASIVO_TABLA)
    if (!a && !p) { sinClasificar.push(s.cuenta); if (saldo > 0) suma(activo, 'X.A', saldo); else suma(pasivo, 'X.P', -saldo); continue }
    const naturalActivo = a !== null && (p === null || a.len >= p.len)
    const netea = NETEA.test(s.cuenta)
    if (naturalActivo) {
      if (saldo > 0 || netea) suma(activo, a!.clave, saldo)
      else suma(pasivo, s.cuenta.startsWith('57') ? 'PC.III' : 'PC.V', -saldo) // saldo acreedor en cuenta de activo → pasivo
    } else if (saldo < 0 || netea) suma(pasivo, p!.clave, -saldo)
    else suma(activo, 'B.II', saldo) // saldo deudor en cuenta de pasivo (anticipos a proveedores…) → activo
  }
  suma(pasivo, 'PN.VII', resultado)
  return { activo, pasivo, sinClasificar, resultado }
}

export type BalanceAbreviado = {
  fecha: string
  activo: LineaCuentaAnual[]
  patrimonioNetoYPasivo: LineaCuentaAnual[]
  totalActivo: Centimos
  totalPatrimonioNetoYPasivo: Centimos
  totalActivoAnterior: Centimos | null
  totalPatrimonioNetoYPasivoAnterior: Centimos | null
  resultadoEjercicio: Centimos
  /** Activo = Pasivo + Patrimonio neto. */
  cuadra: boolean
  avisos: string[]
}

const sec = (clave: string, etiqueta: string, importe: Centimos, anterior: Centimos | null, nivel: 0 | 1 = 1): LineaCuentaAnual => ({ clave, etiqueta, nivel, importe, anterior })

function seccion(orden: readonly string[], etiq: Record<string, string>, m: Map<string, Centimos>, ma: Map<string, Centimos> | null, grupos: readonly (readonly [string, string, (k: string) => boolean])[]): LineaCuentaAnual[] {
  const out: LineaCuentaAnual[] = []
  for (const [clave, etiqueta, pertenece] of grupos) {
    const claves = orden.filter((k) => pertenece(k))
    const importe = claves.reduce((t, k) => t + (m.get(k) ?? 0), 0)
    const anterior = ma ? claves.reduce((t, k) => t + (ma.get(k) ?? 0), 0) : null
    const hijas = claves.filter((k) => (m.get(k) ?? 0) !== 0 || (ma?.get(k) ?? 0) !== 0)
    if (!hijas.length && importe === 0 && (anterior ?? 0) === 0) continue
    out.push(sec(clave, etiqueta, importe, anterior))
    for (const k of hijas) out.push({ clave: k, etiqueta: etiq[k], nivel: 2, importe: m.get(k) ?? 0, anterior: ma ? (ma.get(k) ?? 0) : null })
  }
  return out
}

/**
 * Balance abreviado a `fecha` desde saldos de las cuentas. `saldosAnterior` (opcional) rellena la columna del ejercicio anterior; sin él, `anterior` = null.
 * El resultado del ejercicio es el saldo de los grupos 6 y 7 SIN regularizar: pasa los saldos de `asientosParaCuentasAnuales(...)`.
 */
export function balanceAbreviado(saldos: readonly SaldoCuenta[], fecha: string, saldosAnterior?: readonly SaldoCuenta[]): BalanceAbreviado {
  const cur = acumularBalance(saldos)
  const ant = saldosAnterior ? acumularBalance(saldosAnterior) : null
  const act = seccion(ORDEN_ACTIVO, ETIQ_ACTIVO, cur.activo, ant?.activo ?? null, [
    ['A', 'A) ACTIVO NO CORRIENTE', (k) => k.startsWith('A.')],
    ['B', 'B) ACTIVO CORRIENTE', (k) => k.startsWith('B.')],
    ['X', 'Otras partidas de activo', (k) => k === 'X.A'],
  ])
  const pas = seccion(ORDEN_PASIVO, ETIQ_PASIVO, cur.pasivo, ant?.pasivo ?? null, [
    ['PN', 'A) PATRIMONIO NETO', (k) => k.startsWith('PN.')],
    ['PNC', 'B) PASIVO NO CORRIENTE', (k) => k.startsWith('PNC.')],
    ['PC', 'C) PASIVO CORRIENTE', (k) => k.startsWith('PC.')],
    ['XP', 'Otras partidas de pasivo', (k) => k === 'X.P'],
  ])
  const total = (m: Map<string, Centimos>) => [...m.values()].reduce((t, v) => t + v, 0)
  const totalActivo = total(cur.activo)
  const totalPNP = total(cur.pasivo)
  const avisos: string[] = [MODELO_PENDIENTE_DE_CONTRASTAR]
  if (cur.sinClasificar.length) avisos.push(`Cuentas sin rúbrica asignada (grupos 8-9 o fuera del plan): ${cur.sinClasificar.join(', ')}`)
  if (!ant) avisos.push('Sin saldos del ejercicio anterior: la columna comparativa queda vacía (pendiente de aportar).')
  if (totalActivo !== totalPNP) avisos.push(`El balance no cuadra: activo ${formatearCentimos(totalActivo)} ≠ patrimonio neto y pasivo ${formatearCentimos(totalPNP)}`)
  return {
    fecha, activo: act, patrimonioNetoYPasivo: pas, totalActivo, totalPatrimonioNetoYPasivo: totalPNP,
    totalActivoAnterior: ant ? total(ant.activo) : null, totalPatrimonioNetoYPasivoAnterior: ant ? total(ant.pasivo) : null,
    resultadoEjercicio: cur.resultado, cuadra: totalActivo === totalPNP, avisos,
  }
}

// ── Pérdidas y ganancias ─────────────────────────────────────────────────────────────────────────────────────
const PYG_TABLA: readonly (readonly [string, string])[] = [
  ['70', '1'], ['71', '2'], ['73', '3'], ['60', '4'], ['61', '4'], ['74', '5'], ['75', '5'], ['746', '9'], ['747', '9'],
  ['64', '6'], ['62', '7'], ['63', '7'], ['630', '17'], ['633', '17'], ['634', '17'], ['638', '17'], ['65', '7'], ['69', '11'], ['79', '11'],
  ['68', '8'], ['67', '11'], ['77', '11'], ['678', '12'], ['778', '12'],
  ['76', '13'], ['66', '14'], ['668', '15'], ['768', '15'], ['696', '16'], ['796', '16'],
]
const ETIQ_PYG: Record<string, string> = {
  '1': '1. Importe neto de la cifra de negocios', '2': '2. Variación de existencias de productos terminados y en curso', '3': '3. Trabajos realizados por la empresa para su activo',
  '4': '4. Aprovisionamientos', '5': '5. Otros ingresos de explotación', '6': '6. Gastos de personal', '7': '7. Otros gastos de explotación', '8': '8. Amortización del inmovilizado',
  '9': '9. Imputación de subvenciones de inmovilizado no financiero y otras', '11': '11. Deterioro y resultado por enajenaciones del inmovilizado', '12': '12. Otros resultados',
  '13': '13. Ingresos financieros', '14': '14. Gastos financieros', '15': '15. Diferencias de cambio', '16': '16. Deterioro y resultado por enajenaciones de instrumentos financieros',
  '17': '17. Impuestos sobre beneficios',
}
const ORDEN_EXPLOTACION = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '12']
const ORDEN_FINANCIERO = ['13', '14', '15', '16']

function acumularPyG(saldos: readonly SaldoCuenta[]): Map<string, Centimos> {
  const por = new Map<string, Centimos>()
  for (const s of saldos) {
    const g = s.cuenta[0]
    if (g !== '6' && g !== '7') continue
    const c = claveDe(s.cuenta, PYG_TABLA)
    const k = c?.clave ?? (g === '6' ? '7' : '5')
    por.set(k, (por.get(k) ?? 0) + (s.haber - s.debe))
  }
  return por
}

export type PyGAbreviada = {
  desde: string
  hasta: string
  lineas: LineaCuentaAnual[]
  resultadoExplotacion: Centimos
  resultadoFinanciero: Centimos
  resultadoAntesImpuestos: Centimos
  resultadoEjercicio: Centimos
  resultadoEjercicioAnterior: Centimos | null
  avisos: string[]
}

/** Cuenta de pérdidas y ganancias abreviada (ingresos +, gastos −). Pasa saldos SIN regularizar (`asientosParaCuentasAnuales`). */
export function pygAbreviada(saldos: readonly SaldoCuenta[], periodo: { desde: string; hasta: string }, saldosAnterior?: readonly SaldoCuenta[]): PyGAbreviada {
  const cur = acumularPyG(saldos)
  const ant = saldosAnterior ? acumularPyG(saldosAnterior) : null
  const g = (m: Map<string, Centimos> | null, ks: readonly string[]) => (m ? ks.reduce((t, k) => t + (m.get(k) ?? 0), 0) : null)
  const linea = (k: string): LineaCuentaAnual[] => {
    const a = cur.get(k) ?? 0
    const b = ant ? (ant.get(k) ?? 0) : null
    return a === 0 && (b ?? 0) === 0 ? [] : [{ clave: k, etiqueta: ETIQ_PYG[k], nivel: 2, importe: a, anterior: b }]
  }
  const expl = g(cur, ORDEN_EXPLOTACION)!
  const fin = g(cur, ORDEN_FINANCIERO)!
  const antes = expl + fin
  const imp = cur.get('17') ?? 0
  const e2 = g(ant, ORDEN_EXPLOTACION)
  const f2 = g(ant, ORDEN_FINANCIERO)
  const a2 = e2 === null || f2 === null ? null : e2 + f2
  const i2 = ant ? (ant.get('17') ?? 0) : null
  const lineas: LineaCuentaAnual[] = [
    ...ORDEN_EXPLOTACION.flatMap(linea),
    sec('A', 'A) RESULTADO DE EXPLOTACIÓN', expl, e2, 0),
    ...ORDEN_FINANCIERO.flatMap(linea),
    sec('B', 'B) RESULTADO FINANCIERO', fin, f2, 0),
    sec('C', 'C) RESULTADO ANTES DE IMPUESTOS', antes, a2, 0),
    ...linea('17'),
    sec('D', 'D) RESULTADO DEL EJERCICIO', antes + imp, a2 === null || i2 === null ? null : a2 + i2, 0),
  ]
  const avisos = [MODELO_PENDIENTE_DE_CONTRASTAR]
  if (!ant) avisos.push('Sin saldos del ejercicio anterior: la columna comparativa queda vacía (pendiente de aportar).')
  return {
    desde: periodo.desde, hasta: periodo.hasta, lineas, resultadoExplotacion: expl, resultadoFinanciero: fin, resultadoAntesImpuestos: antes,
    resultadoEjercicio: antes + imp, resultadoEjercicioAnterior: a2 === null || i2 === null ? null : a2 + i2, avisos,
  }
}

// ── Memoria (borrador de texto con datos) ────────────────────────────────────────────────────────────────────
const NOMBRE_CUENTA: Record<string, string> = Object.fromEntries(SEMILLA_PGC_PYMES.map(([c, n]) => [c, n]))

export type DatosMemoria = {
  empresa: { razonSocial: string; nif: string }
  anio: number
  /** Texto libre de la actividad; `null` = pendiente de completar. */
  actividad: string | null
  balance: BalanceAbreviado
  pyg: PyGAbreviada
  /** Inmovilizado: movimientos del ejercicio. `null` = no se ha calculado (no es «sin movimientos»). */
  inmovilizado: { categoria: string; saldoInicial: Centimos; altas: Centimos; bajas: Centimos; saldoFinal: Centimos; amortizacionAcumulada: Centimos; porcentajePb: number }[] | null
  /** Nº medio de empleados. `null` = no informado. */
  empleadosMedios: number | null
  /** Ejercicio abierto o cerrado, para el aviso. */
  ejercicioCerrado: boolean
}

export type SeccionMemoria = { titulo: string; texto: string }
export type MemoriaBorrador = { titulo: string; secciones: SeccionMemoria[]; pendientes: string[] }

const PENDIENTE = '[PENDIENTE DE COMPLETAR]'

/** Borrador de la memoria abreviada: texto con los datos que hay y marcas explícitas donde falta un dato. NO sustituye a la memoria firmada. */
export function memoriaBorrador(d: DatosMemoria): MemoriaBorrador {
  const pendientes: string[] = []
  const falta = (que: string) => { pendientes.push(que); return PENDIENTE }
  const e = formatearCentimos
  const secciones: SeccionMemoria[] = []
  secciones.push({
    titulo: '1. Actividad de la empresa',
    texto: `${d.empresa.razonSocial} (NIF ${d.empresa.nif}). Actividad: ${d.actividad?.trim() ? d.actividad.trim() : falta('Actividad de la empresa')}.`,
  })
  secciones.push({
    titulo: '2. Bases de presentación de las cuentas anuales',
    texto: `Las cuentas anuales del ejercicio ${d.anio} se presentan según el modelo abreviado del Plan General de Contabilidad de PYMES y se han formulado a partir de los registros contables. ${d.balance.cuadra ? 'El balance cuadra' : 'ATENCIÓN: el balance no cuadra'}. Comparación con el ejercicio anterior: ${d.balance.totalActivoAnterior === null ? falta('Saldos del ejercicio anterior') : 'incluida en las columnas comparativas'}.`,
  })
  secciones.push({
    titulo: '3. Aplicación de resultados',
    texto: `Resultado del ejercicio: ${e(d.pyg.resultadoEjercicio)} (${d.pyg.resultadoEjercicio >= 0 ? 'beneficio' : 'pérdida'}). Propuesta de aplicación: ${falta('Propuesta de aplicación del resultado (la acuerda la junta)')}.`,
  })
  const normas: string[] = ['Inmovilizado material e intangible: valorado a precio de adquisición y amortizado de forma lineal según su vida útil.']
  secciones.push({ titulo: '4. Normas de registro y valoración', texto: normas.join(' ') })
  if (d.inmovilizado === null) {
    secciones.push({ titulo: '5. Inmovilizado', texto: falta('Movimientos del inmovilizado (no se han calculado)') })
  } else if (!d.inmovilizado.length) {
    secciones.push({ titulo: '5. Inmovilizado', texto: 'No hay fichas de inmovilizado registradas en el ejercicio.' })
  } else {
    const filas = d.inmovilizado.map((f) => `- ${f.categoria}: saldo inicial ${e(f.saldoInicial)}, altas ${e(f.altas)}, bajas ${e(f.bajas)}, saldo final ${e(f.saldoFinal)}; amortización acumulada ${e(f.amortizacionAcumulada)} (coeficiente ${f.porcentajePb / 100} %).`)
    secciones.push({ titulo: '5. Inmovilizado', texto: filas.join('\n') })
  }
  secciones.push({
    titulo: '6. Empleados',
    texto: `Número medio de empleados: ${d.empleadosMedios === null ? falta('Número medio de empleados') : String(d.empleadosMedios)}.`,
  })
  secciones.push({ titulo: '7. Hechos posteriores al cierre', texto: falta('Hechos posteriores al cierre') })
  secciones.push({ titulo: '8. Operaciones con partes vinculadas', texto: falta('Operaciones con partes vinculadas') })
  secciones.push({ titulo: '9. Otra información', texto: `${falta('Otra información (garantías, honorarios de auditoría, medio ambiente…)')} ${d.ejercicioCerrado ? '' : 'El ejercicio sigue ABIERTO: las cifras pueden cambiar.'}`.trim() })
  return { titulo: `Memoria abreviada ${d.anio} — BORRADOR`, secciones, pendientes }
}

export const nombreDeCuenta = (c: string): string => NOMBRE_CUENTA[c] ?? '—'

/** Texto plano de la memoria. */
export function memoriaATexto(m: MemoriaBorrador): string {
  return [m.titulo, '', ...m.secciones.flatMap((s) => [s.titulo, s.texto, '']), ...(m.pendientes.length ? ['Pendiente de completar:', ...m.pendientes.map((p) => `- ${p}`)] : [])].join('\n')
}

export function exigirAnioValido(anio: number): void {
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2200) throw new ErrorContable('anio_invalido', `ejercicio inválido: ${String(anio)}`)
}

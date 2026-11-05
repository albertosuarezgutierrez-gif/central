// Modelo 347 (operaciones con terceros > 3.005,06 €), 349 (operaciones intracomunitarias) y 130 (pago fraccionado IRPF, autónomos).
// PURO, BORRADOR REVISABLE. Diseño de registro oficial (BOE, longitud fija) PENDIENTE de contrastar: no se genera fichero.
import { porcentajeDe, type Centimos } from '../partida/dinero.ts'
import type { Asiento } from '../partida/asiento.ts'
import { casilla, enRango, nifNormalizado, rangoDeModelo, sumar, trimestreDe, DISENO_OFICIAL_PENDIENTE, validarEjercicio, type CalculoModelo, type PeriodoModelo } from './comun.ts'
import { problemasOperacion, type OperacionIva } from './operaciones.ts'

// ── 347 ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Umbral del 347: se declaran los terceros cuyo total anual (IVA incluido) SUPERA 3.005,06 € [Probable: art. 33 RD 1065/2007; contrastar]. */
export const UMBRAL_347: Centimos = 300_506

export type Tercero347 = {
  nif: string
  nombre: string
  /** A = adquisiciones de bienes y servicios (recibidas) · B = entregas de bienes y prestaciones de servicios (emitidas). */
  clave: 'A' | 'B'
  /** Total anual, IVA incluido, neto de abonos. */
  total: Centimos
  /** Importe por trimestre natural (T1..T4); suman `total`. */
  trimestres: [Centimos, Centimos, Centimos, Centimos]
  refs: string[]
}
export type Modelo347 = CalculoModelo & {
  declarados: Tercero347[]
  /** Terceros que NO superan el umbral (no se declaran); solo recuento y suma, nunca la lista en el fichero. */
  bajoUmbral: { nif: string; clave: 'A' | 'B'; total: Centimos }[]
  sinNif: { ref: string; total: Centimos }[]
}

/**
 * 347 desde las operaciones de IVA: importe = base + cuota (IVA incluido), por NIF y clave (A/B), neto de rectificativas.
 * Se excluyen (se declaran por otra vía) las intracomunitarias (349), las importaciones, los arrendamientos con retención (115/180) y las
 * marcadas `excluir347`. Las exentas y las de inversión del sujeto pasivo SÍ se incluyen [Probable: contrastar con el asesor].
 * Los cobros en metálico > 6.000 € (bloque aparte del 347) NO se calculan: se avisa.
 */
export function calcularModelo347(ops: readonly OperacionIva[], anio: number): Modelo347 {
  validarEjercicio(anio)
  const rango = rangoDeModelo(anio, '0A')
  const avisos: string[] = ['Los cobros en metálico superiores a 6.000 € (bloque aparte del 347) no se calculan: revísalos a mano.']
  const excluidas: { ref: string; motivo: string }[] = []
  const por = new Map<string, Tercero347>()
  const sinNif: { ref: string; total: Centimos }[] = []
  for (const o of ops) {
    if (!enRango(o.fecha, rango)) continue
    const pr = problemasOperacion(o)
    if (pr.length) { excluidas.push({ ref: String(o.ref), motivo: pr.join('; ') }); continue }
    if (o.clase === 'intracom_bienes' || o.clase === 'intracom_servicios') { excluidas.push({ ref: o.ref, motivo: 'intracomunitaria: va al 349' }); continue }
    if (o.clase === 'importacion') { excluidas.push({ ref: o.ref, motivo: 'importación: no entra en el 347' }); continue }
    if (o.alquilerConRetencion) { excluidas.push({ ref: o.ref, motivo: 'arrendamiento con retención: va al 115/180' }); continue }
    if (o.excluir347) { excluidas.push({ ref: o.ref, motivo: 'excluida manualmente del 347' }); continue }
    const importe = o.base + o.cuota
    const nif = nifNormalizado(o.tercero.nif)
    if (!nif) { sinNif.push({ ref: o.ref, total: importe }); continue }
    const clave = o.sentido === 'recibida' ? 'A' : 'B'
    const k = `${nif}|${clave}`
    const x = por.get(k) ?? { nif, nombre: o.tercero.nombre, clave, total: 0, trimestres: [0, 0, 0, 0] as [number, number, number, number], refs: [] }
    x.total += importe
    x.trimestres[trimestreDe(o.fecha) - 1] += importe
    x.refs.push(o.ref)
    por.set(k, x)
  }
  const todos = [...por.values()].sort((a, b) => (a.clave === b.clave ? (a.nif < b.nif ? -1 : 1) : a.clave < b.clave ? -1 : 1))
  // Estrictamente MAYOR que el umbral: 3.005,06 € justos no se declara.
  const declarados = todos.filter((t) => t.total > UMBRAL_347)
  const bajoUmbral = todos.filter((t) => t.total <= UMBRAL_347).map((t) => ({ nif: t.nif, clave: t.clave, total: t.total }))
  if (sinNif.length) avisos.push(`${sinNif.length} operación(es) sin NIF del tercero (${sinNif.reduce((t, s) => t + s.total, 0)} céntimos): no se pueden asignar y podrían superar el umbral`)
  if (declarados.length === 0) avisos.push('Sin datos: ningún tercero supera el umbral de 3.005,06 €')
  const cs = [
    casilla('N', 'Número de terceros declarados', declarados.length, declarados.flatMap((t) => t.refs), 'media', 'numero'),
    casilla('A', 'Total adquisiciones de bienes y servicios (clave A)', sumar(declarados.filter((t) => t.clave === 'A').map((t) => t.total)), declarados.filter((t) => t.clave === 'A').flatMap((t) => t.refs), 'media'),
    casilla('B', 'Total entregas de bienes y prestaciones de servicios (clave B)', sumar(declarados.filter((t) => t.clave === 'B').map((t) => t.total)), declarados.filter((t) => t.clave === 'B').flatMap((t) => t.refs), 'media'),
  ]
  return { modelo: '347', anio, periodo: '0A', casillas: cs, resultado: null, noSoportado: [], avisos, excluidas, ficheroOficial: DISENO_OFICIAL_PENDIENTE, declarados, bajoUmbral, sinNif }
}

// ── 349 ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Claves del 349: E entregas · A adquisiciones · T triangulares · S prestaciones de servicios · I adquisiciones de servicios. */
export type Clave349 = 'E' | 'A' | 'T' | 'S' | 'I'
export type Operador349 = { nifIva: string; nombre: string; clave: Clave349; base: Centimos; refs: string[] }
export type Modelo349 = CalculoModelo & { operadores: Operador349[]; periodicidad: 'T' | 'M'; totales: Record<Clave349, Centimos> }

/** Umbral de entregas intracomunitarias para pasar de presentación trimestral a mensual: 50.000 € en el trimestre o en alguno de los 4 anteriores [Probable]. */
export const UMBRAL_349_MENSUAL: Centimos = 5_000_000
export function periodicidad349(entregasPorTrimestre: readonly Centimos[]): 'T' | 'M' {
  return entregasPorTrimestre.some((e) => e > UMBRAL_349_MENSUAL) ? 'M' : 'T'
}

export function calcularModelo349(ops: readonly OperacionIva[], p: { anio: number; trimestre: 1 | 2 | 3 | 4 }): Modelo349 {
  validarEjercicio(p.anio)
  const periodo = `${p.trimestre}T` as PeriodoModelo
  const rango = rangoDeModelo(p.anio, periodo)
  const excluidas: { ref: string; motivo: string }[] = []
  const avisos: string[] = []
  const noSoportado: string[] = []
  const m = new Map<string, Operador349>()
  for (const o of ops) {
    if (!enRango(o.fecha, rango)) continue
    if (o.clase !== 'intracom_bienes' && o.clase !== 'intracom_servicios') continue
    const pr = problemasOperacion(o)
    if (pr.length) { excluidas.push({ ref: String(o.ref), motivo: pr.join('; ') }); continue }
    if (o.rectificativa || o.base < 0) { noSoportado.push(`${o.ref}: rectificaciones del 349 (declaradas en su bloque aparte) no soportadas`); excluidas.push({ ref: o.ref, motivo: 'rectificación no soportada' }); continue }
    const nif = nifNormalizado(o.tercero.nif)
    if (!nif) { excluidas.push({ ref: o.ref, motivo: 'operador sin NIF-IVA' }); avisos.push(`${o.ref}: operador intracomunitario sin NIF-IVA, no se puede declarar`); continue }
    if (!/^[A-Z]{2}/.test(nif)) avisos.push(`${nif}: el NIF-IVA comunitario debe llevar el prefijo de país`)
    const clave: Clave349 = o.sentido === 'emitida'
      ? (o.clase === 'intracom_servicios' ? 'S' : 'E')
      : (o.clase === 'intracom_servicios' ? 'I' : (o.triangular ? 'T' : 'A'))
    const k = `${nif}|${clave}`
    const x = m.get(k) ?? { nifIva: nif, nombre: o.tercero.nombre, clave, base: 0, refs: [] }
    x.base += o.base; x.refs.push(o.ref)
    m.set(k, x)
  }
  const operadores = [...m.values()].sort((a, b) => (a.clave === b.clave ? (a.nifIva < b.nifIva ? -1 : 1) : a.clave < b.clave ? -1 : 1))
  const totales: Record<Clave349, Centimos> = { E: 0, A: 0, T: 0, S: 0, I: 0 }
  for (const o of operadores) totales[o.clave] += o.base
  if (operadores.length === 0) avisos.push('Sin datos: no hay operaciones intracomunitarias en el periodo')
  const cs = (['E', 'A', 'T', 'S', 'I'] as const).map((k) => casilla(k, `Total clave ${k}`, totales[k], operadores.filter((o) => o.clave === k).flatMap((o) => o.refs), 'media'))
  return {
    modelo: '349', anio: p.anio, periodo, casillas: cs, resultado: null, noSoportado: [...new Set(noSoportado)], avisos, excluidas,
    ficheroOficial: DISENO_OFICIAL_PENDIENTE, operadores, periodicidad: periodicidad349([sumar(operadores.filter((o) => o.clave === 'E' || o.clave === 'S').map((o) => o.base))]), totales,
  }
}

// ── 130 ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export type AcumuladoRendimiento = {
  /** Ingresos íntegros del año hasta el fin del trimestre (acumulado). */
  ingresos: Centimos
  /** Gastos deducibles del año hasta el fin del trimestre (acumulado). */
  gastos: Centimos
  /** Retenciones e ingresos a cuenta soportados en el año hasta el fin del trimestre (acumulado). */
  retenciones: Centimos
  /** Pagos fraccionados YA ingresados en los trimestres anteriores del año (130 positivos). */
  pagosAnteriores: Centimos
  refsIngresos?: readonly string[]
  refsGastos?: readonly string[]
  refsRetenciones?: readonly string[]
}

/**
 * 130 (estimación directa NORMAL): 20 % del rendimiento neto ACUMULADO del año (si es positivo) − pagos fraccionados anteriores − retenciones.
 *   01 ingresos · 02 gastos · 03 rendimiento neto = 01 − 02 · 04 = 20 % de 03 (0 si 03 ≤ 0) · 05 pagos anteriores · 06 retenciones
 *   07 = 04 − 05 − 06 · resultado a ingresar = máx(0, 07 − minoración)   (todas 'media': contrastar con el formulario vigente)
 * NO soportado: estimación directa simplificada (5 % de difícil justificación), minoración por rendimientos netos bajos (art. 110.3.c RIRPF),
 * deducción por vivienda habitual antigua y estimación objetiva (131). Si se piden, `noSoportado` y resultado null.
 * El 130 NO genera asiento de contabilidad: es un impuesto personal del titular, no de la actividad.
 */
export function calcularModelo130(a: AcumuladoRendimiento, p: { anio: number; trimestre: 1 | 2 | 3 | 4; estimacion?: 'directa_normal' | 'directa_simplificada' | 'objetiva'; minoracion110?: boolean }): CalculoModelo {
  validarEjercicio(p.anio)
  for (const [k, v] of Object.entries({ ingresos: a.ingresos, gastos: a.gastos, retenciones: a.retenciones, pagosAnteriores: a.pagosAnteriores })) {
    if (!Number.isSafeInteger(v) || v < 0) throw new RangeError(`${k}: entero ≥ 0 en céntimos`)
  }
  const noSoportado: string[] = []
  const est = p.estimacion ?? 'directa_normal'
  if (est === 'directa_simplificada') noSoportado.push('Estimación directa simplificada: el 5 % de gastos de difícil justificación no está soportado')
  if (est === 'objetiva') noSoportado.push('Estimación objetiva (modelo 131): no soportada')
  if (p.minoracion110) noSoportado.push('Minoración por rendimientos netos bajos (art. 110.3.c RIRPF): no soportada')
  const periodo = `${p.trimestre}T` as PeriodoModelo
  const neto = a.ingresos - a.gastos
  const veinte = neto > 0 ? porcentajeDe(neto, 20) : 0
  const previo = veinte - a.pagosAnteriores - a.retenciones
  const avisos: string[] = ['El 130 es un pago a cuenta del IRPF del titular: no genera asiento. Si más del 70 % de tus ingresos del año anterior tuvo retención, no estás obligado a presentarlo.']
  if (neto < 0) avisos.push('Rendimiento neto acumulado negativo: no hay pago fraccionado')
  if (previo < 0) avisos.push('Pagos anteriores y retenciones superan el 20 %: resultado 0 (el exceso no se devuelve en el 130, se regulariza en la renta)')
  const cs = [
    casilla('01', 'Ingresos íntegros acumulados', a.ingresos, a.refsIngresos ?? [], 'media'),
    casilla('02', 'Gastos fiscalmente deducibles acumulados', a.gastos, a.refsGastos ?? [], 'media'),
    casilla('03', 'Rendimiento neto (01 − 02)', neto, [...(a.refsIngresos ?? []), ...(a.refsGastos ?? [])], 'media'),
    casilla('04', '20 % del rendimiento neto (si positivo)', veinte, [], 'media'),
    casilla('05', 'Pagos fraccionados de trimestres anteriores', a.pagosAnteriores, [], 'media'),
    casilla('06', 'Retenciones e ingresos a cuenta soportados (acumulado)', a.retenciones, a.refsRetenciones ?? [], 'media'),
    casilla('07', 'Pago fraccionado previo (04 − 05 − 06)', previo, [], 'media'),
    casilla('19', 'Resultado a ingresar', Math.max(0, previo), [], 'media'),
  ]
  return { modelo: '130', anio: p.anio, periodo, casillas: cs, resultado: noSoportado.length ? null : Math.max(0, previo), noSoportado, avisos, excluidas: [], ficheroOficial: DISENO_OFICIAL_PENDIENTE }
}

/** ¿Está exento de presentar el 130? Si ≥ 70 % de los ingresos del año anterior sufrió retención/ingreso a cuenta [Probable: art. 109.1 RIRPF]. `null` = sin datos. */
export function exentoDe130(ingresosAnioAnterior: Centimos, conRetencionAnioAnterior: Centimos): boolean | null {
  if (!(ingresosAnioAnterior > 0)) return null
  return conRetencionAnioAnterior * 100 >= ingresosAnioAnterior * 70
}

/**
 * Acumulado del 130 desde los ASIENTOS del año: ingresos = haber − debe de los grupos 70-75 (ventas y otros ingresos de explotación),
 * gastos = debe − haber de los grupos 60-62, 64-65, 68 (explotación y amortización) [Probable: contrastar la composición con el asesor],
 * retenciones = debe − haber de 473. Cada cifra lista los asientos que mueven esas cuentas (trazabilidad).
 */
export function acumuladoDeAsientos(asientos: readonly Asiento[], p: { anio: number; trimestre: 1 | 2 | 3 | 4; pagosAnteriores: Centimos }): AcumuladoRendimiento {
  const rango = { desde: `${p.anio}-01-01`, hasta: rangoDeModelo(p.anio, `${p.trimestre}T` as PeriodoModelo).hasta }
  const esIngreso = (c: string) => /^7[0-5]/.test(c)
  const esGasto = (c: string) => /^(6[0-2]|64|65|68)/.test(c)
  const es473 = (c: string) => c.startsWith('473')
  let ingresos = 0, gastos = 0, retenciones = 0
  const ri = new Set<string>(), rg = new Set<string>(), rr = new Set<string>()
  for (const a of asientos) {
    if (!enRango(a.fecha, rango)) continue
    const ref = a.origen?.ref ?? (a.numero !== undefined ? `${a.numero}/${a.ejercicio}` : a.concepto)
    for (const ap of a.apuntes) {
      if (esIngreso(ap.cuenta)) { ingresos += ap.haber - ap.debe; ri.add(ref) }
      else if (esGasto(ap.cuenta)) { gastos += ap.debe - ap.haber; rg.add(ref) }
      else if (es473(ap.cuenta)) { retenciones += ap.debe - ap.haber; rr.add(ref) }
    }
  }
  return { ingresos: Math.max(0, ingresos), gastos: Math.max(0, gastos), retenciones: Math.max(0, retenciones), pagosAnteriores: p.pagosAnteriores, refsIngresos: [...ri].sort(), refsGastos: [...rg].sort(), refsRetenciones: [...rr].sort() }
}

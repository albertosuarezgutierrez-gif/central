// Retenciones e ingresos a cuenta: modelos 111 (trabajo/profesionales/premios…), 115 (alquileres), 190 y 180 (resúmenes anuales con perceptores).
// PURO, BORRADOR REVISABLE. Entrada GENÉRICA (`RetencionPracticada`): la alimentan hoy las compras con retención (profesionales, alquileres) y,
// después, NÓMINAS (`@central/module-nominas` / estudio 2026-11-05-modulo-nominas.md): basta con que emita una `RetencionPracticada`
// por empleado y mes con `concepto: 'trabajo'` (percepción íntegra, retención, NIF, clave de percepción, provincia). El 111 y el 190 de
// nóminas y de compras son por tanto el MISMO cálculo.
//
// Criterio temporal: las retenciones se declaran en el periodo en que se PAGA o abona la renta (`fecha` = fecha de pago/abono).
//
// MAPEO casilla → origen (todas 'media' salvo las marcadas; contrastar con el formulario vigente):
//   111: 01 nº perceptores · 02 importe percepciones · 03 retenciones   → trabajo dinerario        (alta)
//        04-06                                                          → trabajo en especie        (media)
//        07 · 08 · 09                                                   → actividades profesionales dinerario (alta)
//        10-12 especie profesionales · 13-15 premios dinerarios · 16-18 premios en especie
//        19-21 ganancias forestales dinerarias · 22-24 en especie · 25-27 contraprestaciones por cesión de derechos de imagen (media)
//        28 suma de retenciones e ingresos a cuenta = 03+06+09+12+15+18+21+24+27 (media)
//        29 resultados a ingresar de declaraciones anteriores negativos (parámetro) · 30 a deducir (complementaria, parámetro)
//        31 resultado a ingresar = 28 − 29 − 30 (media)
//   115: 01 nº perceptores · 02 base de las retenciones · 03 retenciones e ingresos a cuenta · 04 negativas anteriores · 05 a deducir · 06 resultado (media)
//   190: relación anual por perceptor (NIF, clave, subclave): percepciones y retenciones dinerarias y en especie; totales = suma de los 111.
//   180: relación anual por arrendador y inmueble (referencia catastral): base y retención; totales = suma de los 115.
// Fuente del diseño de registro 190 (pendiente de contrastar; sede no accesible desde el entorno):
//   https://www3.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_100_199/archivos_24/DISENOS_LOGICOS_190-2024.pdf
import type { Centimos } from '../partida/dinero.ts'
import { casilla, enRango, nifNormalizado, rangoDeModelo, sumar, DISENO_OFICIAL_PENDIENTE, validarEjercicio, type CalculoModelo, type Casilla, type PeriodoModelo } from './comun.ts'

export type ConceptoRetencion = 'trabajo' | 'actividad_profesional' | 'premio' | 'ganancia_forestal' | 'derechos_imagen' | 'alquiler' | 'otro'

export interface RetencionPracticada {
  /** Trazabilidad: nómina, factura recibida o asiento de origen. */
  ref: string
  /** Fecha de PAGO/abono de la renta (ISO). */
  fecha: string
  concepto: ConceptoRetencion
  perceptor: { nif: string | null; nombre: string; /** Código de provincia (2 dígitos), exigido en el 190 de trabajo. */ provincia?: string }
  /** Percepción íntegra (base de la retención), céntimos. */
  percepcion: Centimos
  /** Retención o ingreso a cuenta practicado, céntimos. */
  retencion: Centimos
  /** Tipo aplicado (%), informativo. */
  porcentaje?: number
  /** Retribución en especie (ingreso a cuenta). Por defecto dineraria. */
  especie?: boolean
  /** Clave de percepción del 190 (A, G…). Si falta se propone solo para trabajo (A) y profesionales (G). */
  clave?: string
  subclave?: string
  /** Referencia catastral del inmueble (alquileres → 180). */
  refCatastral?: string
  origen?: 'nominas' | 'compras' | 'manual'
}

/** Cuenta que alimenta el origen de cada retención: nóminas y compras emiten estas filas. */
export const CLAVE_190_POR_DEFECTO: Readonly<Partial<Record<ConceptoRetencion, string>>> = { trabajo: 'A', actividad_profesional: 'G' }

const ISO = /^\d{4}-\d{2}-\d{2}$/
export function problemasRetencion(r: RetencionPracticada): string[] {
  const p: string[] = []
  if (!r.ref || !String(r.ref).trim()) p.push('falta la referencia')
  if (typeof r.fecha !== 'string' || !ISO.test(r.fecha)) p.push('fecha inválida')
  if (!Number.isSafeInteger(r.percepcion)) p.push('percepción: entero en céntimos')
  if (!Number.isSafeInteger(r.retencion)) p.push('retención: entero en céntimos')
  if (Number.isSafeInteger(r.percepcion) && Number.isSafeInteger(r.retencion) && r.percepcion >= 0 && (r.retencion < 0 || r.retencion > r.percepcion)) p.push('la retención no puede ser negativa ni superar la percepción')
  return p
}

type Grupo = { n: Set<string>; sinNif: number; percepcion: number; retencion: number; refs: string[] }
const grupo = (): Grupo => ({ n: new Set(), sinNif: 0, percepcion: 0, retencion: 0, refs: [] })
function acumular(g: Grupo, r: RetencionPracticada) {
  const nif = nifNormalizado(r.perceptor.nif)
  if (nif) g.n.add(nif); else g.sinNif += 1
  g.percepcion += r.percepcion; g.retencion += r.retencion; g.refs.push(r.ref)
}
const perceptores = (g: Grupo) => g.n.size + g.sinNif

function filtrar(rs: readonly RetencionPracticada[], anio: number, periodo: PeriodoModelo, conceptos: readonly ConceptoRetencion[]) {
  const rango = rangoDeModelo(anio, periodo)
  const dentro: RetencionPracticada[] = []
  const excluidas: { ref: string; motivo: string }[] = []
  const avisos: string[] = []
  for (const r of rs) {
    if (!enRango(r.fecha, rango)) continue
    const p = problemasRetencion(r)
    if (p.length) { excluidas.push({ ref: String(r.ref), motivo: p.join('; ') }); continue }
    if (r.concepto === 'otro') { excluidas.push({ ref: r.ref, motivo: 'concepto «otro» sin modelo asignado' }); continue }
    if (!conceptos.includes(r.concepto)) continue
    dentro.push(r)
  }
  return { dentro, excluidas, avisos }
}

export type ParametrosRetenciones = { anio: number; trimestre: 1 | 2 | 3 | 4; /** Casilla 29/04: resultados negativos de declaraciones anteriores (≥ 0). */ negativosAnteriores?: number; /** Casilla 30/05: a deducir (solo complementaria). */ aDeducir?: number }

const GRUPOS_111: readonly { concepto: ConceptoRetencion; especie: boolean; n: [string, string, string]; nombre: string; certeza: 'alta' | 'media' }[] = [
  { concepto: 'trabajo', especie: false, n: ['01', '02', '03'], nombre: 'Rendimientos del trabajo (dinerarios)', certeza: 'alta' },
  { concepto: 'trabajo', especie: true, n: ['04', '05', '06'], nombre: 'Rendimientos del trabajo (en especie)', certeza: 'media' },
  { concepto: 'actividad_profesional', especie: false, n: ['07', '08', '09'], nombre: 'Actividades económicas: profesionales (dinerarios)', certeza: 'alta' },
  { concepto: 'actividad_profesional', especie: true, n: ['10', '11', '12'], nombre: 'Actividades económicas: profesionales (en especie)', certeza: 'media' },
  { concepto: 'premio', especie: false, n: ['13', '14', '15'], nombre: 'Premios (dinerarios)', certeza: 'media' },
  { concepto: 'premio', especie: true, n: ['16', '17', '18'], nombre: 'Premios (en especie)', certeza: 'media' },
  { concepto: 'ganancia_forestal', especie: false, n: ['19', '20', '21'], nombre: 'Ganancias patrimoniales de aprovechamientos forestales (dinerarias)', certeza: 'media' },
  { concepto: 'ganancia_forestal', especie: true, n: ['22', '23', '24'], nombre: 'Ganancias patrimoniales de aprovechamientos forestales (en especie)', certeza: 'media' },
  { concepto: 'derechos_imagen', especie: false, n: ['25', '26', '27'], nombre: 'Contraprestaciones por cesión de derechos de imagen', certeza: 'media' },
]

export function calcularModelo111(rs: readonly RetencionPracticada[], p: ParametrosRetenciones): CalculoModelo {
  validarEjercicio(p.anio)
  const periodo = `${p.trimestre}T` as PeriodoModelo
  const { dentro, excluidas } = filtrar(rs, p.anio, periodo, ['trabajo', 'actividad_profesional', 'premio', 'ganancia_forestal', 'derechos_imagen'])
  const avisos: string[] = []
  const cs: Casilla[] = []
  const retenciones: Casilla[] = []
  for (const g of GRUPOS_111) {
    const acc = grupo()
    for (const r of dentro) if (r.concepto === g.concepto && (r.especie === true) === g.especie) acumular(acc, r)
    cs.push(casilla(g.n[0], `${g.nombre}: nº de perceptores`, perceptores(acc), acc.refs, g.certeza, 'numero'))
    cs.push(casilla(g.n[1], `${g.nombre}: importe de las percepciones`, acc.percepcion, acc.refs, g.certeza))
    const c3 = casilla(g.n[2], `${g.nombre}: importe de las retenciones`, acc.retencion, acc.refs, g.certeza)
    cs.push(c3); retenciones.push(c3)
    if (acc.sinNif > 0) avisos.push(`${g.nombre}: ${acc.sinNif} perceptor(es) sin NIF (se cuentan, pero no se podrán incluir en el 190)`)
  }
  const total = sumar(retenciones.map((c) => c.importe))
  cs.push(casilla('28', 'Suma de retenciones e ingresos a cuenta', total, retenciones.flatMap((c) => c.origen), 'media'))
  const neg = p.negativosAnteriores ?? 0
  const ded = p.aDeducir ?? 0
  if (!Number.isSafeInteger(neg) || neg < 0 || !Number.isSafeInteger(ded) || ded < 0) throw new RangeError('negativosAnteriores y aDeducir: enteros ≥ 0 en céntimos')
  cs.push(casilla('29', 'Resultados a ingresar de declaraciones anteriores negativos', neg, [], 'media'))
  cs.push(casilla('30', 'A deducir (exclusivamente en caso de declaración complementaria)', ded, [], 'media'))
  const res = total - neg - ded
  cs.push(casilla('31', 'Resultado a ingresar', res, [], 'media'))
  if (dentro.length === 0) avisos.push('Sin datos: no hay retenciones pagadas en el periodo')
  return { modelo: '111', anio: p.anio, periodo, casillas: cs, resultado: res, noSoportado: [], avisos, excluidas, ficheroOficial: DISENO_OFICIAL_PENDIENTE }
}

export function calcularModelo115(rs: readonly RetencionPracticada[], p: ParametrosRetenciones): CalculoModelo {
  validarEjercicio(p.anio)
  const periodo = `${p.trimestre}T` as PeriodoModelo
  const { dentro, excluidas } = filtrar(rs, p.anio, periodo, ['alquiler'])
  const avisos: string[] = []
  const acc = grupo()
  for (const r of dentro) acumular(acc, r)
  const neg = p.negativosAnteriores ?? 0
  const ded = p.aDeducir ?? 0
  if (!Number.isSafeInteger(neg) || neg < 0 || !Number.isSafeInteger(ded) || ded < 0) throw new RangeError('negativosAnteriores y aDeducir: enteros ≥ 0 en céntimos')
  const res = acc.retencion - neg - ded
  if (acc.sinNif > 0) avisos.push(`${acc.sinNif} arrendador(es) sin NIF`)
  if (dentro.length === 0) avisos.push('Sin datos: no hay retenciones por alquileres pagados en el periodo')
  const cs = [
    casilla('01', 'Número de perceptores', perceptores(acc), acc.refs, 'media', 'numero'),
    casilla('02', 'Importe de las rentas (base de las retenciones)', acc.percepcion, acc.refs, 'media'),
    casilla('03', 'Importe de las retenciones e ingresos a cuenta', acc.retencion, acc.refs, 'media'),
    casilla('04', 'Resultado a ingresar de declaraciones anteriores negativo', neg, [], 'media'),
    casilla('05', 'A deducir (exclusivamente en caso de declaración complementaria)', ded, [], 'media'),
    casilla('06', 'Resultado a ingresar', res, [], 'media'),
  ]
  return { modelo: '115', anio: p.anio, periodo, casillas: cs, resultado: res, noSoportado: [], avisos, excluidas, ficheroOficial: DISENO_OFICIAL_PENDIENTE }
}

// ── 190 ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export type PerceptorAnual = {
  nif: string
  nombre: string
  clave: string | null
  subclave: string | null
  provincia: string | null
  percepcionDineraria: Centimos
  retencionDineraria: Centimos
  percepcionEspecie: Centimos
  ingresoACuentaEspecie: Centimos
  refs: string[]
}
export type Modelo190 = CalculoModelo & {
  perceptores: PerceptorAnual[]
  /** Retenciones sin NIF o sin clave: NO se pueden incluir en el 190 y se listan aparte. */
  incompletas: { ref: string; motivo: string }[]
  totales: { percepciones: Centimos; retenciones: Centimos; nPerceptores: number }
}

export function calcularModelo190(rs: readonly RetencionPracticada[], anio: number): Modelo190 {
  validarEjercicio(anio)
  const { dentro, excluidas } = filtrar(rs, anio, '0A', ['trabajo', 'actividad_profesional', 'premio', 'ganancia_forestal', 'derechos_imagen'])
  const incompletas: { ref: string; motivo: string }[] = []
  const avisos: string[] = []
  const m = new Map<string, PerceptorAnual>()
  let percepciones = 0
  let retenciones = 0
  for (const r of dentro) {
    percepciones += r.percepcion; retenciones += r.retencion // el total cuadra con los 111 aunque falte NIF/clave
    const nif = nifNormalizado(r.perceptor.nif)
    const clave = r.clave ?? CLAVE_190_POR_DEFECTO[r.concepto] ?? null
    if (!nif) { incompletas.push({ ref: r.ref, motivo: 'perceptor sin NIF' }); continue }
    if (!clave) { incompletas.push({ ref: r.ref, motivo: `concepto «${r.concepto}» sin clave de percepción` }); continue }
    if (r.concepto === 'trabajo' && !r.perceptor.provincia) avisos.push(`${nif}: falta el código de provincia (obligatorio en trabajo)`)
    const k = `${nif}|${clave}|${r.subclave ?? ''}`
    const x = m.get(k) ?? { nif, nombre: r.perceptor.nombre, clave, subclave: r.subclave ?? null, provincia: r.perceptor.provincia ?? null, percepcionDineraria: 0, retencionDineraria: 0, percepcionEspecie: 0, ingresoACuentaEspecie: 0, refs: [] }
    if (r.especie) { x.percepcionEspecie += r.percepcion; x.ingresoACuentaEspecie += r.retencion } else { x.percepcionDineraria += r.percepcion; x.retencionDineraria += r.retencion }
    x.refs.push(r.ref)
    m.set(k, x)
  }
  const perceptores = [...m.values()].sort((a, b) => (a.nif < b.nif ? -1 : a.nif > b.nif ? 1 : a.clave! < b.clave! ? -1 : 1))
  if (incompletas.length) avisos.push(`${incompletas.length} retención(es) sin NIF o sin clave: no pueden ir en el 190 hasta completarlas`)
  if (dentro.length === 0) avisos.push('Sin datos: no hay retenciones pagadas en el ejercicio')
  const todas = dentro.map((r) => r.ref)
  const cs = [
    casilla('N', 'Número de perceptores (NIF + clave + subclave)', perceptores.length, perceptores.flatMap((x) => x.refs), 'media', 'numero'),
    casilla('P', 'Total percepciones íntegras', percepciones, todas, 'media'),
    casilla('R', 'Total retenciones e ingresos a cuenta', retenciones, todas, 'media'),
  ]
  return {
    modelo: '190', anio, periodo: '0A', casillas: cs, resultado: null, noSoportado: [], avisos, excluidas, ficheroOficial: DISENO_OFICIAL_PENDIENTE,
    perceptores, incompletas, totales: { percepciones, retenciones, nPerceptores: perceptores.length },
  }
}

// ── 180 ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export type ArrendadorAnual = { nif: string; nombre: string; refCatastral: string | null; base: Centimos; retencion: Centimos; refs: string[] }
export type Modelo180 = CalculoModelo & { arrendadores: ArrendadorAnual[]; incompletas: { ref: string; motivo: string }[]; totales: { base: Centimos; retenciones: Centimos } }

export function calcularModelo180(rs: readonly RetencionPracticada[], anio: number): Modelo180 {
  validarEjercicio(anio)
  const { dentro, excluidas } = filtrar(rs, anio, '0A', ['alquiler'])
  const incompletas: { ref: string; motivo: string }[] = []
  const avisos: string[] = []
  const m = new Map<string, ArrendadorAnual>()
  let base = 0
  let ret = 0
  for (const r of dentro) {
    base += r.percepcion; ret += r.retencion
    const nif = nifNormalizado(r.perceptor.nif)
    if (!nif) { incompletas.push({ ref: r.ref, motivo: 'arrendador sin NIF' }); continue }
    const cat = (r.refCatastral ?? '').trim().toUpperCase() || null
    if (!cat) avisos.push(`${nif}: falta la referencia catastral del inmueble (obligatoria en el 180)`)
    const k = `${nif}|${cat ?? ''}`
    const x = m.get(k) ?? { nif, nombre: r.perceptor.nombre, refCatastral: cat, base: 0, retencion: 0, refs: [] }
    x.base += r.percepcion; x.retencion += r.retencion; x.refs.push(r.ref)
    m.set(k, x)
  }
  const arrendadores = [...m.values()].sort((a, b) => (a.nif + (a.refCatastral ?? '') < b.nif + (b.refCatastral ?? '') ? -1 : 1))
  if (incompletas.length) avisos.push(`${incompletas.length} retención(es) sin NIF de arrendador: no pueden ir en el 180`)
  if (dentro.length === 0) avisos.push('Sin datos: no hay retenciones por alquileres en el ejercicio')
  const todas = dentro.map((r) => r.ref)
  return {
    modelo: '180', anio, periodo: '0A',
    casillas: [
      casilla('N', 'Número de registros (arrendador + inmueble)', arrendadores.length, arrendadores.flatMap((x) => x.refs), 'media', 'numero'),
      casilla('B', 'Total bases de las retenciones', base, todas, 'media'),
      casilla('R', 'Total retenciones e ingresos a cuenta', ret, todas, 'media'),
    ],
    resultado: null, noSoportado: [], avisos, excluidas, ficheroOficial: DISENO_OFICIAL_PENDIENTE,
    arrendadores, incompletas, totales: { base, retenciones: ret },
  }
}

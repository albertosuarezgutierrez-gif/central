// Base fiscal IRPF por criterio de DEVENGO (puro: sin BD ni red; testeado con `node --test`).
//
// Sustituye a la base de CAJA de lib/finanzas.ts (movimientos_bancarios), que no descuenta
// amortización, no incluye a Pilar, no resta la comisión como gasto y se pierde los gastos sin
// cargo bancario (p. ej. el televisor de 1.749€). Método y cifras de referencia ene-oct 2026:
// «base conciliada» (31/10/2026).
//
// Reglas:
//  - Ingresos = BRUTO del portal (`incomes.amount_gross`) por fecha de CHECK-IN; la comisión es
//    gasto (bruto − neto, solo donde el portal la registra).
//  - Gastos directos de cada piso (`gastos` + limpieza de `limpieza_facturas`); MOBILIARIO como
//    gasto íntegro (decisión de Alberto 31/10/2026; riesgo: art. 23.1.b LIRPF lo limita a amortización).
//  - Gastos compartidos (`prop_multi_apartamentos`) repartidos por peso de bruto del periodo.
//  - Amortización (solo capital inmobiliario): anual × días DISTINTOS con reserva dentro del periodo
//    / días del año. Las estancias que cruzan el límite del periodo se recortan.
//  - Bloques: capital inmobiliario (Socorro, Dúplex), capital mobiliario (Bustos, subarriendo),
//    actividad correduría (bruto = cobrado / (1 − 15 %)) y actividad de Pilar.
//  - `null` = «sin dato», nunca 0.

import { cuotaTarifa, type ImportesAnio } from './fiscal-deducciones.ts'

// ── Parámetros de amortización (ÚNICO sitio) ────────────────────────────────────────────────
// No existen en BD. Fuentes: Socorro 24 — escritura 25/09/2015 + gastos inherentes
// (346.000 + 28.412,20 = 374.412,20€) × 60,58 % construcción (certificación catastral 2015) × 3 %.
// Dúplex Villasís — base de amortización 63.799,97€ del borrador IRPF 2023/2025 × 3 % (≈1.914€/año).
// Pendiente (docs amortizacion-pisos): IBI/catastro vigente de ambos.
export const TASA_AMORTIZACION_INMUEBLE = 0.03
export const AMORTIZACION_INMUEBLES: Record<string, { anual: number; fuente: string }> = {
  prop_house_sevillana: {
    anual: redondear(374412.2 * 0.6058 * TASA_AMORTIZACION_INMUEBLE),
    fuente: 'Escritura 2015 + gastos inherentes 374.412,20€ × 60,58 % construcción (catastro 2015) × 3 %',
  },
  prop_duplex_center: {
    anual: redondear(63799.97 * TASA_AMORTIZACION_INMUEBLE),
    fuente: 'Base de amortización 63.799,97€ (borrador IRPF 2023/2025) × 3 %',
  },
}
export const REDUCCION_CONJUNTA = 3400
export const UMBRAL_TARIFA_ALTA = 60000
export const RETENCION_CORREDURIA = 0.15

export type Bloque = 'capital_inmobiliario' | 'capital_mobiliario' | 'actividad_correduria' | 'actividad_pilar'
export const BLOQUES: Bloque[] = ['capital_inmobiliario', 'capital_mobiliario', 'actividad_correduria', 'actividad_pilar']

export type PropiedadFiscal = {
  id: string
  nombre: string
  bloque: 'capital_inmobiliario' | 'capital_mobiliario'
  /** titular → porcentaje (0..100), de `propiedad_titularidad`. */
  titulares: { titular: string; porcentaje: number }[]
}
export type FilaIngreso = { propertyId: string; checkIn: string; checkOut: string; bruto: number; neto: number }
/** Gasto ya asignado a un piso (el cargador incluye la limpieza de `limpieza_facturas`). */
export type FilaGastoPiso = { propertyId: string; mes: string; importe: number; categoria: string }
export type FilaGastoCompartido = { mes: string; importe: number }
export type Actividad = { ingresosPorMes: Record<string, number>; gastosPorMes: Record<string, number> }

export type EntradaBase = {
  anio: number
  /** YYYY-MM-DD: «hoy». */
  hoy: string
  propiedades: PropiedadFiscal[]
  ingresos: FilaIngreso[]
  gastosPiso: FilaGastoPiso[]
  gastosCompartidos: FilaGastoCompartido[]
  /** Cobrado (neto de retención) de la correduría por mes, y sus gastos (banco destino `seguros`). */
  correduria: Actividad
  pilar: Actividad
  amortizacion?: Record<string, { anual: number }>
}

// ── Utilidades ──────────────────────────────────────────────────────────────────────────────
export function redondear(n: number): number { return Math.round(n * 100) / 100 }
const suma = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const mesDe = (f: string) => f.slice(0, 7)
const diasDelAnio = (y: number) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365)
function sumDias(f: string, n: number): string {
  const d = new Date(`${f}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
function mesesDe(desde: string, hasta: string): string[] {
  const out: string[] = []
  let [y, m] = [Number(desde.slice(0, 4)), Number(desde.slice(5, 7))]
  const fin = hasta.slice(0, 7)
  for (;;) {
    const k = `${y}-${String(m).padStart(2, '0')}`
    if (k > fin) break
    out.push(k); m++; if (m > 12) { m = 1; y++ }
  }
  return out
}
/** Días DISTINTOS (YYYY-MM-DD) con reserva en [desde, hasta]; la noche del día X cuenta el día X. */
export function diasOcupados(ingresos: FilaIngreso[], propertyId: string, desde: string, hasta: string): Set<string> {
  const out = new Set<string>()
  for (const r of ingresos) {
    if (r.propertyId !== propertyId) continue
    for (let d = r.checkIn; d < r.checkOut; d = sumDias(d, 1)) {
      if (d >= desde && d <= hasta) out.add(d)
    }
  }
  return out
}

// ── Cálculo de un periodo ───────────────────────────────────────────────────────────────────
export type LineaPiso = {
  propertyId: string
  nombre: string
  bloque: 'capital_inmobiliario' | 'capital_mobiliario'
  bruto: number
  comision: number
  gastosDirectos: number
  mobiliario: number // ya incluido en gastosDirectos (informativo)
  compartidos: number
  amortizacion: number | null // null = no aplica (subarriendo) o sin parámetros
  dias: number
  neto: number
}
export type MesBase = { mes: string; porBloque: Record<Bloque, number | null>; total: number | null }
export type BloqueResumen = { neto: number | null; estimado?: number }
export type Periodo = {
  desde: string
  hasta: string
  lineas: LineaPiso[]
  compartidosSinRepartir: number
  correduria: { cobrado: number | null; bruto: number | null; retencion: number | null; gastos: number | null; neto: number | null }
  pilar: { ingresos: number | null; gastos: number | null; neto: number | null }
  bloques: Record<Bloque, number | null>
  baseGeneral: number | null
  porMes: MesBase[]
}

function actividad(a: Actividad, meses: string[]) {
  const ing = meses.filter(m => a.ingresosPorMes[m] != null)
  const gas = meses.filter(m => a.gastosPorMes[m] != null)
  return {
    ingresos: ing.length ? suma(ing.map(m => a.ingresosPorMes[m])) : null,
    gastos: gas.length ? suma(gas.map(m => a.gastosPorMes[m])) : null,
  }
}
const netoAct = (i: number | null, g: number | null) => (i == null && g == null ? null : (i ?? 0) - (g ?? 0))

export function calcularPeriodo(e: EntradaBase, desde: string, hasta: string): Periodo {
  const meses = mesesDe(desde, hasta)
  const dentro = (f: string) => f >= desde && f <= hasta
  const amort = e.amortizacion ?? AMORTIZACION_INMUEBLES
  const ingP = e.ingresos.filter(r => dentro(r.checkIn))
  const brutoTotal = suma(ingP.map(r => r.bruto))
  const compTot = suma(e.gastosCompartidos.filter(g => meses.includes(g.mes)).map(g => g.importe))
  const denomAnio = diasDelAnio(e.anio)

  const lineas: LineaPiso[] = e.propiedades.map(p => {
    const filas = ingP.filter(r => r.propertyId === p.id)
    const bruto = suma(filas.map(r => r.bruto))
    const comision = suma(filas.map(r => Math.max(0, r.bruto - r.neto)))
    const gp = e.gastosPiso.filter(g => g.propertyId === p.id && meses.includes(g.mes))
    const dias = diasOcupados(e.ingresos, p.id, desde, hasta).size
    const par = amort[p.id]
    const amortizacion = p.bloque === 'capital_inmobiliario' && par ? redondear((par.anual * dias) / denomAnio) : null
    const compartidos = brutoTotal > 0 ? redondear((compTot * bruto) / brutoTotal) : 0
    const gastosDirectos = suma(gp.map(g => g.importe))
    return {
      propertyId: p.id, nombre: p.nombre, bloque: p.bloque, bruto, comision, gastosDirectos,
      mobiliario: suma(gp.filter(g => g.categoria === 'MOBILIARIO').map(g => g.importe)),
      compartidos, amortizacion, dias,
      neto: bruto - comision - gastosDirectos - compartidos - (amortizacion ?? 0),
    }
  })

  const c = actividad(e.correduria, meses)
  const corBruto = c.ingresos == null ? null : c.ingresos / (1 - RETENCION_CORREDURIA)
  const corr = {
    cobrado: c.ingresos, bruto: corBruto, retencion: corBruto == null ? null : corBruto - (c.ingresos ?? 0),
    gastos: c.gastos, neto: netoAct(corBruto, c.gastos),
  }
  const pl = actividad(e.pilar, meses)
  const pilar = { ingresos: pl.ingresos, gastos: pl.gastos, neto: netoAct(pl.ingresos, pl.gastos) }

  const bloques: Record<Bloque, number | null> = {
    capital_inmobiliario: suma(lineas.filter(l => l.bloque === 'capital_inmobiliario').map(l => l.neto)),
    capital_mobiliario: suma(lineas.filter(l => l.bloque === 'capital_mobiliario').map(l => l.neto)),
    actividad_correduria: corr.neto,
    actividad_pilar: pilar.neto,
  }
  const baseGeneral = suma(BLOQUES.map(b => bloques[b] ?? 0))

  const porMes: MesBase[] = meses.map(m => {
    const d0 = m > desde.slice(0, 7) ? `${m}-01` : desde
    const d1 = m < hasta.slice(0, 7) ? sumDias(`${mesSiguiente(m)}-01`, -1) : hasta
    const pb: Record<Bloque, number | null> = { capital_inmobiliario: null, capital_mobiliario: null, actividad_correduria: null, actividad_pilar: null }
    for (const p of e.propiedades) {
      const filas = ingP.filter(r => r.propertyId === p.id && mesDe(r.checkIn) === m)
      const gp = e.gastosPiso.filter(g => g.propertyId === p.id && g.mes === m)
      const cm = e.gastosCompartidos.filter(g => g.mes === m)
      const bruto = suma(filas.map(r => r.bruto))
      const brutoPropTot = suma(ingP.filter(r => r.propertyId === p.id).map(r => r.bruto))
      // compartidos del mes: reparto proporcional al bruto del periodo (suma por piso = total del periodo)
      const compMes = brutoTotal > 0 ? (suma(cm.map(g => g.importe)) * brutoPropTot) / brutoTotal : 0
      const par = amort[p.id]
      const diasM = diasOcupados(e.ingresos, p.id, d0, d1).size
      // Un mes con estancia en curso (check-in del mes anterior) o con compartidos también aporta
      // amortización/gasto: no saltarlo, o la suma de los meses no cuadra con el periodo.
      if (!filas.length && !gp.length && diasM === 0 && compMes === 0) continue
      const am = p.bloque === 'capital_inmobiliario' && par ? (par.anual * diasM) / denomAnio : 0
      const n = bruto - suma(filas.map(r => Math.max(0, r.bruto - r.neto))) - suma(gp.map(g => g.importe)) - compMes - am
      pb[p.bloque] = (pb[p.bloque] ?? 0) + n
    }
    const ci = e.correduria.ingresosPorMes[m], cg = e.correduria.gastosPorMes[m]
    if (ci != null || cg != null) pb.actividad_correduria = (ci != null ? ci / (1 - RETENCION_CORREDURIA) : 0) - (cg ?? 0)
    const pi = e.pilar.ingresosPorMes[m], pg = e.pilar.gastosPorMes[m]
    if (pi != null || pg != null) pb.actividad_pilar = (pi ?? 0) - (pg ?? 0)
    const vals = BLOQUES.map(b => pb[b]).filter((x): x is number => x != null)
    return { mes: m, porBloque: pb, total: vals.length ? suma(vals) : null }
  })

  return { desde, hasta, lineas, compartidosSinRepartir: brutoTotal > 0 ? 0 : compTot, correduria: corr, pilar, bloques, baseGeneral, porMes }
}
function mesSiguiente(m: string): string {
  const y = Number(m.slice(0, 4)), mm = Number(m.slice(5, 7))
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`
}

// ── Conjunta vs individual ──────────────────────────────────────────────────────────────────
export type ParamsCuota = {
  tramos: ImportesAnio['tramos']
  /** Mínimo personal y familiar de la declaración conjunta (contribuyente + descendientes). */
  minimoConjunta: number
  minimoContribuyente: number
}
export type Comparativa = {
  conjunta: { baseGeneral: number; baseLiquidable: number; cuota: number }
  individual: {
    alberto: { base: number; cuota: number }
    pilar: { base: number; cuota: number }
    total: number
  }
  masBarata: 'conjunta' | 'individual'
  ahorro: number
  /** 60.000 − base liquidable general (positivo = por debajo del umbral del 45 %). */
  distanciaUmbralConjunta: number
  distanciaUmbralAlberto: number
  distanciaUmbralPilar: number
  excesoSobreUmbralConjunta: number
}

/** Parte de cada piso que declara cada titular; el resto de bloques son de Alberto (Pilar: su actividad). */
export function repartoIndividual(p: Periodo, props: PropiedadFiscal[]): { alberto: number; pilar: number } {
  let alberto = 0, pilar = 0
  for (const l of p.lineas) {
    const tit = props.find(x => x.id === l.propertyId)?.titulares ?? []
    const pctP = tit.find(t => t.titular === 'pilar')?.porcentaje ?? 0
    const pctA = tit.length ? tit.filter(t => t.titular !== 'pilar').reduce((s, t) => s + t.porcentaje, 0) : 100
    alberto += (l.neto * pctA) / 100
    pilar += (l.neto * pctP) / 100
  }
  alberto += (p.bloques.actividad_correduria ?? 0)
  pilar += (p.bloques.actividad_pilar ?? 0)
  return { alberto, pilar }
}

export function compararConjuntaIndividual(p: Periodo, props: PropiedadFiscal[], c: ParamsCuota): Comparativa {
  const cuota = (base: number, min: number) => Math.max(0, cuotaTarifa(base, c.tramos) - cuotaTarifa(min, c.tramos))
  const bg = p.baseGeneral ?? 0
  const bl = Math.max(0, bg - REDUCCION_CONJUNTA)
  const cConj = cuota(bl, c.minimoConjunta)
  const mitadDesc = (c.minimoConjunta - c.minimoContribuyente) / 2
  const minInd = c.minimoContribuyente + mitadDesc
  const r = repartoIndividual(p, props)
  const cA = cuota(r.alberto, minInd), cP = cuota(r.pilar, minInd)
  const totalInd = cA + cP
  const masBarata = totalInd < cConj ? 'individual' : 'conjunta'
  return {
    conjunta: { baseGeneral: bg, baseLiquidable: bl, cuota: cConj },
    individual: { alberto: { base: r.alberto, cuota: cA }, pilar: { base: r.pilar, cuota: cP }, total: totalInd },
    masBarata, ahorro: Math.abs(cConj - totalInd),
    distanciaUmbralConjunta: UMBRAL_TARIFA_ALTA - bl,
    distanciaUmbralAlberto: UMBRAL_TARIFA_ALTA - r.alberto,
    distanciaUmbralPilar: UMBRAL_TARIFA_ALTA - r.pilar,
    excesoSobreUmbralConjunta: Math.max(0, bl - UMBRAL_TARIFA_ALTA),
  }
}

// ── Estimación de cierre de año ─────────────────────────────────────────────────────────────
export type Estimacion = {
  /** Periodo hoy→31/12 con SOLO lo estimado (reservas futuras, gasto medio, amortización). */
  mesesRestantes: number
  futuro: {
    reservas: number
    bruto: number
    comision: number
    gastosMedios: number
    amortizacion: number
    correduriaNeto: number | null
    pilarNeto: number | null
  }
  bloques: Record<Bloque, { real: number | null; estimado: number | null; total: number | null }>
  baseGeneral: number
  baseEstimada: number // parte de baseGeneral que es estimación
  estimadoPorPiso: Record<string, number>
}

export function estimarCierre(e: EntradaBase, hastaHoy: Periodo): Estimacion {
  const fin = `${e.anio}-12-31`
  const desdeF = sumDias(e.hoy, 1)
  const diasRest = e.hoy >= fin ? 0 : Math.round((Date.parse(fin) - Date.parse(e.hoy)) / 86400000)
  const mesesRestantes = redondear(diasRest / (diasDelAnio(e.anio) / 12))
  const mesesCompletos = mesesDe(`${e.anio}-01-01`, e.hoy).filter(m => sumDias(`${mesSiguiente(m)}-01`, -1) <= e.hoy)

  // Ingresos y amortización futuros: mismo motor sobre [hoy+1, 31/12], sin gastos reales.
  const futuroE: EntradaBase = { ...e, gastosPiso: [], gastosCompartidos: [], correduria: { ingresosPorMes: {}, gastosPorMes: {} }, pilar: { ingresosPorMes: {}, gastosPorMes: {} } }
  const fut = desdeF <= fin ? calcularPeriodo(futuroE, desdeF, fin) : null

  // Gasto medio mensual (meses completos CON dato, por categoría, sin MOBILIARIO que es puntual).
  const medio = (filas: { mes: string; importe: number }[]) => {
    const por = new Map<string, number>()
    for (const f of filas) if (mesesCompletos.includes(f.mes)) por.set(f.mes, (por.get(f.mes) ?? 0) + f.importe)
    return por.size ? suma([...por.values()]) / por.size : 0
  }
  const cats = (propId: string) => [...new Set(e.gastosPiso.filter(g => g.propertyId === propId && g.categoria !== 'MOBILIARIO').map(g => g.categoria))]
  const gastoMedioPiso = (propId: string) =>
    suma(cats(propId).map(c => medio(e.gastosPiso.filter(g => g.propertyId === propId && g.categoria === c))))
  const medioComp = medio(e.gastosCompartidos)

  const bl: Estimacion['bloques'] = {
    capital_inmobiliario: { real: hastaHoy.bloques.capital_inmobiliario, estimado: 0, total: null },
    capital_mobiliario: { real: hastaHoy.bloques.capital_mobiliario, estimado: 0, total: null },
    actividad_correduria: { real: hastaHoy.bloques.actividad_correduria, estimado: null, total: null },
    actividad_pilar: { real: hastaHoy.bloques.actividad_pilar, estimado: null, total: null },
  }
  let reservas = 0, bruto = 0, comision = 0, amortizacion = 0, gastosMedios = 0
  const estimadoPorPiso: Record<string, number> = {}
  const brutoReal = suma(hastaHoy.lineas.map(l => l.bruto))
  for (const p of e.propiedades) {
    const l = fut?.lineas.find(x => x.propertyId === p.id)
    const peso = brutoReal > 0 ? (hastaHoy.lineas.find(x => x.propertyId === p.id)?.bruto ?? 0) / brutoReal : 1 / Math.max(1, e.propiedades.length)
    const gm = (gastoMedioPiso(p.id) + medioComp * peso) * mesesRestantes
    const n = (l ? l.bruto - l.comision - (l.amortizacion ?? 0) : 0) - gm
    estimadoPorPiso[p.id] = n
    bl[p.bloque].estimado = (bl[p.bloque].estimado ?? 0) + n
    if (l) { bruto += l.bruto; comision += l.comision; amortizacion += l.amortizacion ?? 0 }
    gastosMedios += gm
  }
  reservas = e.ingresos.filter(r => r.checkIn > e.hoy && r.checkIn <= fin).length

  const mediaAct = (m: Record<string, number>) => {
    const v = mesesCompletos.filter(k => m[k] != null).map(k => m[k])
    return v.length ? suma(v) / v.length : null
  }
  const cI = mediaAct(e.correduria.ingresosPorMes), cG = mediaAct(e.correduria.gastosPorMes)
  const correduriaNeto = cI == null && cG == null ? null : ((cI ?? 0) / (1 - RETENCION_CORREDURIA) - (cG ?? 0)) * mesesRestantes
  const pI = mediaAct(e.pilar.ingresosPorMes), pG = mediaAct(e.pilar.gastosPorMes)
  const pilarNeto = pI == null && pG == null ? null : ((pI ?? 0) - (pG ?? 0)) * mesesRestantes
  bl.actividad_correduria.estimado = correduriaNeto
  bl.actividad_pilar.estimado = pilarNeto

  let baseGeneral = 0, baseEstimada = 0
  for (const b of BLOQUES) {
    const x = bl[b]
    x.total = x.real == null && x.estimado == null ? null : (x.real ?? 0) + (x.estimado ?? 0)
    baseGeneral += x.total ?? 0
    baseEstimada += x.estimado ?? 0
  }
  return {
    mesesRestantes,
    futuro: { reservas, bruto, comision, gastosMedios, amortizacion, correduriaNeto, pilarNeto },
    bloques: bl, baseGeneral, baseEstimada, estimadoPorPiso,
  }
}

/** Periodo «cierre» (real + estimado) listo para compararConjuntaIndividual. */
export function periodoCierre(real: Periodo, est: Estimacion, anio: number): Periodo {
  return {
    ...real, hasta: `${anio}-12-31`,
    lineas: real.lineas.map(l => ({ ...l, neto: l.neto + (est.estimadoPorPiso[l.propertyId] ?? 0) })),
    bloques: Object.fromEntries(BLOQUES.map(b => [b, est.bloques[b].total])) as Record<Bloque, number | null>,
    baseGeneral: est.baseGeneral,
  }
}

// ── Avisos de datos incompletos ─────────────────────────────────────────────────────────────
export type CuentaFeed = { nombre: string; ultimoMovimiento: string | null }
export type AvisosDatos = {
  cuentasSinActualizar: { nombre: string; ultimoMovimiento: string | null; dias: number | null }[]
  mesesSinLimpieza: string[]
  mesesSinSuministros: string[]
}
export function avisosDatos(args: {
  hoy: string
  anio: number
  cuentas: CuentaFeed[]
  mesesConFacturaLimpieza: string[]
  mesesConSuministros: string[]
  umbralDias?: number
}): AvisosDatos {
  const umbral = args.umbralDias ?? 30
  const dias = (f: string) => Math.round((Date.parse(args.hoy) - Date.parse(f)) / 86400000)
  const cuentasSinActualizar = args.cuentas
    .map(c => ({ nombre: c.nombre, ultimoMovimiento: c.ultimoMovimiento, dias: c.ultimoMovimiento ? dias(c.ultimoMovimiento) : null }))
    .filter(c => c.dias == null || c.dias > umbral)
  const todos = mesesDe(`${args.anio}-01-01`, args.hoy)
  return {
    cuentasSinActualizar,
    mesesSinLimpieza: todos.filter(m => !args.mesesConFacturaLimpieza.includes(m)),
    mesesSinSuministros: todos.filter(m => !args.mesesConSuministros.includes(m)),
  }
}

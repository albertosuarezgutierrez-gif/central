// Simulador IRPF 2026 (puro: sin BD ni red; `node --test lib/simulador-irpf.test.ts`).
//
// Entrada = un escenario de `estimarCierre` (base-fiscal-devengo.ts) convertido con `periodoCierre`.
// Salida por escenario: conjunta vs individual, cuota estatal + autonómica (Andalucía) por separado,
// tipo marginal, distancia al umbral de 60.000€, «cada 1.000€ más cuesta X€», cuota diferencial y
// palancas con su ahorro en €.
//
// ⚠️ ORIENTATIVO — no sustituye asesoría fiscal. Fuera del motor: sociedad (descartada), deducciones
// familiares (maternidad, guardería, familia numerosa, Andalucía), base del ahorro.
// Regla NULL: un dato que no se sabe (base, retenciones, rendimientos del trabajo, intereses) se
// propaga como `null` («sin dato»); nunca se sustituye por 0.

import { BLOQUES, REDUCCION_CONJUNTA, UMBRAL_TARIFA_ALTA, periodoCierre, type Estimacion, type EscenarioId, type Periodo, type PropiedadFiscal } from './base-fiscal-devengo.ts'
import { minimoPersonalYFamiliar, parametrosDonativo, importesDe, type Descendiente, type PerfilFiscal } from './fiscal-deducciones.ts'

// ── Escalas 2026 (separadas) ────────────────────────────────────────────────────────────────
export type Tramo = { desde: number; hasta: number | null; tipo: number }
export type Escala = { nombre: string; tramos: Tramo[]; fuente: string; revisado: string }

/** Art. 63.1 LIRPF (sin cambios: PGE 2026 prorrogados). */
export const ESCALA_ESTATAL_2026: Escala = {
  nombre: 'estatal',
  fuente: 'Ley 35/2006 art. 63.1 (redacción vigente; PGE 2026 no aprobados, prórroga)',
  revisado: '2026-10-31',
  tramos: [
    { desde: 0, hasta: 12450, tipo: 0.095 },
    { desde: 12450, hasta: 20200, tipo: 0.12 },
    { desde: 20200, hasta: 35200, tipo: 0.15 },
    { desde: 35200, hasta: 60000, tipo: 0.185 },
    { desde: 60000, hasta: 300000, tipo: 0.225 },
    { desde: 300000, hasta: null, tipo: 0.245 },
  ],
}
/** Andalucía: Ley 5/2021 art. 23 tras Decreto-ley 7/2022 (cortes bajos 13.000/21.100). Verificar en BOJA 2026. */
export const ESCALA_ANDALUCIA_2026: Escala = {
  nombre: 'andalucia',
  fuente: 'Ley 5/2021 Andalucía art. 23 (redacción Decreto-ley 7/2022) — verificar BOJA 2026',
  revisado: '2026-10-31',
  tramos: [
    { desde: 0, hasta: 13000, tipo: 0.095 },
    { desde: 13000, hasta: 21100, tipo: 0.12 },
    { desde: 21100, hasta: 35200, tipo: 0.15 },
    { desde: 35200, hasta: 60000, tipo: 0.185 },
    { desde: 60000, hasta: null, tipo: 0.225 },
  ],
}

export type ParametrosIrpf = {
  anio: number
  estatal: Escala
  autonomica: Escala
  minimoContribuyente: number
  /** Mínimo por descendientes TOTAL de la unidad familiar (en individual se reparte a partes iguales, art. 61 LIRPF). */
  minimoDescendientes: number
  reduccionConjunta: number
  umbral: number
  /** Plan de pensiones propio (art. 52.1 LIRPF): menor de 1.500€ y 30 % de rend. netos trabajo + actividades. */
  planPropioTope: number
  planPropioPct: number
  /** Aportación al plan del cónyuge (art. 51.7): tope 1.000€ si el cónyuge tiene rend. trabajo + actividades < 8.000€. */
  planConyugeTope: number
  planConyugeRentaMax: number
  /** Base de deducción de donativos ≤ 10 % de la base liquidable (art. 69.1). */
  donativoLimiteBase: number
}

const PERFIL_NEUTRO: PerfilFiscal = {
  comunidadAutonoma: 'andalucia', declaracionConjunta: true, familiaNumerosa: null, conyugeTrabaja: false,
  gastoGuarderiaAnual: 0, aportacionPlanPensiones: 0, gradoDiscapacidadTitular: 0, gradoDiscapacidadConyuge: 0,
  ascendientesACargo: 0, ascendientesMayores75: 0, donativosAnual: 0, gastoDeportivoAnual: 0,
}

/** Parámetros 2026 con los mínimos legales de `IMPORTES_POR_ANIO` (mínimos autonómicos = estatales [Suposición]). */
export function parametrosIrpf(anio: number, descendientes: Descendiente[]): ParametrosIrpf {
  const imp = importesDe(anio)
  const minimoDescendientes = minimoPersonalYFamiliar(PERFIL_NEUTRO, descendientes, anio, imp) - imp.minimoContribuyente
  return {
    anio, estatal: ESCALA_ESTATAL_2026, autonomica: ESCALA_ANDALUCIA_2026,
    minimoContribuyente: imp.minimoContribuyente, minimoDescendientes,
    reduccionConjunta: REDUCCION_CONJUNTA, umbral: UMBRAL_TARIFA_ALTA,
    planPropioTope: imp.limitePlanPensiones, planPropioPct: 0.3,
    planConyugeTope: 1000, planConyugeRentaMax: 8000, donativoLimiteBase: 0.1,
  }
}

// ── Cuota por escala ────────────────────────────────────────────────────────────────────────
export function cuotaEscala(base: number, e: Escala): number {
  const b = Math.max(0, base)
  return e.tramos.reduce((s, t) => s + Math.max(0, Math.min(b, t.hasta ?? Infinity) - t.desde) * t.tipo, 0)
}
/** Tipo del tramo en el que cae `base` (frontera incluida en el tramo inferior: 60.000 → 37 %). */
function tipoEn(base: number, e: Escala): number {
  if (base <= 0) return e.tramos[0].tipo
  return (e.tramos.find(t => base > t.desde && base <= (t.hasta ?? Infinity)) ?? e.tramos[e.tramos.length - 1]).tipo
}

export type CuotaIntegra = { estatal: number; autonomica: number; total: number }
/** Cuota íntegra = Σ escala [escala(base liquidable) − escala(mínimo)], cada una ≥ 0. */
export function cuotaIntegra(baseLiquidable: number, minimo: number, p: ParametrosIrpf): CuotaIntegra {
  const una = (e: Escala) => Math.max(0, cuotaEscala(baseLiquidable, e) - cuotaEscala(minimo, e))
  const estatal = una(p.estatal), autonomica = una(p.autonomica)
  return { estatal, autonomica, total: estatal + autonomica }
}
/** Tipo marginal combinado (estatal + autonómico). 0 mientras la base no supera el mínimo. */
export function tipoMarginal(baseLiquidable: number, minimo: number, p: ParametrosIrpf): number {
  if (baseLiquidable <= minimo) return 0
  return tipoEn(baseLiquidable, p.estatal) + tipoEn(baseLiquidable, p.autonomica)
}
/** Cuánto sube la cuota si la base sube `delta` (negativo = cuánto baja). */
export function costeMarginal(baseLiquidable: number, minimo: number, p: ParametrosIrpf, delta = 1000): number {
  return cuotaIntegra(Math.max(0, baseLiquidable + delta), minimo, p).total - cuotaIntegra(baseLiquidable, minimo, p).total
}

export type LineaTramo = { desde: number; hasta: number | null; tipo: number; base: number; cuota: number }
/** Reparto de la base por tramos COMBINADOS (unión de cortes estatales y autonómicos), antes de restar el mínimo. */
export function desgloseTramos(baseLiquidable: number, p: ParametrosIrpf): LineaTramo[] {
  const cortes = [...new Set([...p.estatal.tramos, ...p.autonomica.tramos].map(t => t.desde))].sort((a, b) => a - b)
  const b = Math.max(0, baseLiquidable)
  return cortes.map((desde, i) => {
    const hasta = i + 1 < cortes.length ? cortes[i + 1] : null
    const tipo = tipoEn(desde + 0.005, p.estatal) + tipoEn(desde + 0.005, p.autonomica)
    const base = Math.max(0, Math.min(b, hasta ?? Infinity) - desde)
    return { desde, hasta, tipo, base, cuota: base * tipo }
  }).filter(l => l.base > 0)
}

// ── Donativos (Ley 49/2002 art. 19) ─────────────────────────────────────────────────────────
/** Deducción en CUOTA (no baja la base). Base de deducción limitada al % de la base liquidable. */
export function deduccionDonativos(donado: number, baseLiquidable: number, p: ParametrosIrpf, recurrente = false): number {
  const d = parametrosDonativo(p.anio)
  const x = Math.max(0, Math.min(donado, baseLiquidable * p.donativoLimiteBase))
  return Math.min(x, d.tramo) * d.pctTramo + Math.max(0, x - d.tramo) * (recurrente ? d.pctRestoRecurrente : d.pctResto)
}

// ── Planes de pensiones ─────────────────────────────────────────────────────────────────────
/** Límite de reducción por plan PROPIO. null si no se sabe algún rendimiento. ≤ 0 → 0. */
export function limitePlanPropio(rendTrabajo: number | null, rendActividad: number | null, p: ParametrosIrpf): number | null {
  if (rendTrabajo == null || rendActividad == null) return null
  return Math.min(p.planPropioTope, p.planPropioPct * Math.max(0, rendTrabajo + rendActividad))
}
/** Límite de la aportación al plan del CÓNYUGE (art. 51.7). null si no se sabe la renta del cónyuge. */
export function limitePlanConyuge(rendTrabajoConyuge: number | null, rendActividadConyuge: number | null, p: ParametrosIrpf): number | null {
  if (rendTrabajoConyuge == null || rendActividadConyuge == null) return null
  return rendTrabajoConyuge + rendActividadConyuge < p.planConyugeRentaMax ? p.planConyugeTope : 0
}

// ── Compras previstas ───────────────────────────────────────────────────────────────────────
export type TipoCompra = 'reparacion' | 'consumible' | 'escaso_valor' | 'mobiliario' | 'mejora'
export type CompraPrevista = {
  id: string
  descripcion: string
  importe: number
  propertyId: string
  /** null = sin clasificar → no cuenta (nunca se clasifica en silencio). */
  tipo: TipoCompra | null
  /** YYYY-MM-DD de entrega/obra ejecutada (devengo, no pago). */
  fecha: string
}
const diasDelAnio = (y: number) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365)
const diasHastaFin = (fecha: string, anio: number) =>
  Math.max(0, Math.round((Date.parse(`${anio}-12-31`) - Date.parse(fecha)) / 86400000) + 1)

/** Fracción del importe que es gasto del año `anio` si la compra se hace en `fecha` (sin el límite de ingresos). */
export function fraccionDeducible(c: Pick<CompraPrevista, 'tipo' | 'importe' | 'fecha'>, anio: number): number | null {
  if (c.tipo == null) return null
  if (Number(c.fecha.slice(0, 4)) !== anio) return 0
  const dias = diasHastaFin(c.fecha, anio) / diasDelAnio(anio)
  switch (c.tipo) {
    case 'reparacion': case 'consumible': return 1
    // Criterio laxo pedido por Alberto (<300€ = gasto); en capital inmobiliario es discutible [Suposición].
    case 'escaso_valor': return c.importe < 300 ? 1 : 0.1 * dias
    case 'mobiliario': return 0.1 * dias
    case 'mejora': return 0.03 * dias
  }
}

// ── Reparto por titular ─────────────────────────────────────────────────────────────────────
export type Titular = 'alberto' | 'pilar'
export type Bases = { alberto: number | null; pilar: number | null; total: number | null }

/**
 * Base imponible general de cada titular. Pisos según `titulares` de la propiedad (debe sumar 100);
 * correduría → Alberto; actividad de Pilar → Pilar. `reasignar` cambia el titular de pisos concretos
 * (escenario «Bustos a nombre de Pilar»). Piso sin titularidad o que no suma 100 → null + aviso.
 */
export function repartirPorTitular(
  p: Periodo, props: PropiedadFiscal[], reasignar: Record<string, Titular> = {}, avisos: string[] = [],
): Bases {
  let a: number | null = 0, pl: number | null = 0
  for (const l of p.lineas) {
    let tit = props.find(x => x.id === l.propertyId)?.titulares ?? []
    if (reasignar[l.propertyId]) tit = [{ titular: reasignar[l.propertyId], porcentaje: 100 }]
    const suma = tit.reduce((s, t) => s + t.porcentaje, 0)
    if (!tit.length || Math.abs(suma - 100) > 0.01 || tit.some(t => t.titular !== 'alberto' && t.titular !== 'pilar')) {
      avisos.push(`Titularidad de ${l.nombre} sin dato o incompleta: no se puede repartir la base.`)
      a = null; pl = null; continue
    }
    const pct = (t: Titular) => tit.filter(x => x.titular === t).reduce((s, x) => s + x.porcentaje, 0) / 100
    if (a != null) a += l.neto * pct('alberto')
    if (pl != null) pl += l.neto * pct('pilar')
  }
  const corr = p.bloques.actividad_correduria, act = p.bloques.actividad_pilar
  if (corr == null) avisos.push('Correduría sin dato: base de Alberto desconocida.')
  if (act == null) avisos.push('Actividad de Pilar sin dato: base de Pilar desconocida.')
  const alberto = a == null || corr == null ? null : a + corr
  const pilar = pl == null || act == null ? null : pl + act
  // Coherencia: el total debe ser la base general del periodo (misma base en conjunta e individual).
  const total = p.baseGeneral == null ? null : BLOQUES.reduce((s, b) => s + (p.bloques[b] ?? 0), 0)
  return { alberto, pilar, total }
}

// ── Declaraciones ───────────────────────────────────────────────────────────────────────────
export type Modo = 'conjunta' | 'individual'
export type PorTitular<T> = { alberto: T; pilar: T }

export type EntradaSimulador = {
  periodo: Periodo
  propiedades: PropiedadFiscal[]
  params: ParametrosIrpf
  /** Rendimientos netos del TRABAJO (0 = no tiene; null = no se sabe). Para los límites de planes. */
  rendimientosTrabajo: PorTitular<number | null>
  retenciones: PorTitular<number | null>
  pagosFraccionados: PorTitular<number | null>
  /** Intereses de financiación del año por piso (límite de reparación). Ausente = no se sabe. */
  intereses?: Record<string, number>
  /** Reparación y conservación ya computada por piso; ausente → se usa `gastosDirectos` (cota prudente). */
  reparacionesYaComputadas?: Record<string, number>
  /** Parámetros del año siguiente para comparar timing (por defecto los mismos: PGE prorrogados). */
  params2027?: ParametrosIrpf
  /** Pisos que en el escenario opcional pasarían a Pilar (por defecto, los de capital mobiliario: Bustos). */
  idsBustos?: string[]
}
export type Palancas = {
  planPropio: PorTitular<number>
  /** € que Alberto aporta al plan de Pilar. */
  planConyuge: number
  donativos: PorTitular<number>
  compras: CompraPrevista[]
  reasignar?: Record<string, Titular>
}
export const SIN_PALANCAS: Palancas = { planPropio: { alberto: 0, pilar: 0 }, planConyuge: 0, donativos: { alberto: 0, pilar: 0 }, compras: [] }

export type ResultadoContribuyente = {
  titular: Titular | 'unidad_familiar'
  baseImponible: number | null
  reducciones: number
  baseLiquidable: number | null
  minimo: number
  cuota: CuotaIntegra | null
  tipoMarginal: number | null
  /** umbral − base liquidable: negativo = te pasas. */
  distanciaUmbral: number | null
  /** «Cada 1.000€ más de base cuestan X€». */
  cada1000: number | null
  deduccionDonativos: number | null
  cuotaLiquida: number | null
  /** cuota líquida − retenciones − pagos fraccionados; null si falta alguno. >0 a pagar. */
  cuotaDiferencial: number | null
  desglose: LineaTramo[]
}
export type ResultadoDeclaracion = {
  modo: Modo
  contribuyentes: ResultadoContribuyente[]
  cuotaIntegra: number | null
  cuotaLiquida: number | null
  cuotaDiferencial: number | null
  avisos: string[]
}

const sumaN = (xs: (number | null)[]) => (xs.some(x => x == null) ? null : xs.reduce<number>((s, x) => s + (x as number), 0))

type Aplicado = { bases: Bases; reduccion: PorTitular<number>; donado: PorTitular<number>; avisos: string[] }

/** Aplica a las bases el efecto de palancas que mueven base (compras, planes) y devuelve donativos aparte. */
function aplicar(e: EntradaSimulador, pal: Palancas): Aplicado {
  const avisos: string[] = []
  const bases = repartirPorTitular(e.periodo, e.propiedades, pal.reasignar, avisos)
  const tit = (pid: string) => {
    const r = pal.reasignar?.[pid]
    return r ? [{ titular: r, porcentaje: 100 }] : (e.propiedades.find(x => x.id === pid)?.titulares ?? [])
  }
  // Compras: gasto deducible del año repartido por titularidad.
  let a = bases.alberto, p = bases.pilar, total = bases.total
  const margenUsado: Record<string, number> = {}
  for (const c of pal.compras) {
    const g = gastoCompra2026(e, c, margenUsado)
    if (g == null) { avisos.push(`Compra «${c.descripcion}»: sin dato para calcular su efecto.`); a = null; p = null; total = null; continue }
    if (total != null) total -= g
    for (const t of tit(c.propertyId)) {
      if (t.titular === 'alberto' && a != null) a -= (g * t.porcentaje) / 100
      if (t.titular === 'pilar' && p != null) p -= (g * t.porcentaje) / 100
    }
  }
  // Planes: limitados por ley y por la propia base (no la hacen negativa).
  const lim = limitesPlanes(e)
  const red = { alberto: 0, pilar: 0 }
  const recorta = (pedido: number, limite: number | null, quien: string) => {
    if (pedido <= 0) return 0
    if (limite == null) { avisos.push(`Plan de pensiones de ${quien}: límite sin dato, no se aplica.`); return 0 }
    return Math.min(pedido, limite)
  }
  red.alberto = recorta(pal.planPropio.alberto, lim.propio.alberto, 'Alberto') + recorta(pal.planConyuge, lim.conyuge, 'Pilar (aportación de Alberto)')
  red.pilar = recorta(pal.planPropio.pilar, lim.propio.pilar, 'Pilar')
  if (a != null) red.alberto = Math.min(red.alberto, Math.max(0, a))
  if (p != null) red.pilar = Math.min(red.pilar, Math.max(0, p))
  return { bases: { alberto: a, pilar: p, total }, reduccion: red, donado: pal.donativos, avisos: [...avisos] }
}

function bloqueDePiso(e: EntradaSimulador, pid: string) {
  return e.propiedades.find(x => x.id === pid)?.bloque ?? null
}
/** Gasto 2026 de una compra, aplicando el límite intereses + reparación ≤ ingresos íntegros (capital inmobiliario). */
function gastoCompra2026(e: EntradaSimulador, c: CompraPrevista, margenUsado: Record<string, number>): number | null {
  const f = fraccionDeducible(c, e.params.anio)
  if (f == null) return 0 // sin clasificar: no cuenta (se avisa en el resultado de la compra)
  const bruto = c.importe * f
  if (c.tipo !== 'reparacion' || bloqueDePiso(e, c.propertyId) !== 'capital_inmobiliario') return bruto
  const linea = e.periodo.lineas.find(l => l.propertyId === c.propertyId)
  const intereses = e.intereses?.[c.propertyId]
  if (!linea || intereses == null) return null
  const ya = e.reparacionesYaComputadas?.[c.propertyId] ?? linea.gastosDirectos
  const margen = Math.max(0, linea.bruto - intereses - ya - (margenUsado[c.propertyId] ?? 0))
  const g = Math.min(bruto, margen)
  margenUsado[c.propertyId] = (margenUsado[c.propertyId] ?? 0) + g
  return g
}

export function limitesPlanes(e: EntradaSimulador): { propio: PorTitular<number | null>; conyuge: number | null } {
  const act = { alberto: e.periodo.bloques.actividad_correduria, pilar: e.periodo.bloques.actividad_pilar }
  return {
    propio: {
      alberto: limitePlanPropio(e.rendimientosTrabajo.alberto, act.alberto, e.params),
      pilar: limitePlanPropio(e.rendimientosTrabajo.pilar, act.pilar, e.params),
    },
    conyuge: limitePlanConyuge(e.rendimientosTrabajo.pilar, act.pilar, e.params),
  }
}

function contribuyente(
  titular: ResultadoContribuyente['titular'], baseImponible: number | null, reducciones: number, minimo: number,
  donado: number, ret: number | null, pf: number | null, p: ParametrosIrpf,
): ResultadoContribuyente {
  const bl = baseImponible == null ? null : Math.max(0, baseImponible - reducciones)
  const cuota = bl == null ? null : cuotaIntegra(bl, minimo, p)
  const ded = bl == null || cuota == null ? null : Math.min(cuota.total, deduccionDonativos(donado, bl, p))
  const liq = cuota == null || ded == null ? null : cuota.total - ded
  return {
    titular, baseImponible, reducciones, baseLiquidable: bl, minimo, cuota,
    tipoMarginal: bl == null ? null : tipoMarginal(bl, minimo, p),
    distanciaUmbral: bl == null ? null : p.umbral - bl,
    cada1000: bl == null ? null : costeMarginal(bl, minimo, p, 1000),
    deduccionDonativos: ded, cuotaLiquida: liq,
    cuotaDiferencial: liq == null || ret == null || pf == null ? null : liq - ret - pf,
    desglose: bl == null ? [] : desgloseTramos(bl, p),
  }
}

export function declarar(e: EntradaSimulador, pal: Palancas, modo: Modo): ResultadoDeclaracion {
  const x = aplicar(e, pal)
  const p = e.params
  if (modo === 'conjunta') {
    const red = x.reduccion.alberto + x.reduccion.pilar + p.reduccionConjunta
    const c = contribuyente(
      'unidad_familiar', x.bases.total, red, p.minimoContribuyente + p.minimoDescendientes,
      x.donado.alberto + x.donado.pilar, sumaN([e.retenciones.alberto, e.retenciones.pilar]),
      sumaN([e.pagosFraccionados.alberto, e.pagosFraccionados.pilar]), p,
    )
    // Donativos en conjunta: el tramo del 80 % es por contribuyente que dona.
    if (c.baseLiquidable != null && c.cuota != null) {
      const bl = c.baseLiquidable
      const ded = Math.min(c.cuota.total, deduccionDonativos(x.donado.alberto, bl, p) + deduccionDonativos(x.donado.pilar, bl, p))
      c.deduccionDonativos = ded
      c.cuotaLiquida = c.cuota.total - ded
      const ret = sumaN([e.retenciones.alberto, e.retenciones.pilar]), pf = sumaN([e.pagosFraccionados.alberto, e.pagosFraccionados.pilar])
      c.cuotaDiferencial = ret == null || pf == null ? null : c.cuotaLiquida - ret - pf
    }
    return { modo, contribuyentes: [c], cuotaIntegra: c.cuota?.total ?? null, cuotaLiquida: c.cuotaLiquida, cuotaDiferencial: c.cuotaDiferencial, avisos: x.avisos }
  }
  const minInd = p.minimoContribuyente + p.minimoDescendientes / 2
  const cs = (['alberto', 'pilar'] as const).map(t =>
    contribuyente(t, x.bases[t], x.reduccion[t], minInd, x.donado[t], e.retenciones[t], e.pagosFraccionados[t], p))
  return {
    modo, contribuyentes: cs,
    cuotaIntegra: sumaN(cs.map(c => c.cuota?.total ?? null)),
    cuotaLiquida: sumaN(cs.map(c => c.cuotaLiquida)),
    cuotaDiferencial: sumaN(cs.map(c => c.cuotaDiferencial)),
    avisos: x.avisos,
  }
}

// ── Catálogo de palancas (datos, no prosa) ──────────────────────────────────────────────────
export type Nivel = 'seguro' | 'probable' | 'suposicion'
export type PalancaId = 'individual' | 'plan_propio_alberto' | 'plan_propio_pilar' | 'plan_conyuge' | 'donativos' | 'compras' | 'bustos_pilar'
export type DefPalanca = {
  id: PalancaId; nombre: string
  efecto: 'eleccion' | 'reduccion_base' | 'deduccion_cuota' | 'gasto_bloque' | 'reasignacion'
  costeCaja: 'cero' | 'total'; riesgo: 'nulo' | 'bajo' | 'medio' | 'alto'; nivel: Nivel; plazo: string; norma: string
}
export const CATALOGO_PALANCAS: Record<PalancaId, DefPalanca> = {
  individual: { id: 'individual', nombre: 'Declarar en individual', efecto: 'eleccion', costeCaja: 'cero', riesgo: 'nulo', nivel: 'probable', plazo: 'Declaración abr–jun', norma: 'LIRPF art. 82-84' },
  plan_propio_alberto: { id: 'plan_propio_alberto', nombre: 'Plan de pensiones propio (Alberto)', efecto: 'reduccion_base', costeCaja: 'total', riesgo: 'bajo', nivel: 'seguro', plazo: 'Cargado antes del 31/12', norma: 'LIRPF art. 51-52 (30 % rend. trabajo + actividad, tope 1.500€)' },
  plan_propio_pilar: { id: 'plan_propio_pilar', nombre: 'Plan de pensiones propio (Pilar)', efecto: 'reduccion_base', costeCaja: 'total', riesgo: 'bajo', nivel: 'seguro', plazo: 'Cargado antes del 31/12', norma: 'LIRPF art. 51-52 (30 % rend. trabajo + actividad, tope 1.500€)' },
  plan_conyuge: { id: 'plan_conyuge', nombre: 'Alberto aporta al plan de Pilar', efecto: 'reduccion_base', costeCaja: 'total', riesgo: 'bajo', nivel: 'probable', plazo: 'Cargado antes del 31/12', norma: 'LIRPF art. 51.7 (tope 1.000€; cónyuge < 8.000€ de rend. trabajo + actividad)' },
  donativos: { id: 'donativos', nombre: 'Donativos (250€ por persona)', efecto: 'deduccion_cuota', costeCaja: 'total', riesgo: 'nulo', nivel: 'seguro', plazo: 'Pagado antes del 31/12', norma: 'Ley 49/2002 art. 19 (80 % hasta 250€, 40 % resto)' },
  compras: { id: 'compras', nombre: 'Adelantar compras previstas', efecto: 'gasto_bloque', costeCaja: 'total', riesgo: 'bajo', nivel: 'probable', plazo: 'Entregado/ejecutado y facturado antes del 31/12', norma: 'LIRPF art. 23.1 (reparación con límite de ingresos; amortización 3 %/10 %)' },
  bustos_pilar: { id: 'bustos_pilar', nombre: 'Bustos a nombre de Pilar (opción a estudiar)', efecto: 'reasignacion', costeCaja: 'cero', riesgo: 'medio', nivel: 'probable', plazo: 'Novación del contrato; no para 2026', norma: 'LIRPF art. 25.4 (capital mobiliario)' },
}

export type ResultadoPalanca = {
  id: PalancaId
  /** € movidos (aportación, donativo, compra…). */
  importe: number
  /** Límite legal del importe (null = sin dato). */
  limite: number | null
  ahorro: { individual: number | null; conjunta: number | null }
  coste: number
  /** ahorro (en el modo más barato) / coste. */
  ahorroPorEuro: number | null
  /** ahorro ≥ coste en caja (sin contar que el gasto se iba a hacer igual). */
  compensa: boolean | null
  elegible: boolean | null
  motivo: string
}
export type ResultadoCompra = {
  id: string
  tipo: TipoCompra | null
  fraccion2026: number | null
  gasto2026: number | null
  /** Bajada de cuota 2026 si se hace antes del 31/12 (modo individual). */
  ahorro2026: number | null
  /** El mismo gasto deducido en 2027 al marginal de 2027. */
  ahorroSiEn2027: number | null
  /** ahorro2026 − ahorroSiEn2027 (lo que gana adelantar). */
  ventajaAdelantar: number | null
  motivo: string
}

export type ResultadoEscenario = {
  escenario: EscenarioId | string
  etiqueta: string
  conjunta: ResultadoDeclaracion
  individual: ResultadoDeclaracion
  masBarata: Modo | null
  /** cuota conjunta − cuota individual (positivo = individual más barata). */
  ahorroIndividual: number | null
  margenUmbralAlberto: number | null
  palancas: ResultadoPalanca[]
  compras: ResultadoCompra[]
  bustosPilar: { individual: ResultadoDeclaracion; ahorroVsActual: number | null } | null
}

const dif = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b)

/** Palancas propuestas por defecto: el límite legal de cada plan y 250€ de donativo por cabeza. */
export function palancasPorDefecto(e: EntradaSimulador): Palancas {
  const l = limitesPlanes(e)
  return {
    planPropio: { alberto: l.propio.alberto ?? 0, pilar: l.propio.pilar ?? 0 },
    planConyuge: l.conyuge ?? 0,
    donativos: { alberto: 250, pilar: 250 },
    compras: [],
  }
}

export function simularEscenario(e: EntradaSimulador, propuestas: Palancas, etiqueta = '', escenario: string = ''): ResultadoEscenario {
  const conjunta = declarar(e, SIN_PALANCAS, 'conjunta')
  const individual = declarar(e, SIN_PALANCAS, 'individual')
  const ahorroIndividual = dif(conjunta.cuotaLiquida, individual.cuotaLiquida)
  const masBarata: Modo | null = ahorroIndividual == null ? null : ahorroIndividual > 0 ? 'individual' : 'conjunta'
  const alberto = individual.contribuyentes.find(c => c.titular === 'alberto')!

  const ahorroDe = (pal: Palancas) => ({
    individual: dif(individual.cuotaLiquida, declarar(e, pal, 'individual').cuotaLiquida),
    conjunta: dif(conjunta.cuotaLiquida, declarar(e, pal, 'conjunta').cuotaLiquida),
  })
  const lim = limitesPlanes(e)
  const fila = (id: PalancaId, importe: number, limite: number | null, pal: Palancas, motivo: string): ResultadoPalanca => {
    const ahorro = ahorroDe(pal)
    const ref = masBarata === 'conjunta' ? ahorro.conjunta : ahorro.individual
    const coste = CATALOGO_PALANCAS[id].costeCaja === 'cero' ? 0 : importe
    const elegible = limite == null ? null : limite > 0 && importe > 0
    return {
      id, importe, limite, ahorro, coste,
      ahorroPorEuro: ref == null || coste <= 0 ? null : ref / coste,
      compensa: ref == null ? null : ref >= coste && ref > 0,
      elegible, motivo,
    }
  }
  const usa = (patch: Partial<Palancas>): Palancas => ({ ...SIN_PALANCAS, ...patch })
  const pA = Math.min(propuestas.planPropio.alberto, lim.propio.alberto ?? 0)
  const pP = Math.min(propuestas.planPropio.pilar, lim.propio.pilar ?? 0)
  const pC = Math.min(propuestas.planConyuge, lim.conyuge ?? 0)
  const palancas: ResultadoPalanca[] = [
    {
      id: 'individual', importe: 0, limite: null, ahorro: { individual: ahorroIndividual, conjunta: null }, coste: 0,
      ahorroPorEuro: null, compensa: ahorroIndividual == null ? null : ahorroIndividual > 0, elegible: true,
      motivo: 'Elección en la declaración; misma base total en ambos modos.',
    },
    fila('plan_propio_alberto', pA, lim.propio.alberto, usa({ planPropio: { alberto: pA, pilar: 0 } }),
      lim.propio.alberto === 0 ? 'Rend. trabajo + actividad ≤ 0: límite 0 (el exceso no reduce este año).' : '30 % de rend. trabajo + actividad, tope 1.500€.'),
    fila('plan_propio_pilar', pP, lim.propio.pilar, usa({ planPropio: { alberto: 0, pilar: pP } }), '30 % de rend. trabajo + actividad, tope 1.500€.'),
    fila('plan_conyuge', pC, lim.conyuge, usa({ planConyuge: pC }),
      lim.conyuge == null ? 'Sin dato de la renta de Pilar.' : lim.conyuge > 0 ? 'Pilar < 8.000€ de rend. trabajo + actividad: hasta 1.000€.' : 'Pilar ≥ 8.000€: no aplica.'),
    fila('donativos', propuestas.donativos.alberto + propuestas.donativos.pilar, null, usa({ donativos: propuestas.donativos }),
      'Deducción en cuota (no baja la base): 80 % de los primeros 250€ por persona, 40 % el resto.'),
  ]
  // donativos: el límite no aplica como «elegibilidad»
  const don = palancas.find(x => x.id === 'donativos')!
  don.elegible = don.importe > 0

  // Compras previstas, una a una (ahorro 2026 vs 2027).
  const p27 = e.params2027 ?? e.params
  const compras: ResultadoCompra[] = propuestas.compras.map(c => {
    const f = fraccionDeducible(c, e.params.anio)
    if (f == null) return { id: c.id, tipo: null, fraccion2026: null, gasto2026: null, ahorro2026: null, ahorroSiEn2027: null, ventajaAdelantar: null, motivo: 'Sin clasificar: no cuenta.' }
    const g = gastoCompra2026(e, c, {})
    const ahorro2026 = g == null ? null : dif(individual.cuotaLiquida, declarar(e, usa({ compras: [c] }), 'individual').cuotaLiquida)
    let ahorroSiEn2027: number | null = null
    if (g != null) {
      ahorroSiEn2027 = 0
      const tit = e.propiedades.find(x => x.id === c.propertyId)?.titulares ?? []
      for (const t of tit) {
        const ct = individual.contribuyentes.find(x => x.titular === t.titular)
        if (!ct || ct.baseLiquidable == null) { ahorroSiEn2027 = null; break }
        ahorroSiEn2027 += (g * t.porcentaje) / 100 * tipoMarginal(ct.baseLiquidable, ct.minimo, p27)
      }
    }
    const motivo = c.tipo === 'reparacion' || c.tipo === 'consumible'
      ? 'Gasto íntegro en 2026 (reparación: con el límite de ingresos del inmueble).'
      : c.tipo === 'escaso_valor' && c.importe < 300 ? 'Bien <300€ como gasto (criterio discutible en capital inmobiliario).'
        : 'Se amortiza: casi nada baja en 2026; adelantar no cambia el total.'
    return { id: c.id, tipo: c.tipo, fraccion2026: f, gasto2026: g, ahorro2026, ahorroSiEn2027, ventajaAdelantar: dif(ahorro2026, ahorroSiEn2027), motivo }
  })
  if (propuestas.compras.length) {
    const total = propuestas.compras.reduce((s, c) => s + c.importe, 0)
    palancas.push(fila('compras', total, null, usa({ compras: propuestas.compras }), 'Solo compensa adelantar lo que se iba a comprar igualmente.'))
    palancas[palancas.length - 1].elegible = true
  }

  // Escenario opcional: Bustos a nombre de Pilar (solo cambia la individual).
  const ids = e.idsBustos ?? e.periodo.lineas.filter(l => l.bloque === 'capital_mobiliario').map(l => l.propertyId)
  let bustosPilar: ResultadoEscenario['bustosPilar'] = null
  if (ids.length) {
    const reasignar = Object.fromEntries(ids.map(id => [id, 'pilar' as Titular]))
    const ind = declarar(e, usa({ reasignar }), 'individual')
    bustosPilar = { individual: ind, ahorroVsActual: dif(individual.cuotaLiquida, ind.cuotaLiquida) }
  }

  return { escenario, etiqueta, conjunta, individual, masBarata, ahorroIndividual, margenUmbralAlberto: alberto.distanciaUmbral, palancas, compras, bustosPilar }
}

/** Un resultado por escenario de `estimarCierre` (base, ocupación tipo, pesimista). */
export function simularEstimacion(
  real: Periodo, est: Estimacion, base: Omit<EntradaSimulador, 'periodo'>, propuestas?: (e: EntradaSimulador) => Palancas,
): ResultadoEscenario[] {
  return est.escenarios.map(x => {
    const e: EntradaSimulador = { ...base, periodo: periodoCierre(real, x, base.params.anio) }
    return simularEscenario(e, (propuestas ?? palancasPorDefecto)(e), x.etiqueta, x.id)
  })
}

// Simulador «¿y si…?» del panel fiscal: partidas HIPOTÉTICAS que se suman a la base real y recalculan el
// resultado de la declaración (individual Alberto, Pilar, conjunta). PURO (sin BD, sin reloj, sin React) y
// pensado para el CLIENTE: el servidor pasa la entrada real, aquí se suman las hipotéticas. No escribe nada.
//
// Reutiliza el motor: `declarar` (compras/planes/donativos/gasto de correduría vía `Palancas`) y
// `calcularResultadoDeclaracion` (deducciones, retenciones, resultado). Lo único propio es traducir cada
// partida a palancas y respetar los límites legales de los planes.
import {
  SIN_PALANCAS, limitePlanPropio, limitesPlanes,
  type CompraPrevista, type EntradaSimulador, type Palancas, type Titular,
} from './simulador-irpf.ts'
import { calcularResultadoDeclaracion, type ContextoResultado, type ResultadoFinal } from './resultado-declaracion.ts'

export type TipoPartida = 'gasto_piso' | 'gasto_correduria' | 'plan_pensiones' | 'plan_empleo_autonomo' | 'donativo'
export const TIPOS_PARTIDA: { id: TipoPartida; etiqueta: string }[] = [
  { id: 'gasto_piso', etiqueta: 'Gasto de un piso' },
  { id: 'gasto_correduria', etiqueta: 'Gasto de la correduría' },
  { id: 'plan_pensiones', etiqueta: 'Plan de pensiones (individual)' },
  { id: 'plan_empleo_autonomo', etiqueta: 'Plan de empleo de autónomos (extra)' },
  { id: 'donativo', etiqueta: 'Donativo' },
]
/**
 * Aportación adicional de autónomos a planes de pensiones de empleo (simplificados/de asociaciones de autónomos):
 * hasta 4.250 € además de los 1.500 € del plan individual (LIRPF art. 52.1, redacción de la Ley 31/2022 de PGE
 * 2023 vigente en prórroga), siempre dentro del 30 % de los rendimientos netos de trabajo + actividades.
 * [Probable: revisar con la asesoría antes de aportar.]
 */
export const LIMITE_PLAN_EMPLEO_AUTONOMO = 4250
export const MAX_PARTIDAS = 30
export const MAX_IMPORTE = 10_000_000

export type PartidaHipotetica = {
  id: string
  concepto: string
  /** € (> 0). */
  importe: number
  tipo: TipoPartida
  /** Solo gasto_piso. */
  propertyId?: string
  /** plan_pensiones, plan_empleo_autonomo y donativo. */
  titular?: Titular
}

/** Valida lo que viene de localStorage (o de un formulario): lo que no encaja se descarta, nunca se «arregla». */
export function normalizarPartidas(raw: unknown): PartidaHipotetica[] {
  if (!Array.isArray(raw)) return []
  const out: PartidaHipotetica[] = []
  const tipos = new Set<string>(TIPOS_PARTIDA.map(t => t.id))
  for (const x of raw) {
    if (out.length >= MAX_PARTIDAS) break
    if (x == null || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const importe = typeof o.importe === 'number' ? o.importe : NaN
    if (!Number.isFinite(importe) || importe <= 0 || importe > MAX_IMPORTE) continue
    if (typeof o.tipo !== 'string' || !tipos.has(o.tipo)) continue
    if (typeof o.id !== 'string' || !o.id) continue
    const tipo = o.tipo as TipoPartida
    const concepto = typeof o.concepto === 'string' ? o.concepto.trim().slice(0, 80) : ''
    const titular = o.titular === 'alberto' || o.titular === 'pilar' ? o.titular : undefined
    const propertyId = typeof o.propertyId === 'string' && o.propertyId ? o.propertyId : undefined
    if (tipo === 'gasto_piso' && !propertyId) continue
    if ((tipo === 'plan_pensiones' || tipo === 'plan_empleo_autonomo' || tipo === 'donativo') && !titular) continue
    out.push({ id: o.id, concepto, importe, tipo, ...(propertyId ? { propertyId } : {}), ...(titular ? { titular } : {}) })
  }
  return out
}

export type AplicacionPartida = { id: string; pedido: number; aplicado: number | null; nota?: string }

/** Traduce las partidas a palancas del motor. Los planes se recortan al límite legal (y se dice). */
export function palancasDesdePartidas(
  e: EntradaSimulador, ps: PartidaHipotetica[],
): { entrada: EntradaSimulador; palancas: Palancas; aplicadas: AplicacionPartida[]; avisos: string[] } {
  const avisos: string[] = []
  const aplicadas: AplicacionPartida[] = []
  const compras: CompraPrevista[] = []
  const donativos = { alberto: 0, pilar: 0 }
  let gastoCorreduria = 0
  const plan = { alberto: { ord: 0, emp: 0 }, pilar: { ord: 0, emp: 0 } }
  const nombre = (t: Titular) => (t === 'alberto' ? 'Alberto' : 'Pilar')

  for (const p of ps) {
    switch (p.tipo) {
      case 'gasto_piso': {
        const piso = e.propiedades.find(x => x.id === p.propertyId)
        if (!piso) { avisos.push(`«${p.concepto || 'Gasto de piso'}»: piso desconocido, no se aplica.`); aplicadas.push({ id: p.id, pedido: p.importe, aplicado: null, nota: 'piso desconocido' }); break }
        // Gasto corriente del año (criterio de Alberto: máximo gasto deducible; nunca amortizable de oficio).
        compras.push({ id: p.id, descripcion: p.concepto || 'Gasto hipotético', importe: p.importe, propertyId: p.propertyId as string, tipo: 'reparacion', fecha: `${e.params.anio}-12-15` })
        aplicadas.push({ id: p.id, pedido: p.importe, aplicado: p.importe, nota: piso.bloque === 'capital_inmobiliario' ? 'sujeto al límite de reparación y conservación (ingresos − intereses)' : undefined })
        break
      }
      case 'gasto_correduria': gastoCorreduria += p.importe; aplicadas.push({ id: p.id, pedido: p.importe, aplicado: p.importe }); break
      case 'donativo': donativos[p.titular as Titular] += p.importe; aplicadas.push({ id: p.id, pedido: p.importe, aplicado: p.importe }); break
      case 'plan_pensiones': plan[p.titular as Titular].ord += p.importe; break
      case 'plan_empleo_autonomo': plan[p.titular as Titular].emp += p.importe; break
    }
  }

  // Planes: ordinario ≤ 1.500 €; empleo de autónomos ≤ 4.250 € extra; ambos dentro del 30 % de los rendimientos.
  const lim = limitesPlanes(e, gastoCorreduria)
  const sinTope = { ...e.params, planPropioTope: Number.POSITIVE_INFINITY }
  const corrNeta = e.periodo.bloques.actividad_correduria
  const act = { alberto: corrNeta == null ? null : corrNeta - gastoCorreduria, pilar: e.periodo.bloques.actividad_pilar }
  const planPropio = { alberto: 0, pilar: 0 }
  let hayEmpleo = false
  for (const t of ['alberto', 'pilar'] as const) {
    const { ord, emp } = plan[t]
    if (ord <= 0 && emp <= 0) continue
    const l30 = limitePlanPropio(e.rendimientosTrabajo[t], act[t], sinTope)
    const lOrd = lim.propio[t]
    if (l30 == null || lOrd == null) {
      avisos.push(`Plan de pensiones de ${nombre(t)}: límite sin dato (falta algún rendimiento), no se aplica.`)
      ps.filter(p => (p.tipo === 'plan_pensiones' || p.tipo === 'plan_empleo_autonomo') && p.titular === t)
        .forEach(p => aplicadas.push({ id: p.id, pedido: p.importe, aplicado: null, nota: 'límite sin dato' }))
      continue
    }
    const ordOk = Math.min(ord, lOrd)
    const empOk = Math.min(emp, LIMITE_PLAN_EMPLEO_AUTONOMO)
    const total = Math.min(ordOk + empOk, l30)
    // Reparto del recorte entre las partidas (ordinario primero). El tope ordinario y el de empleo son del TOTAL del titular.
    let restoOrd = Math.min(lOrd, total)
    for (const p of ps.filter(x => x.titular === t && x.tipo === 'plan_pensiones')) {
      const a = Math.min(p.importe, Math.max(0, restoOrd))
      restoOrd -= a
      aplicadas.push({ id: p.id, pedido: p.importe, aplicado: a, nota: a < p.importe ? `límite legal del plan individual ${Math.round(lOrd)}€ (total de sus aportaciones)` : undefined })
    }
    let restoEmp = Math.min(LIMITE_PLAN_EMPLEO_AUTONOMO, total - (Math.min(lOrd, total) - restoOrd))
    for (const p of ps.filter(x => x.titular === t && x.tipo === 'plan_empleo_autonomo')) {
      const a = Math.min(p.importe, Math.max(0, restoEmp))
      restoEmp -= a
      aplicadas.push({ id: p.id, pedido: p.importe, aplicado: a, nota: a < p.importe ? `límite legal (4.250€ extra en total, 30 % de rendimientos)` : undefined })
    }
    if (total < ord + emp) avisos.push(`Plan de pensiones de ${nombre(t)}: se aplican ${Math.round(total)}€ de ${Math.round(ord + emp)}€ por el límite legal.`)
    planPropio[t] = total
    if (emp > 0) hayEmpleo = true
  }

  // El motor recorta `planPropio` a su propio tope (1.500 €): con plan de empleo se amplía para esta simulación.
  const entrada: EntradaSimulador = hayEmpleo
    ? { ...e, params: { ...e.params, planPropioTope: e.params.planPropioTope + LIMITE_PLAN_EMPLEO_AUTONOMO } }
    : e
  const palancas: Palancas = { ...SIN_PALANCAS, compras, donativos, planPropio, ...(gastoCorreduria > 0 ? { gastoCorreduria } : {}) }
  return { entrada, palancas, aplicadas, avisos }
}

const dif = (a: number | null, b: number | null) => (a == null || b == null ? null : Math.round((a - b) * 100) / 100)
export type Delta = {
  /** Positivo = baja lo que pagas (ahorro). */
  conjunta: number | null
  individual: number | null
  alberto: number | null
  pilar: number | null
  /** Ahorro de la mejor modalidad antes → la mejor después. */
  mejor: number | null
}
export type ResultadoSimulacion = {
  antes: ResultadoFinal
  despues: ResultadoFinal
  delta: Delta
  aplicadas: AplicacionPartida[]
  avisos: string[]
}

const resultadoDe = (r: ResultadoFinal, quien: 'alberto' | 'pilar') => r.individual.contribuyentes.find(c => c.titular === quien)?.resultado ?? null
const mejorDe = (r: ResultadoFinal): number | null =>
  r.conjunta.resultado == null || r.individual.resultado == null ? null : Math.min(r.conjunta.resultado, r.individual.resultado)

/** Antes (datos reales) y después (con las hipotéticas) del resultado de la declaración. */
export function simularPartidas(e: EntradaSimulador, ctx: ContextoResultado, ps: PartidaHipotetica[]): ResultadoSimulacion {
  const antes = calcularResultadoDeclaracion(e, SIN_PALANCAS, ctx)
  const { entrada, palancas, aplicadas, avisos } = palancasDesdePartidas(e, ps)
  const despues = calcularResultadoDeclaracion(entrada, palancas, ctx)
  return {
    antes, despues, aplicadas, avisos,
    delta: {
      conjunta: dif(antes.conjunta.resultado, despues.conjunta.resultado),
      individual: dif(antes.individual.resultado, despues.individual.resultado),
      alberto: dif(resultadoDe(antes, 'alberto'), resultadoDe(despues, 'alberto')),
      pilar: dif(resultadoDe(antes, 'pilar'), resultadoDe(despues, 'pilar')),
      mejor: dif(mejorDe(antes), mejorDe(despues)),
    },
  }
}

// Panel fiscal (F2): helpers PUROS de presentación sobre el motor `simulador-irpf.ts` y la base por devengo.
// Sin BD, sin reloj (el «hoy» se inyecta) y sin React: se usa igual en el servidor (armarPanel) y en el
// cliente (los interruptores del simulador recalculan con `declarar`, la MISMA función que el servidor).
// Regla NULL: un dato que no se sabe viaja como `null` («sin dato»); nunca se sustituye por 0.
import { REDUCCION_CONJUNTA, UMBRAL_TARIFA_ALTA, esProvisional, interesesParaSimulador, periodoCierre, type AvisosDatos, type MesBase } from './base-fiscal-devengo.ts'
import type { BaseDevengo } from './base-fiscal-devengo-db.ts'
import type { Descendiente } from './fiscal-deducciones.ts'
import {
  CATALOGO_PALANCAS, SIN_PALANCAS, declarar, parametrosIrpf,
  type CompraPrevista, type EntradaSimulador, type LineaTramo, type Modo, type Palancas, type PalancaId, type ResultadoContribuyente,
  type ResultadoDeclaracion, type ResultadoEscenario, type TipoCompra,
} from './simulador-irpf.ts'

export const UMBRAL = UMBRAL_TARIFA_ALTA
/** «Cerca» del umbral = margen por debajo de este importe (€). Cepo en fiscal-panel.test.ts. */
export const MARGEN_CERCA = 3000

// ── Selección de modalidad ──────────────────────────────────────────────────────────────────
export type Seleccion = 'conjunta' | 'alberto' | 'pilar'
export const SELECCIONES: { id: Seleccion; etiqueta: string }[] = [
  { id: 'conjunta', etiqueta: 'Conjunta' }, { id: 'alberto', etiqueta: 'Alberto' }, { id: 'pilar', etiqueta: 'Pilar' },
]
export const modoDe = (s: Seleccion): Modo => (s === 'conjunta' ? 'conjunta' : 'individual')
export function contribuyenteDe(d: ResultadoDeclaracion, s: Seleccion): ResultadoContribuyente | null {
  return d.contribuyentes.find(c => (s === 'conjunta' ? c.titular === 'unidad_familiar' : c.titular === s)) ?? null
}

// ── Semáforo ────────────────────────────────────────────────────────────────────────────────
export type NivelUmbral = 'sin_dato' | 'seguro' | 'cerca' | 'pasa'
/**
 * `cierre` = base liquidable estimada a 31/12; `peor` = la más alta del rango de escenarios (peor caso).
 * pasa: el cierre central supera 60.000€ · cerca: margen < MARGEN_CERCA o el peor caso cruza el umbral.
 * 60.000,00€ exactos siguen al 37 % (no «pasa»). null → sin_dato (nunca verde).
 */
export function nivelUmbral(cierre: number | null, peor: number | null, margenCerca = MARGEN_CERCA, umbral = UMBRAL): NivelUmbral {
  if (cierre == null) return 'sin_dato'
  if (cierre > umbral) return 'pasa'
  const peorCaso = peor == null ? cierre : Math.max(peor, cierre)
  if (peorCaso > umbral || umbral - cierre < margenCerca) return 'cerca'
  return 'seguro'
}

export function rangoDe(valores: (number | null)[]): { min: number; max: number; completo: boolean } | null {
  const v = valores.filter((x): x is number => x != null)
  if (!v.length) return null
  return { min: Math.min(...v), max: Math.max(...v), completo: v.length === valores.length }
}

// ── Datos que viajan del servidor al cliente ────────────────────────────────────────────────
export type CierrePanel = { id: string; etiqueta: string; entrada: EntradaSimulador; provisional: boolean }
export type PanelDatos = {
  anio: number
  hoy: string
  entradaHoy: EntradaSimulador
  /** [0] = escenario base. */
  cierres: CierrePanel[]
  porMes: { mes: string; total: number | null }[]
  avisos: AvisosDatos
  propiedades: { id: string; nombre: string }[]
}

export function armarPanel(b: BaseDevengo, ctx: { descendientes: Descendiente[]; conyugeTrabaja: boolean }): PanelDatos {
  const base = {
    propiedades: b.propiedades,
    params: parametrosIrpf(b.anio, ctx.descendientes),
    // Alberto: solo actividad (autónomo) [Suposición]; Pilar: si su cónyuge trabaja por cuenta ajena no se sabe → null.
    rendimientosTrabajo: { alberto: 0, pilar: ctx.conyugeTrabaja ? null : 0 },
    // Retenciones y pagos fraccionados: incompletos → null (el panel no enseña cuota diferencial).
    retenciones: { alberto: null, pilar: null },
    pagosFraccionados: { alberto: null, pilar: null },
    // Alberto 31/10/2026: Socorro y Dúplex sin hipoteca → 0€ (no «sin dato»); ver INTERESES_FINANCIACION.
    intereses: interesesParaSimulador(),
  } satisfies Omit<EntradaSimulador, 'periodo'>
  return {
    anio: b.anio, hoy: b.hoy,
    entradaHoy: { ...base, periodo: b.hastaHoy },
    cierres: b.estimacion.escenarios.map(x => ({
      id: x.id, etiqueta: x.etiqueta, provisional: esProvisional(x),
      entrada: { ...base, periodo: periodoCierre(b.hastaHoy, x, b.anio) },
    })),
    porMes: b.hastaHoy.porMes.map((m: MesBase) => ({ mes: m.mes, total: m.total })),
    avisos: b.avisos,
    propiedades: b.propiedades.map(p => ({ id: p.id, nombre: p.nombre })),
  }
}

export function hayAvisos(a: AvisosDatos): boolean {
  return a.cuentasSinActualizar.length > 0 || a.mesesSinLimpieza.length > 0 || a.mesesSinSuministros.length > 0
}
export function contarAvisos(a: AvisosDatos): number {
  return a.cuentasSinActualizar.length + (a.mesesSinLimpieza.length ? 1 : 0) + (a.mesesSinSuministros.length ? 1 : 0)
}

// ── Serie acumulada mensual ─────────────────────────────────────────────────────────────────
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export type PuntoSerie = {
  mes: string; etiqueta: string
  /** Base liquidable (conjunta) acumulada REAL; null = sin dato o mes aún no transcurrido. */
  real: number | null
  /** Proyección (incluye el último punto real para unir los trazos). */
  proy: number | null
  /** [mín, máx] del rango de escenarios; null = sin rango. */
  banda: [number, number] | null
}
/**
 * Base liquidable conjunta acumulada mes a mes (base general − 3.400€, mínimo 0).
 * Meses con total null rompen la serie (acumulado desconocido a partir de ahí). La proyección une el último
 * punto real con el cierre del escenario base en línea recta; la banda se abre hasta [mín, máx] de los escenarios.
 */
export function serieAcumulada(
  porMes: { mes: string; total: number | null }[], cierreBase: number | null, rango: { min: number; max: number } | null,
  anio: number, reduccion = REDUCCION_CONJUNTA,
): PuntoSerie[] {
  const liq = (x: number) => Math.max(0, x - reduccion)
  const real: (number | null)[] = Array(12).fill(null)
  let acum: number | null = 0
  let ultimo = -1
  let roto = false
  porMes.forEach(m => {
    const i = Number(m.mes.slice(5, 7)) - 1
    if (m.mes.slice(0, 4) !== String(anio) || i < 0 || i > 11) return
    acum = acum == null || m.total == null ? null : acum + m.total
    real[i] = acum == null ? null : liq(acum)
    if (acum == null) roto = true
    if (acum != null) ultimo = i
  })
  const quedanSinReal = ultimo < 0 ? -1 : ultimo
  const origen = ultimo < 0 ? 0 : (real[ultimo] as number)
  // Un mes sin dato deja el acumulado desconocido: no se proyecta desde un origen que no se sabe.
  const hayOrigen = !roto && (ultimo >= 0 || porMes.length === 0)
  return real.map((r, i) => {
    let proy: number | null = null
    let banda: [number, number] | null = null
    if (hayOrigen && cierreBase != null && i >= quedanSinReal) {
      const t = (i - quedanSinReal) / (11 - quedanSinReal || 1)
      const lin = (destino: number) => origen + (liq(destino) - origen) * t
      proy = i === quedanSinReal ? origen : lin(cierreBase)
      if (rango && i > quedanSinReal) banda = [lin(rango.min), lin(rango.max)]
      else if (rango) banda = [origen, origen]
    }
    return { mes: `${anio}-${String(i + 1).padStart(2, '0')}`, etiqueta: MESES[i], real: r, proy: ultimo >= 0 && i < ultimo ? null : proy, banda }
  })
}

// ── Palancas activas / compras ──────────────────────────────────────────────────────────────
export type PalancaSimulable = Extract<PalancaId, 'plan_propio_alberto' | 'plan_propio_pilar' | 'plan_conyuge' | 'donativos' | 'compras'>
export const PALANCAS_SIMULABLES: PalancaSimulable[] = ['plan_propio_alberto', 'plan_propio_pilar', 'plan_conyuge', 'donativos', 'compras']
export type Activas = Partial<Record<PalancaSimulable, boolean>>

/** Palancas del motor para los interruptores marcados; `def` = propuesta por defecto (límites legales, 250€ por cabeza). */
export function palancasActivas(activas: Activas, def: Palancas, compras: CompraPrevista[]): Palancas {
  return {
    planPropio: { alberto: activas.plan_propio_alberto ? def.planPropio.alberto : 0, pilar: activas.plan_propio_pilar ? def.planPropio.pilar : 0 },
    planConyuge: activas.plan_conyuge ? def.planConyuge : 0,
    donativos: { alberto: activas.donativos ? def.donativos.alberto : 0, pilar: activas.donativos ? def.donativos.pilar : 0 },
    compras: activas.compras ? compras : [],
  }
}

export type CompraGuardada = { id: string; descripcion: string; importe: number; propertyId: string; tipo: TipoCompra | null; fechaPrevista: string | null }
/** Compra → entrada del motor evaluada «antes del 31/12»: fecha prevista si es del año; si no, 15/12. Tipo null se conserva (no cuenta). */
export function comprasParaMotor(cs: CompraGuardada[], anio: number): CompraPrevista[] {
  return cs.map(c => ({
    id: c.id, descripcion: c.descripcion, importe: c.importe, propertyId: c.propertyId, tipo: c.tipo,
    fecha: c.fechaPrevista && c.fechaPrevista.startsWith(`${anio}-`) ? c.fechaPrevista : `${anio}-12-15`,
  }))
}

// ── Lista de acciones priorizada ────────────────────────────────────────────────────────────
export type Accion = {
  id: PalancaId
  titulo: string
  /** € que baja la cuota; null = sin dato. */
  ahorro: number | null
  riesgo: 'nulo' | 'bajo' | 'medio' | 'alto'
  /** Ahorro / dinero movido. ≥ 1 ⇒ compensa en caja (único caso en que sale en verde). */
  ahorroPorEuro: number | null
  verde: boolean
  /** dd/mm/aaaa o texto del plazo. */
  plazo: string
  diasRestantes: number | null
  motivo: string
}
const fechaEs = (iso: string) => iso.split('-').reverse().join('/')
export function diasHasta(hoy: string, fin: string): number {
  return Math.max(0, Math.round((Date.parse(fin) - Date.parse(hoy)) / 86400000))
}

/** Ahorro de cuota de cada palanca por separado PARA la modalidad elegida (misma `declarar` que el resultado total). */
export function ahorroPorPalanca(e: EntradaSimulador, def: Palancas, compras: CompraPrevista[], sel: Seleccion): Record<PalancaSimulable, number | null> {
  const modo = modoDe(sel)
  const sin = contribuyenteDe(declarar(e, SIN_PALANCAS, modo), sel)?.cuotaLiquida ?? null
  return Object.fromEntries(PALANCAS_SIMULABLES.map(id => {
    const con = contribuyenteDe(declarar(e, palancasActivas({ [id]: true }, def, compras), modo), sel)?.cuotaLiquida ?? null
    return [id, sin == null || con == null ? null : sin - con]
  })) as Record<PalancaSimulable, number | null>
}

/** Cuota íntegra conjunta vs individual (misma base total en ambas). null si falta alguna. */
export function comparar(conjunta: ResultadoDeclaracion, individual: ResultadoDeclaracion) {
  const c = conjunta.cuotaIntegra, i = individual.cuotaIntegra
  return {
    conjunta: c, individual: i,
    masBarata: c == null || i == null ? null : i < c ? ('individual' as const) : ('conjunta' as const),
    ahorro: c == null || i == null ? null : Math.abs(c - i),
  }
}

/** `ahorros` = ahorro por palanca para la modalidad elegida (ver `ahorroPorPalanca`). */
export function construirAcciones(res: ResultadoEscenario, ahorros: Partial<Record<PalancaId, number | null>>, hoy: string, anio: number): Accion[] {
  const fin = `${anio}-12-31`
  const out: Accion[] = []
  for (const p of res.palancas) {
    const def = CATALOGO_PALANCAS[p.id]
    if (p.id === 'individual') {
      if (res.ahorroIndividual != null && res.ahorroIndividual <= 0) continue
      out.push({ id: p.id, titulo: def.nombre, ahorro: res.ahorroIndividual, riesgo: def.riesgo, ahorroPorEuro: null, verde: res.ahorroIndividual != null, plazo: def.plazo, diasRestantes: null, motivo: p.motivo })
      continue
    }
    if (p.elegible === false || p.importe <= 0) continue
    const ahorro = ahorros[p.id] ?? null
    if (ahorro != null && ahorro <= 0) continue
    const ape = ahorro == null || p.coste <= 0 ? null : ahorro / p.coste
    out.push({ id: p.id, titulo: def.nombre, ahorro, riesgo: def.riesgo, ahorroPorEuro: ape, verde: ape != null && ape >= 1, plazo: `hasta ${fechaEs(fin)}`, diasRestantes: diasHasta(hoy, fin), motivo: p.motivo })
  }
  return out.sort((a, b) => (b.ahorro ?? -Infinity) - (a.ahorro ?? -Infinity))
}

// ── Tabla de tramos ─────────────────────────────────────────────────────────────────────────
export type CeldaTramo = { base: number; cuota: number }
export type FilaTramo = { desde: number; hasta: number | null; tipo: number; celdas: (CeldaTramo | null)[] }
export type TablaTramosDatos = {
  filas: FilaTramo[]
  /** Por columna: cuota íntegra total (null = sin dato), cuota del mínimo que se resta y «cada 1.000€». */
  totales: ({ cuotaIntegra: number; minimoCuota: number; cada1000: number | null; baseLiquidable: number } | null)[]
}
/** Una columna por contribuyente (hoy | cierre | con palancas). Columna null = sin dato (celdas null, no 0). */
export function tablaTramos(cols: (ResultadoContribuyente | null)[]): TablaTramosDatos {
  const lineas = new Map<number, LineaTramo>()
  cols.forEach(c => c?.desglose.forEach(l => { if (!lineas.has(l.desde)) lineas.set(l.desde, l) }))
  const filas = [...lineas.values()].sort((a, b) => a.desde - b.desde).map(l => ({
    desde: l.desde, hasta: l.hasta, tipo: l.tipo,
    celdas: cols.map(c => (c == null || c.baseLiquidable == null ? null : (c.desglose.find(x => x.desde === l.desde) ?? { base: 0, cuota: 0 }))).map(x => (x ? { base: x.base, cuota: x.cuota } : null)),
  }))
  const totales = cols.map(c => {
    if (c == null || c.cuota == null || c.baseLiquidable == null) return null
    const suma = c.desglose.reduce((s, l) => s + l.cuota, 0)
    return { cuotaIntegra: c.cuota.total, minimoCuota: Math.max(0, suma - c.cuota.total), cada1000: c.cada1000, baseLiquidable: c.baseLiquidable }
  })
  return { filas, totales }
}

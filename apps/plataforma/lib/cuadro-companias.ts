// Cuadro de mando por compañía (07/11/2026) — lo PURO del lado de plataforma: leer la respuesta del
// puerto de asegura (`/api/operador/companias/cuadro`), agregar el libro de comisiones
// (`comisiones_devengo`), armar y ordenar la tabla resumen y decidir qué texto va con cada cifra.
// Sin red ni React: `node --test lib/cuadro-companias.test.ts`.
//
// 🚨 null ≠ 0. Un importe sin dato es «—» (NUNCA `eur(null)`, que pinta 0,00€); «sin importes de la
// compañía» no es 0 %; sin libro de comisiones leído no hay «liquidada» ni «cobrada».

import type { CuadroCompaniaAnio, SiniestralidadAnio } from '@central/module-seguros'
import { eur } from './dinero.ts'
import { brutoEfectivo } from './correduria/cuadre.ts'

// ─── Respuesta del puerto ────────────────────────────────────────────────────

export type CuadroLeido = {
  anio: number
  hoy: string
  truncado: boolean
  produccionTruncada: boolean
  companias: CuadroCompaniaAnio[]
  anterior: CuadroCompaniaAnio[]
  polizasSinCompania: number
  siniestrosSinCompania: number
}

export type RespuestaCuadro =
  | { estado: 'ok'; cuadro: CuadroLeido }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const esNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const numONull = (v: unknown) => v === null || esNum(v)

/** La forma mínima que la pantalla da por supuesta. Una compañía a medias se descarta entera. */
function companiaLegible(v: unknown): v is CuadroCompaniaAnio {
  const o = obj(v)
  if (!o || typeof o.companiaCodigoDgs !== 'string' || !esNum(o.anio)) return false
  const c = obj(o.cartera), p = obj(o.produccion), s = obj(o.siniestros), k = obj(o.comision)
  return !!c && !!p && !!s && !!k
    && esNum(c.polizas) && numONull(c.prima) && esNum(c.sinPrima) && Array.isArray(c.porRamo) && typeof c.fecha === 'string'
    && !!obj(p.nuevas) && !!obj(p.bajas) && esNum(p.baseInicio) && numONull(p.retencionPct)
    && esNum(s.total) && esNum(s.n) && esNum(s.conImporte) && numONull(s.ratioPct) && numONull(s.incurrido) && typeof s.estado === 'string'
    && numONull(k.devengada) && numONull(k.pctReal)
}

export function interpretarCuadro(status: number, json: unknown): RespuestaCuadro {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = obj(json) ?? {}
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404) return { estado: 'error', motivo: 'puerto_sin_desplegar' }
  if (status !== 200 || o.estado !== 'ok') {
    return { estado: 'error', motivo: typeof o.causa === 'string' ? o.causa : typeof o.motivo === 'string' ? o.motivo : `HTTP ${status}` }
  }
  if (!esNum(o.anio) || !Array.isArray(o.companias) || !Array.isArray(o.anterior)) return { estado: 'error', motivo: 'respuesta_ilegible' }
  // Una lista con elementos ilegibles NO se pinta recortada: sería una tabla con compañías que faltan.
  if (!o.companias.every(companiaLegible) || !o.anterior.every(companiaLegible)) return { estado: 'error', motivo: 'respuesta_ilegible' }
  return {
    estado: 'ok',
    cuadro: {
      anio: o.anio,
      hoy: typeof o.hoy === 'string' ? o.hoy : '',
      truncado: o.truncado === true,
      produccionTruncada: o.produccionTruncada === true,
      companias: o.companias as CuadroCompaniaAnio[],
      anterior: o.anterior as CuadroCompaniaAnio[],
      polizasSinCompania: esNum(o.polizasSinCompania) ? o.polizasSinCompania : 0,
      siniestrosSinCompania: esNum(o.siniestrosSinCompania) ? o.siniestrosSinCompania : 0,
    },
  }
}

// ─── Libro de comisiones (comisiones_devengo) ────────────────────────────────

export type FilaLibro = {
  compania_codigo: string
  periodo_inicio: string
  esperado_bruto: number | null
  liq_bruto: number | null
  liq_remesa: number | null
  banco_total: number | null
  leido_ok: boolean
}

export type LibroCompania = {
  periodos: number
  /** `null` = ningún periodo con ese eje (≠ 0). */
  devengado: number | null
  liquidado: number | null
  cobrado: number | null
  periodosSinLiquidar: number
  periodosSinBanco: number
  /** Algún periodo no se pudo leer entero. */
  noLeidos: number
  /** Los tres ejes cubren todos los periodos y se leyeron bien. */
  completo: boolean
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Suma por compañía de las filas de UN año. Compañía sin filas → no aparece (el llamador dice «sin libro»). */
export function agregarLibro(filas: readonly FilaLibro[]): Map<string, LibroCompania> {
  const m = new Map<string, LibroCompania & { _d: number; _l: number; _b: number }>()
  for (const f of filas) {
    const x = m.get(f.compania_codigo) ?? {
      periodos: 0, devengado: null, liquidado: null, cobrado: null, periodosSinLiquidar: 0, periodosSinBanco: 0,
      noLeidos: 0, completo: true, _d: 0, _l: 0, _b: 0,
    }
    x.periodos++
    if (!f.leido_ok) x.noLeidos++
    if (f.esperado_bruto !== null) { x._d += f.esperado_bruto; x.devengado = 0 }
    const liq = brutoEfectivo(f.liq_bruto, f.liq_remesa)
    if (liq === null) x.periodosSinLiquidar++; else { x._l += liq; x.liquidado = 0 }
    if (f.banco_total === null) x.periodosSinBanco++; else { x._b += f.banco_total; x.cobrado = 0 }
    m.set(f.compania_codigo, x)
  }
  return new Map([...m.entries()].map(([k, { _d, _l, _b, ...x }]) => [k, {
    ...x,
    devengado: x.devengado === null ? null : r2(_d),
    liquidado: x.liquidado === null ? null : r2(_l),
    cobrado: x.cobrado === null ? null : r2(_b),
    completo: x.noLeidos === 0 && x.periodosSinLiquidar === 0 && x.periodosSinBanco === 0,
  }]))
}

// ─── Formato ────────────────────────────────────────────────────────────────

/** Importe o «—». `eur(null)` pinta 0,00€, que aquí sería afirmar que no hay comisión. */
export const eurONada = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : eur(n))
export const enteroONada = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : n.toLocaleString('es-ES'))
export const pctONada = (n: number | null | undefined, dec = 1): string =>
  n === null || n === undefined ? '—' : `${n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })} %`

/** «+12 %» / «−5 %» frente al año anterior, o `null` si no hay base. */
export function textoVariacion(v: number | null): string | null {
  if (v === null) return null
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('es-ES', { maximumFractionDigits: 0 })} %`
}

/** Qué decir de la siniestralidad: titular + cobertura. Nunca «0 %» cuando no hay importes. */
export function textoSiniestralidad(s: SiniestralidadAnio): { titular: string; cobertura: string | null; aviso: string | null } {
  const avisoMuestra = s.muestraPequena && s.n > 0 ? `Solo ${s.n} siniestro${s.n === 1 ? '' : 's'}: muestra pequeña, el ratio es orientativo.` : null
  switch (s.estado) {
    case 'sin_siniestros':
      return { titular: 'Sin siniestros', cobertura: null, aviso: null }
    case 'sin_importes':
      return { titular: 'Sin importes de la compañía', cobertura: `importes en 0 de ${s.n} siniestros`, aviso: null }
    case 'sin_prima':
      return { titular: 'Sin prima cobrada para comparar', cobertura: `importes en ${s.conImporte} de ${s.n} siniestros`, aviso: avisoMuestra }
    case 'parcial':
      return {
        titular: `${pctONada(s.ratioPct)} (parcial)`,
        cobertura: `importes en ${s.conImporte} de ${s.n} siniestros`,
        aviso: `Faltan importes de ${s.n - s.conImporte}: el ratio real es mayor o igual.${avisoMuestra ? ` ${avisoMuestra}` : ''}`,
      }
    case 'completo':
      return { titular: pctONada(s.ratioPct), cobertura: `importes en ${s.conImporte} de ${s.n} siniestros`, aviso: avisoMuestra }
  }
}

// ─── Tabla resumen ───────────────────────────────────────────────────────────

export type FilaResumen = {
  codigo: string
  nombre: string
  polizas: number | null
  prima: number | null
  nuevas: number | null
  bajas: number | null
  siniestros: number | null
  comision: number | null
  /** Mismos campos del año anterior, para la variación. */
  anterior: { polizas: number | null; prima: number | null; nuevas: number | null; bajas: number | null; siniestros: number | null; comision: number | null } | null
}

export type ColumnaResumen = 'nombre' | 'polizas' | 'prima' | 'nuevas' | 'bajas' | 'siniestros' | 'comision'

function campos(c: CuadroCompaniaAnio | undefined) {
  if (!c) return null
  return {
    polizas: c.cartera.polizas,
    prima: c.cartera.prima,
    nuevas: c.produccion.nuevas.polizas,
    bajas: c.produccion.bajas.polizas,
    siniestros: c.siniestros.n,
    comision: c.comision.devengada,
  }
}

/** Una fila por compañía con cuadro en el año o en el anterior. Sin cuadro del año → cifras `null` («—»). */
export function filasResumen(cuadro: CuadroLeido, nombres: ReadonlyMap<string, string>): FilaResumen[] {
  const act = new Map(cuadro.companias.map((c) => [c.companiaCodigoDgs, c]))
  const ant = new Map(cuadro.anterior.map((c) => [c.companiaCodigoDgs, c]))
  const codigos = new Set([...act.keys(), ...ant.keys()])
  return [...codigos].map((codigo) => {
    const a = campos(act.get(codigo))
    return {
      codigo,
      nombre: nombres.get(codigo) ?? codigo,
      polizas: a?.polizas ?? null, prima: a?.prima ?? null, nuevas: a?.nuevas ?? null,
      bajas: a?.bajas ?? null, siniestros: a?.siniestros ?? null, comision: a?.comision ?? null,
      anterior: campos(ant.get(codigo)),
    }
  })
}

/** Ordena por columna. Los `null` van SIEMPRE al final, en cualquier sentido (no son el mínimo). */
export function ordenarResumen(filas: readonly FilaResumen[], col: ColumnaResumen, desc: boolean): FilaResumen[] {
  const sentido = desc ? -1 : 1
  return [...filas].sort((x, y) => {
    if (col === 'nombre') return sentido * x.nombre.localeCompare(y.nombre, 'es')
    const a = x[col], b = y[col]
    if (a === null && b === null) return x.nombre.localeCompare(y.nombre, 'es')
    if (a === null) return 1
    if (b === null) return -1
    return sentido * (a - b) || x.nombre.localeCompare(y.nombre, 'es')
  })
}

// ─── Condición de siniestralidad del acuerdo ─────────────────────────────────

/**
 * Tope de siniestralidad (`acuerdo_objetivos.siniestralidad_max_pct`) que aplica a la compañía en el año:
 * el de los objetivos cuyo periodo toca el año. Con varios, el MÁS ESTRICTO (menor). `null` = ningún
 * acuerdo lo fija (o los acuerdos no se han podido leer): sin semáforo, nunca «cumple».
 */
export function siniestralidadMaxima(
  acuerdos: { estado: string; acuerdos?: ReadonlyArray<{ companiaCodigoDgs: string; objetivos: ReadonlyArray<{ periodoDesde: string; periodoHasta: string; siniestralidadMaxPct: number | null }> }> } | null,
  codigo: string,
  anio: number,
): number | null {
  if (!acuerdos || acuerdos.estado !== 'ok' || !acuerdos.acuerdos) return null
  const topes: number[] = []
  for (const a of acuerdos.acuerdos) {
    if (a.companiaCodigoDgs !== codigo) continue
    for (const o of a.objetivos) {
      if (o.siniestralidadMaxPct === null || o.periodoDesde > `${anio}-12-31` || o.periodoHasta < `${anio}-01-01`) continue
      topes.push(o.siniestralidadMaxPct)
    }
  }
  return topes.length === 0 ? null : Math.min(...topes)
}

/** Años del selector: el en curso y los `atras` anteriores. */
export function aniosSelector(hoy: string, atras = 3): number[] {
  const a = Number(hoy.slice(0, 4))
  return Array.from({ length: atras + 1 }, (_, i) => a - i)
}

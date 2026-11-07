// Cuadro de mando POR COMPAÑÍA y AÑO NATURAL (07/11/2026, pedido por Alberto para llevarlo a las
// reuniones con las compañías). Lo PURO: sin red, sin BD, sin reloj (`hoy` y `anio` se inyectan).
//
// Cuatro bloques por compañía: cartera, producción (nuevas/bajas/retención), siniestralidad
// (INFORMATIVA: la rentabilidad de Alberto es la comisión, no paga siniestros) y comisión.
//
// 🚨 Reglas de «dato que NO hay ≠ dato que NO se ha mirado»:
//  - Sin pólizas / sin recibos / sin siniestros con importe → `null`, nunca un 0 que afirme algo.
//  - La siniestralidad lleva SU COBERTURA («importes en X de Y siniestros»). Con X = 0 no hay ratio:
//    es «sin importes de la compañía» (Mapfre no manda importes por EIAC), jamás 0 %.
//  - El incurrido es indemnización + reserva. El `total_pagos` NO se suma: coincide con la
//    indemnización cuando ambos existen (medido 07/11/2026), sumarlo la duplicaría. Solo entra si
//    la indemnización no consta.
//  - La cartera de un año CERRADO no se puede leer de ninguna parte: se RECONSTRUYE con efecto
//    inicial y fecha de situación de las canceladas, y se marca `reconstruida`.
//  - Baja = `estado = 'cancelada'` con `fecha_situacion`. Una cancelada sin fecha no cae en ningún
//    año: se cuenta en `bajasSinFecha`. El MOTIVO de la baja no consta en CIMA y no se inventa.

/** Una póliza de cartera VIVA (origen CIMA) ya leída. `prima` = `primaConRecibos()`. */
export type PolizaCuadro = {
  companiaCodigoDgs: string | null | undefined
  ramo: string | null | undefined
  estado: string | null | undefined
  /** `esCarteraEnVigor()` calculado por quien lee. */
  enVigorHoy: boolean
  /** 'YYYY-MM-DD'. */
  fechaEfectoInicial: string | null | undefined
  fechaSituacion: string | null | undefined
  prima: number | null | undefined
}

export type SiniestroCuadro = {
  companiaCodigoDgs: string | null | undefined
  /** 'YYYY-MM-DD' (fecha del suceso, o la de declaración si no consta). */
  fecha: string | null | undefined
  /** Código EIAC de tipología (`11` / `1101`… = asistencia). */
  tipo: string | null | undefined
  indemnizacion: number | null | undefined
  reserva: number | null | undefined
  pagos: number | null | undefined
}

type SumaProd = { importe: number; recibos: number; ilegibles: number }
/** Subconjunto estructural de `ProduccionCompania` (acuerdos-productividad.ts). */
export type ProduccionCuadro = {
  companiaCodigoDgs: string
  npCobrada: SumaProd
  carteraCobrada: SumaProd
  comisionAplicada: SumaProd
}

export type FilaRamoCuadro = { ramo: string; polizas: number; prima: number | null; sinPrima: number }

export type CarteraCuadro = {
  /** Fecha a la que se mide: `hoy` en el año en curso, 31/12 en uno cerrado. */
  fecha: string
  /** `true` en un año cerrado: reconstruida, no leída. */
  reconstruida: boolean
  polizas: number
  /** Suma de las primas conocidas; `null` si no hay ninguna que sumar. Con `sinPrima > 0` es incompleta. */
  prima: number | null
  sinPrima: number
  porRamo: FilaRamoCuadro[]
}

export type ProduccionAnio = {
  nuevas: { polizas: number; prima: number | null; sinPrima: number; porRamo: FilaRamoCuadro[] }
  bajas: { polizas: number; porRamo: FilaRamoCuadro[] }
  /** Cancelada sin `fecha_situacion`: no se puede colocar en ningún año. */
  bajasSinFecha: number
  /** Pólizas que ya estaban al empezar el año (la base de la retención). */
  baseInicio: number
  /** De esas, las que se dieron de baja en el año. */
  bajasDeBase: number
  /** `null` si no hay base: no se inventa 100 %. */
  retencionPct: number | null
}

export type EstadoSiniestralidad = 'sin_siniestros' | 'sin_importes' | 'sin_prima' | 'parcial' | 'completo'

export type SiniestralidadAnio = {
  /** Todos los del año (con asistencias). */
  total: number
  /** Tipología del grupo 11 (grúa, cerrajería…): no son daños y se cuentan aparte. */
  asistencias: number
  /** Sin asistencias: los que entran en el ratio. */
  n: number
  /** De `n`, los que traen algún importe de la compañía. */
  conImporte: number
  /** Sin tipología: no se sabe si es asistencia (entran en `n`). */
  sinTipo: number
  incurrido: number | null
  /** incurrido / prima neta cobrada del año. */
  ratioPct: number | null
  estado: EstadoSiniestralidad
  muestraPequena: boolean
}

export type ComisionAnio = {
  /** Comisión bruta de los recibos NP+CA cobrados del año (CIMA). `null` = sin recibos. */
  devengada: number | null
  recibos: number
  ilegibles: number
  /** Prima neta de esos mismos recibos. */
  primaNetaCobrada: number | null
  /** devengada / primaNetaCobrada. `null` si algo es ilegible o no hay base. */
  pctReal: number | null
  /** devengada / pólizas en cartera a la fecha del cuadro. */
  mediaPorPoliza: number | null
}

export type CuadroCompaniaAnio = {
  companiaCodigoDgs: string
  anio: number
  cartera: CarteraCuadro
  produccion: ProduccionAnio
  siniestros: SiniestralidadAnio
  comision: ComisionAnio
}

/** Con menos siniestros que esto el ratio es anecdótico. */
export const MUESTRA_MINIMA_SINIESTROS = 10

const r2 = (n: number) => Math.round(n * 100) / 100
const texto = (v: string | null | undefined) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const dia = (v: string | null | undefined) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)
const num = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Tipología de asistencia: el grupo 11 de EIAC (`11` o `11xx`). */
export function esAsistencia(tipo: string | null | undefined): boolean {
  return typeof tipo === 'string' && /^11(\d\d)?$/.test(tipo.trim())
}

function agrupar(ps: readonly PolizaCuadro[]): { polizas: number; prima: number | null; sinPrima: number; porRamo: FilaRamoCuadro[] } {
  const m = new Map<string, { polizas: number; suma: number; conocidas: number; sinPrima: number }>()
  for (const p of ps) {
    const k = texto(p.ramo) ?? 'sin_ramo'
    const f = m.get(k) ?? { polizas: 0, suma: 0, conocidas: 0, sinPrima: 0 }
    f.polizas++
    const pr = num(p.prima)
    if (pr !== null && pr > 0) { f.suma += pr; f.conocidas++ } else f.sinPrima++
    m.set(k, f)
  }
  const porRamo = [...m.entries()]
    .map(([ramo, f]) => ({ ramo, polizas: f.polizas, prima: f.conocidas > 0 ? r2(f.suma) : null, sinPrima: f.sinPrima }))
    .sort((a, b) => b.polizas - a.polizas || a.ramo.localeCompare(b.ramo))
  const conocidas = [...m.values()].reduce((s, f) => s + f.conocidas, 0)
  return {
    polizas: ps.length,
    prima: conocidas > 0 ? r2([...m.values()].reduce((s, f) => s + f.suma, 0)) : null,
    sinPrima: ps.length - conocidas,
    porRamo,
  }
}

function carteraA(ps: readonly PolizaCuadro[], anio: number, hoy: string): CarteraCuadro {
  const actual = hoy.slice(0, 4) === String(anio)
  const corte = actual ? hoy : `${anio}-12-31`
  const dentro = ps.filter((p) => {
    if (actual) return p.enVigorHoy
    const ini = dia(p.fechaEfectoInicial)
    if (ini === null || ini > corte) return false
    if (p.enVigorHoy) return true
    const sit = dia(p.fechaSituacion)
    return texto(p.estado) === 'cancelada' && sit !== null && sit > corte
  })
  return { fecha: corte, reconstruida: !actual, ...agrupar(dentro) }
}

function produccionDe(ps: readonly PolizaCuadro[], anio: number): ProduccionAnio {
  const ini = `${anio}-01-01`
  const fin = `${anio}-12-31`
  const nuevas = ps.filter((p) => { const d = dia(p.fechaEfectoInicial); return d !== null && d >= ini && d <= fin })
  const canceladas = ps.filter((p) => texto(p.estado) === 'cancelada')
  const bajas = canceladas.filter((p) => { const d = dia(p.fechaSituacion); return d !== null && d >= ini && d <= fin })
  const bajasSinFecha = canceladas.filter((p) => dia(p.fechaSituacion) === null).length
  // Base de retención: ya existían el 1 de enero y seguían vivas entonces (hoy en vigor, o canceladas después).
  const base = ps.filter((p) => {
    const e = dia(p.fechaEfectoInicial)
    if (e === null || e >= ini) return false
    if (p.enVigorHoy) return true
    const s = dia(p.fechaSituacion)
    return texto(p.estado) === 'cancelada' && s !== null && s >= ini
  })
  const bajasDeBase = base.filter((p) => { const s = dia(p.fechaSituacion); return texto(p.estado) === 'cancelada' && s !== null && s <= fin }).length
  const n = agrupar(nuevas)
  const b = agrupar(bajas)
  return {
    nuevas: { polizas: n.polizas, prima: n.prima, sinPrima: n.sinPrima, porRamo: n.porRamo },
    bajas: { polizas: b.polizas, porRamo: b.porRamo },
    bajasSinFecha,
    baseInicio: base.length,
    bajasDeBase,
    retencionPct: base.length > 0 ? r2((1 - bajasDeBase / base.length) * 100) : null,
  }
}

function siniestralidadDe(ss: readonly SiniestroCuadro[], anio: number, primaNetaCobrada: number | null): SiniestralidadAnio {
  const delAnio = ss.filter((s) => dia(s.fecha)?.slice(0, 4) === String(anio))
  const asist = delAnio.filter((s) => esAsistencia(s.tipo))
  const dano = delAnio.filter((s) => !esAsistencia(s.tipo))
  let conImporte = 0
  let incurrido = 0
  for (const s of dano) {
    const ind = num(s.indemnizacion), res = num(s.reserva), pag = num(s.pagos)
    if (ind === null && res === null && pag === null) continue
    conImporte++
    incurrido += (ind ?? pag ?? 0) + (res ?? 0)
  }
  const inc = conImporte > 0 ? r2(incurrido) : null
  const ratioPct = inc !== null && primaNetaCobrada !== null && primaNetaCobrada > 0 ? r2((inc / primaNetaCobrada) * 100) : null
  const estado: EstadoSiniestralidad =
    dano.length === 0 ? 'sin_siniestros'
      : conImporte === 0 ? 'sin_importes'
        : ratioPct === null ? 'sin_prima'
          : conImporte < dano.length ? 'parcial' : 'completo'
  return {
    total: delAnio.length,
    asistencias: asist.length,
    n: dano.length,
    conImporte,
    sinTipo: dano.filter((s) => texto(s.tipo) === null).length,
    incurrido: inc,
    ratioPct,
    estado,
    muestraPequena: dano.length < MUESTRA_MINIMA_SINIESTROS,
  }
}

function comisionDe(prod: ProduccionCuadro | undefined, polizasCartera: number): { c: ComisionAnio; prima: number | null } {
  if (!prod) return { c: { devengada: null, recibos: 0, ilegibles: 0, primaNetaCobrada: null, pctReal: null, mediaPorPoliza: null }, prima: null }
  const recibosPrima = prod.npCobrada.recibos + prod.carteraCobrada.recibos
  const ilegPrima = prod.npCobrada.ilegibles + prod.carteraCobrada.ilegibles
  const prima = recibosPrima > 0 ? r2(prod.npCobrada.importe + prod.carteraCobrada.importe) : null
  const dev = prod.comisionAplicada.recibos > 0 ? r2(prod.comisionAplicada.importe) : null
  const limpio = prod.comisionAplicada.ilegibles === 0 && ilegPrima === 0
  return {
    prima,
    c: {
      devengada: dev,
      recibos: prod.comisionAplicada.recibos,
      ilegibles: prod.comisionAplicada.ilegibles,
      primaNetaCobrada: prima,
      pctReal: dev !== null && prima !== null && prima > 0 && limpio ? r2((dev / prima) * 100) : null,
      mediaPorPoliza: dev !== null && polizasCartera > 0 ? r2(dev / polizasCartera) : null,
    },
  }
}

/**
 * Un cuadro por compañía que aparezca en alguna fuente. Una compañía sin pólizas, siniestros ni recibos
 * no aparece (no hay nada que enseñar: el directorio de contactos ya la lista).
 */
export function cuadroCompanias(e: {
  anio: number
  hoy: string
  polizas: readonly PolizaCuadro[]
  siniestros: readonly SiniestroCuadro[]
  produccion: readonly ProduccionCuadro[]
}): { companias: CuadroCompaniaAnio[]; polizasSinCompania: number; siniestrosSinCompania: number } {
  const porC = <T extends { companiaCodigoDgs?: string | null }>(xs: readonly T[]) => {
    const m = new Map<string, T[]>()
    let sin = 0
    for (const x of xs) {
      const c = texto(x.companiaCodigoDgs)
      if (c === null) { sin++; continue }
      m.set(c, [...(m.get(c) ?? []), x])
    }
    return { m, sin }
  }
  const P = porC(e.polizas)
  const S = porC(e.siniestros)
  const prod = new Map(e.produccion.map((p) => [p.companiaCodigoDgs, p]))
  const codigos = new Set<string>([...P.m.keys(), ...S.m.keys(), ...prod.keys()])
  const companias = [...codigos].sort().map((codigo): CuadroCompaniaAnio => {
    const cartera = carteraA(P.m.get(codigo) ?? [], e.anio, e.hoy)
    const { c: comision, prima } = comisionDe(prod.get(codigo), cartera.polizas)
    return {
      companiaCodigoDgs: codigo,
      anio: e.anio,
      cartera,
      produccion: produccionDe(P.m.get(codigo) ?? [], e.anio),
      siniestros: siniestralidadDe(S.m.get(codigo) ?? [], e.anio, prima),
      comision,
    }
  })
  return { companias, polizasSinCompania: P.sin, siniestrosSinCompania: S.sin }
}

export type SemaforoSiniestralidad = 'sin_dato' | 'cumple' | 'justo' | 'supera'

/**
 * Compara el ratio con la condición del acuerdo (`siniestralidad_max_pct`). Sin ratio o sin tope → `sin_dato`
 * (nunca «cumple» por defecto). `justo` = dentro del 10 % de margen bajo el tope.
 */
export function semaforoSiniestralidad(ratioPct: number | null, maxPct: number | null): SemaforoSiniestralidad {
  if (ratioPct === null || maxPct === null || !Number.isFinite(ratioPct) || !Number.isFinite(maxPct) || maxPct <= 0) return 'sin_dato'
  if (ratioPct > maxPct) return 'supera'
  return ratioPct >= maxPct * 0.9 ? 'justo' : 'cumple'
}

/** Variación porcentual `actual` frente a `anterior`. `null` si no hay base (0 o dato ausente). */
export function variacionPct(actual: number | null | undefined, anterior: number | null | undefined): number | null {
  const a = num(actual), b = num(anterior)
  if (a === null || b === null || b === 0) return null
  return r2(((a - b) / Math.abs(b)) * 100)
}

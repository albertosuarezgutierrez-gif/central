// Prima de FIN DE SEMANA por RITMO PROPIO de reservas (27/10/2026). Módulo PURO (sin BD ni `@/`).
//
// 🚨 El problema que tapa. El motor solo sabe de demanda por la ocupación MENSUAL
// (`pricing-demanda.ts`), y el mes mezcla martes con sábados. Medido en House Sevillana ese día:
// viernes/sábado al 78 % en 12 meses a 693 €/noche y con antelación mediana de 39 días, frente a
// entre semana al 35 % a 412 € y 13 días. Los findes de nov-2026, feb y abr-2027 estaban YA
// vendidos al 100 % con 4-6 meses de antelación: eso no es un piso caro, es un finde barato. Y el
// techo del bucket del mes (p90) impedía que la base lo corrigiera aunque alguien quisiera.
//
// Dos señales, las dos medidas sobre las reservas del propio piso (`incomes`):
//   · HISTÓRICA: de las noches vie/sáb de los últimos 12 meses, qué fracción se vendió con ≥X días
//     de antelación (ocupación finde × cuota anticipada). Alta = se vende lejos = precio corto.
//   · RITMO: noches vie/sáb del horizonte futuro YA vendidas frente a las que el histórico diría
//     que deberían estarlo a estas alturas (misma antelación). >1 = vamos por delante.
// El ritmo por DETRÁS del histórico recorta la señal histórica (no se sube un finde que este año
// no se está vendiendo), y por DELANTE la refuerza.
//
// 🚫 CANCELACIONES (27/10/2026). El sync BORRA de `incomes` la reserva cancelada; las futuras que
// aún se cancelarán siguen ahí. Sin corregir, el futuro (con sus cancelaciones pendientes) se
// compararía con un pasado depurado de las suyas y el ritmo saldría inflado. Simetría: la curva
// ESPERADA cuenta también las canceladas pasadas mientras estuvieron «en libro» a esa distancia
// (`reservas_canceladas`, solo `estaba_en_incomes`). Sin fecha real de cancelación se usa
// `cancelacion_vista_at` (≥ la real): sobrecuenta esperadas → ritmo a la baja = lado prudente.
// La señal HISTÓRICA no las cuenta: una noche cancelada no se vendió.
//
// 🚦 DESPLIEGUE GRADUAL: la prima (y el factor dom-jue de más abajo) solo se APLICA a los pisos de
// `SIVRA_PRIMA_FINDE_PISOS`
// (property_id separados por comas; vacía/ausente = ninguno). Se calcula para todos (parte).
//
// Tres estados, como manda el CLAUDE.md raíz: `prima: null` = sin muestra (no se sabe → SIN
// efecto, nunca «1,00 medido»); `1` = evaluada y no toca; >1 = prima. Rango [1, PRIMA_MAX].
// Nunca baja el precio: eso es trabajo de la urgencia (`pricing-lastminute.ts`).

import { esNocheFinde } from "./pricing-suelo-finde.ts"

/** Prima máxima (+25 %). */
export const PRIMA_FINDE_MAX = 1.25
/** Antelación a partir de la cual una noche de finde cuenta como «vendida lejos». */
export const DIAS_ANTELACION_FINDE = 30
/** Ventana histórica (noches pasadas) en días. */
export const VENTANA_HISTORICA_DIAS = 365
/** Horizonte futuro en el que se mide el ritmo. */
export const HORIZONTE_RITMO_DIAS = 180
/** Reservas con al menos una noche vie/sáb (y fecha de reserva conocida) para opinar. */
export const MIN_RESERVAS_FINDE = 10
/** Señal histórica (fracción de noches finde vendidas ≥X días antes) que NO mueve nada… */
export const SENAL_BAJA = 0.25
/** …y la que ya da la prima completa. */
export const SENAL_ALTA = 0.65
/** Ritmo (vendidas/esperadas) que da el refuerzo completo. */
export const RITMO_ALTO = 1.5
/** Noches esperadas mínimas en el horizonte para que el ritmo sea una señal y no ruido. */
export const MIN_ESPERADAS = 2

export type ReservaRitmo = {
  /** 'YYYY-MM-DD' */
  checkIn: string
  nights: number
  /** 'YYYY-MM-DD' o null (fecha de reserva desconocida: cuenta como vendida, no como antelación) */
  reservedAt: string | null
}

/** Reserva CANCELADA del piso (`reservas_canceladas` con `estaba_en_incomes`). */
export type CanceladaRitmo = ReservaRitmo & {
  /** 'YYYY-MM-DD' en que el sync la vio cancelada (≥ la cancelación real). null = no se sabe → en libro hasta el final. */
  vistaAt: string | null
}

export type RitmoFindeOpts = {
  primaMax?: number
  diasAntelacion?: number
  ventanaDias?: number
  horizonteDias?: number
  minReservas?: number
  senalBaja?: number
  senalAlta?: number
  ritmoAlto?: number
  minEsperadas?: number
}

export type RitmoFinde = {
  /** null = sin muestra (SIN efecto). 1 = evaluada, sin prima. */
  prima: number | null
  motivo: "sin_muestra" | "evaluada"
  /** reservas con noche vie/sáb en la ventana y fecha de reserva conocida */
  reservasFinde: number
  /** noches vie/sáb vendidas / noches vie/sáb de la ventana */
  ocupacionFinde: number | null
  /** de las vendidas con antelación conocida, fracción vendida con ≥ diasAntelacion */
  cuotaAnticipada: number | null
  /** vendidas / esperadas en el horizonte; null = esperadas < mínimo (no se puede juzgar) */
  ritmo: number | null
  vendidasFuturas: number
  esperadasFuturas: number
  /** noches vie/sáb pasadas que solo estaban «en libro» por una reserva luego cancelada */
  nochesCanceladasHist: number
  /** Factor dom-jue a la baja de última hora (`factorRitmoSemana`). Ausente = no calculado → sin efecto. */
  semana?: RitmoSemana
}

const DIA = 86_400_000
const aDia = (iso: string) => Math.floor(Date.parse(iso.slice(0, 10) + "T00:00:00Z") / DIA)
const aIso = (n: number) => new Date(n * DIA).toISOString().slice(0, 10)
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

/** Lo que se mide de UN tipo de noche (vie/sáb o dom-jue). Lo comparten la prima y el factor entre semana. */
type CurvaNoches = {
  /** noche (día) del tipo en [desde, hasta] → antelación con que se vendió (null = desconocida) */
  vendidas: Map<number, number | null>
  /** reservas con alguna noche PASADA del tipo y antelación conocida (la muestra) */
  reservasTipo: number
  /** noches pasadas del tipo en la ventana, y cuántas se vendieron */
  totalHist: number
  vendHist: number
  /** antelaciones conocidas de las noches pasadas vendidas */
  leadsHist: number[]
  /** noche pasada → tramos (antelación vista, antelación reserva] en que estuvo en libro por una cancelada */
  enLibro: Map<number, [number, number][]>
}

function curvaNoches(
  reservas: ReservaRitmo[], canceladas: CanceladaRitmo[], h: number, desde: number, hasta: number,
  esTipo: (iso: string) => boolean,
): CurvaNoches {
  // Noche → antelación (días entre la reserva y ESA noche). Un Map y no un array: dos filas que
  // cubren la misma noche (duplicado de importación) cuentan UNA noche vendida, con la antelación
  // más larga conocida. `null` = vendida con antelación desconocida.
  const vendidas = new Map<number, number | null>()
  const conTipo = new Set<number>()
  reservas.forEach((r, idx) => {
    const n = Math.floor(Number(r.nights))
    if (!r.checkIn || !(n > 0)) return
    const ci = aDia(r.checkIn)
    if (!Number.isFinite(ci)) return
    const rv = r.reservedAt ? aDia(r.reservedAt) : NaN
    for (let d = ci; d < ci + n; d++) {
      if (d < desde || d > hasta) continue
      if (!esTipo(aIso(d))) continue
      const lead = Number.isFinite(rv) && rv <= d ? d - rv : null
      const prev = vendidas.get(d)
      if (prev === undefined || (lead != null && (prev == null || lead > prev))) vendidas.set(d, lead)
      if (d < h && lead != null) conTipo.add(idx)
    }
  })

  let totalHist = 0, vendHist = 0
  const leadsHist: number[] = []
  for (let d = desde; d < h; d++) {
    if (!esTipo(aIso(d))) continue
    totalHist++
    if (vendidas.has(d)) {
      vendHist++
      const l = vendidas.get(d)
      if (l != null) leadsHist.push(l)
    }
  }

  // Canceladas pasadas: por noche, los tramos [antelación de la vista, antelación de la reserva]
  // en los que estuvo en libro. En libro a distancia k ⇔ vistaLead < k ≤ lead.
  const enLibro = new Map<number, [number, number][]>()
  for (const c of canceladas) {
    const n = Math.floor(Number(c.nights))
    if (!c.checkIn || !(n > 0) || !c.reservedAt) continue
    const ci = aDia(c.checkIn), rv = aDia(c.reservedAt)
    const vi = c.vistaAt ? aDia(c.vistaAt) : NaN
    if (!Number.isFinite(ci) || !Number.isFinite(rv)) continue
    for (let d = ci; d < ci + n; d++) {
      if (d < desde || d >= h || rv > d || !esTipo(aIso(d))) continue
      const l = enLibro.get(d) ?? []
      l.push([Number.isFinite(vi) ? d - vi : -Infinity, d - rv])
      enLibro.set(d, l)
    }
  }
  return { vendidas, reservasTipo: conTipo.size, totalHist, vendHist, leadsHist, enLibro }
}

/** Noches pasadas que a distancia k solo estaban en libro por una cancelada. */
function extraCanceladas(c: CurvaNoches, k: number): number {
  let x = 0
  for (const [d, tramos] of c.enLibro) {
    if (c.vendidas.has(d)) { const l = c.vendidas.get(d); if (l == null || l >= k) continue }
    if (tramos.some(([vl, ld]) => vl < k && k <= ld)) x++
  }
  return x
}

/**
 * Noches del tipo en (h, h+dias] vendidas frente a esperadas a estas alturas: cada noche «debería»
 * estar vendida con probabilidad occ × P(antelación ≥ distancia), más las que a esa distancia
 * estaban en libro por una reserva luego cancelada (simetría con el futuro, ver cabecera).
 */
function ritmoTramo(c: CurvaNoches, h: number, dias: number, esTipo: (iso: string) => boolean) {
  const occ = c.vendHist / c.totalHist
  const cuotaGE = (dd: number) => c.leadsHist.filter(l => l >= dd).length / c.leadsHist.length
  let esperadas = 0, vendidas = 0
  for (let d = h + 1; d <= h + dias; d++) {
    if (!esTipo(aIso(d))) continue
    esperadas += occ * cuotaGE(d - h) + (c.enLibro.size ? extraCanceladas(c, d - h) / c.totalHist : 0)
    if (c.vendidas.has(d)) vendidas++
  }
  return { occ, cuotaGE, esperadas, vendidas }
}

/**
 * Prima vie/sáb de un piso. `hoy` = 'YYYY-MM-DD' INYECTADO (nunca el reloj de aquí dentro).
 * `reservas` = SOLO las de ese piso, ya filtradas por `historico_desde` y sin bloqueos a 0 €.
 */
export function primaRitmoFinde(
  reservas: ReservaRitmo[], hoy: string, o: RitmoFindeOpts = {}, canceladas: CanceladaRitmo[] = [],
): RitmoFinde {
  const primaMax = o.primaMax ?? PRIMA_FINDE_MAX
  const X = o.diasAntelacion ?? DIAS_ANTELACION_FINDE
  const ventana = o.ventanaDias ?? VENTANA_HISTORICA_DIAS
  const horizonte = o.horizonteDias ?? HORIZONTE_RITMO_DIAS
  const minReservas = o.minReservas ?? MIN_RESERVAS_FINDE
  const sBaja = o.senalBaja ?? SENAL_BAJA
  const sAlta = o.senalAlta ?? SENAL_ALTA
  const rAlto = o.ritmoAlto ?? RITMO_ALTO
  const minEsp = o.minEsperadas ?? MIN_ESPERADAS

  const h = aDia(hoy)
  const c = curvaNoches(reservas, canceladas, h, h - ventana, h + horizonte, esNocheFinde)

  const base: RitmoFinde = {
    prima: null, motivo: "sin_muestra", reservasFinde: c.reservasTipo,
    ocupacionFinde: null, cuotaAnticipada: null, ritmo: null, vendidasFuturas: 0, esperadasFuturas: 0,
    nochesCanceladasHist: c.enLibro.size,
  }
  if (c.reservasTipo < minReservas || c.totalHist === 0 || c.leadsHist.length === 0) return base

  // Ritmo sobre el horizonte entero (ver `ritmoTramo`); la señal histórica sale de la misma curva.
  const { occ, cuotaGE, esperadas, vendidas: vendFut } = ritmoTramo(c, h, horizonte, esNocheFinde)
  const cuotaAnt = cuotaGE(X)
  const senalHist = occ * cuotaAnt
  const A = clamp((senalHist - sBaja) / (sAlta - sBaja), 0, 1)
  const ritmo = esperadas >= minEsp ? vendFut / esperadas : null

  let intensidad = A
  if (ritmo != null) {
    const B = clamp((ritmo - 1) / (rAlto - 1), 0, 1)
    intensidad = clamp(A * Math.min(1, ritmo) + 0.5 * B, 0, 1)
  }
  const prima = Number((1 + (primaMax - 1) * intensidad).toFixed(3))

  return {
    prima, motivo: "evaluada", reservasFinde: c.reservasTipo,
    ocupacionFinde: Number(occ.toFixed(3)), cuotaAnticipada: Number(cuotaAnt.toFixed(3)),
    ritmo: ritmo == null ? null : Number(ritmo.toFixed(3)),
    vendidasFuturas: vendFut, esperadasFuturas: Number(esperadas.toFixed(2)),
    nochesCanceladasHist: c.enLibro.size,
  }
}

// ── ENTRE SEMANA (dom-jue) a la BAJA, solo a ÚLTIMA HORA (27/10/2026) ─────────────────────────
//
// Medido en House ese día: dom-jue al 35 % en 12 meses a 412 €/noche vendida, antelación mediana 13
// días; el huésped veía 450-560 € en nov-feb con 10-30 % vendido. Bajar entre semana a MESES vista
// sería un error (esas noches se reservan tarde: ir «por detrás» a 90 días es lo normal). La palanca
// es la última hora: el factor solo existe DENTRO de la ventana de antelación típica del piso
// (p75 de la antelación de sus noches dom-jue, mín. 7 d, máx. 45 d) y solo si las noches dom-jue de
// esa ventana van por DETRÁS de lo que el histórico diría a esa misma distancia. Misma curva y
// misma simetría de canceladas que la prima vie/sáb (`curvaNoches`/`ritmoTramo`).
//
// Tres estados: `factor: null` = no se sabe (muestra < 10 reservas dom-jue, o tramo sin esperadas
// suficientes para juzgar) → SIN efecto · `1` = evaluado y va al día o por delante · <1 = baja.
// Rango [FACTOR_SEMANA_MIN, 1]. Con la urgencia (`lastminute_k`) NO se multiplica: el motor aplica
// la MÁS FUERTE de las dos (ver `apply`), porque las dos bajan la misma noche por la misma razón.

/** Factor mínimo (−15 %). */
export const FACTOR_SEMANA_MIN = 0.85
/** Reservas con noche dom-jue (y antelación conocida) para opinar. */
export const MIN_RESERVAS_SEMANA = 10
/** Percentil de la antelación dom-jue que marca la ventana de última hora… */
export const PCTL_VENTANA_SEMANA = 0.75
/** …con estos límites en días. El máximo impide que un piso de antelación larga baje a meses vista. */
export const VENTANA_SEMANA_MIN = 7
export const VENTANA_SEMANA_MAX = 45
/** Ritmo (vendidas/esperadas) con el que ya se aplica el factor mínimo. */
export const RITMO_SEMANA_BAJO = 0.5

export type RitmoSemanaOpts = {
  factorMin?: number
  ventanaDias?: number
  minReservas?: number
  pctl?: number
  ventanaMin?: number
  ventanaMax?: number
  ritmoBajo?: number
  minEsperadas?: number
}

export type RitmoSemana = {
  /** null = no se sabe (SIN efecto). 1 = evaluado, sin bajada. <1 = bajada en la ventana. */
  factor: number | null
  motivo: "sin_muestra" | "sin_ritmo" | "evaluada"
  reservasSemana: number
  /** días vista hasta los que actúa (p75 acotado); null sin muestra */
  ventanaDias: number | null
  ocupacionSemana: number | null
  ritmo: number | null
  vendidasVentana: number
  esperadasVentana: number
}

const pctl = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]
}

/** Factor dom-jue de un piso. Mismas entradas que `primaRitmoFinde` (hoy INYECTADO). */
export function factorRitmoSemana(
  reservas: ReservaRitmo[], hoy: string, o: RitmoSemanaOpts = {}, canceladas: CanceladaRitmo[] = [],
): RitmoSemana {
  const fMin = o.factorMin ?? FACTOR_SEMANA_MIN
  const ventanaHist = o.ventanaDias ?? VENTANA_HISTORICA_DIAS
  const minReservas = o.minReservas ?? MIN_RESERVAS_SEMANA
  const minEsp = o.minEsperadas ?? MIN_ESPERADAS
  const rBajo = o.ritmoBajo ?? RITMO_SEMANA_BAJO
  const esSemana = (iso: string) => !esNocheFinde(iso)

  const h = aDia(hoy)
  const vMax = o.ventanaMax ?? VENTANA_SEMANA_MAX
  const c = curvaNoches(reservas, canceladas, h, h - ventanaHist, h + vMax, esSemana)
  const base: RitmoSemana = {
    factor: null, motivo: "sin_muestra", reservasSemana: c.reservasTipo, ventanaDias: null,
    ocupacionSemana: null, ritmo: null, vendidasVentana: 0, esperadasVentana: 0,
  }
  if (c.reservasTipo < minReservas || c.totalHist === 0 || c.leadsHist.length === 0) return base

  const W = clamp(Math.ceil(pctl(c.leadsHist, o.pctl ?? PCTL_VENTANA_SEMANA)), o.ventanaMin ?? VENTANA_SEMANA_MIN, vMax)
  const t = ritmoTramo(c, h, W, esSemana)
  const medido = {
    ...base, ventanaDias: W, ocupacionSemana: Number(t.occ.toFixed(3)),
    vendidasVentana: t.vendidas, esperadasVentana: Number(t.esperadas.toFixed(2)),
  }
  if (t.esperadas < minEsp) return { ...medido, motivo: "sin_ritmo" }
  const ritmo = t.vendidas / t.esperadas
  const deficit = clamp((1 - ritmo) / (1 - rBajo), 0, 1)
  return {
    ...medido, motivo: "evaluada", ritmo: Number(ritmo.toFixed(3)),
    factor: Number((1 - (1 - fMin) * deficit).toFixed(3)),
  }
}

/**
 * Factor dom-jue que SE APLICA al piso. Mismo gate que la prima: piso no habilitado → 1 ·
 * habilitado sin lectura/muestra → null (sin efecto) · habilitado y medido → el factor.
 */
export function factorSemanaPiso(r: RitmoFinde | null | undefined, pid: string, habilitados: Set<string>): number | null {
  if (!habilitados.has(pid)) return 1
  return r?.semana?.factor ?? null
}

/**
 * Factor que aplica a UNA fecha: solo noches dom-jue, dentro de la ventana (0 ≤ díasVista ≤ ventana)
 * y sin evento (ni víspera: `factorEvento > 1` ya protege). Fuera de eso, 1. Nunca por debajo del mínimo.
 */
export function factorSemanaFecha(p: {
  fecha: string; diasVista: number; factor: number | null; ventanaDias: number | null; factorEvento: number
}): number {
  if (p.factor == null || !(p.factor < 1) || p.ventanaDias == null) return 1
  if (esNocheFinde(p.fecha)) return 1
  if (!Number.isFinite(p.diasVista) || p.diasVista < 0 || p.diasVista > p.ventanaDias) return 1
  if (Number(p.factorEvento) > 1) return 1
  return Math.max(p.factor, FACTOR_SEMANA_MIN)
}

/**
 * Urgencia combinada: la MÁS FUERTE de la urgencia (`factorLastMinute`) y el factor dom-jue, nunca su
 * producto (las dos bajan la misma noche por la misma razón: se acerca sin venderse).
 */
export function urgenciaCombinada(lastminute: number, semana: number): number {
  return Math.min(1, lastminute, semana)
}

/** Filas de BD (las de `leerRitmoFinde`) → prima por piso. Puro: lo comparten `apply` y `canal`. */
export function ritmoFindePorPiso(
  reservas: { pid: string; ci: string; nights: number; rv: string | null }[],
  canceladas: { pid: string; ci: string; nights: number; rv: string | null; vista: string | null }[],
  hoy: string,
): Map<string, RitmoFinde> {
  const rs = new Map<string, ReservaRitmo[]>()
  for (const x of reservas) {
    if (!rs.has(x.pid)) rs.set(x.pid, [])
    rs.get(x.pid)!.push({ checkIn: x.ci, nights: Number(x.nights), reservedAt: x.rv })
  }
  const cs = new Map<string, CanceladaRitmo[]>()
  for (const x of canceladas) {
    if (!cs.has(x.pid)) cs.set(x.pid, [])
    cs.get(x.pid)!.push({ checkIn: x.ci, nights: Number(x.nights), reservedAt: x.rv, vistaAt: x.vista })
  }
  const out = new Map<string, RitmoFinde>()
  for (const [pid, r] of rs) {
    const c = cs.get(pid) ?? []
    out.set(pid, { ...primaRitmoFinde(r, hoy, {}, c), semana: factorRitmoSemana(r, hoy, {}, c) })
  }
  return out
}

/** `SIVRA_PRIMA_FINDE_PISOS` → conjunto de property_id. Vacía/ausente = NINGUNO (sin efecto). */
export function pisosConPrimaFinde(env: string | null | undefined): Set<string> {
  return new Set(String(env ?? "").split(",").map(x => x.trim()).filter(Boolean))
}

/**
 * Prima que SE APLICA al piso. Tres estados: piso no habilitado → 1 (se sabe: no se aplica nada) ·
 * habilitado sin lectura/muestra → null (no se sabe, sin efecto) · habilitado y medida → la prima.
 */
export function primaPiso(r: RitmoFinde | null | undefined, pid: string, habilitados: Set<string>): number | null {
  if (!habilitados.has(pid)) return 1
  return r?.prima ?? null
}

/** Prima que aplica a UNA fecha: solo noches vie/sáb sin evento. Fuera de eso, 1 (sin efecto). */
export function primaFindeFecha(p: { fecha: string; prima: number | null; factorEvento: number }): number {
  if (p.prima == null || !(p.prima > 1)) return 1
  if (!esNocheFinde(p.fecha)) return 1
  if (Number(p.factorEvento) > 1) return 1
  return Math.min(p.prima, PRIMA_FINDE_MAX)
}

/**
 * Prima que el motor APLICÓ a una noche, vista desde el centinela de `pricing/canal`, que solo sabe
 * del evento por `pricing_eventos_auto` (`hayEvento`). Tres estados: `null` = no se sabe (lectura
 * del ritmo caída, o finde primable con el evento sin comprobar) · `1` = no se aplicó · `>1` = prima.
 * `ritmo` = el mapa de `leerRitmoFinde` (null = la lectura falló).
 */
export function primaFindeCentinela(p: {
  fecha: string; pid: string; ritmo: Map<string, RitmoFinde> | null
  habilitados: Set<string>; hayEvento: boolean | null
}): number | null {
  if (!p.habilitados.has(p.pid) || !esNocheFinde(p.fecha)) return 1
  if (p.ritmo == null) return null
  const prima = primaFindeFecha({ fecha: p.fecha, prima: p.ritmo.get(p.pid)?.prima ?? null, factorEvento: 1 })
  if (!(prima > 1)) return 1
  if (p.hayEvento === true) return 1
  if (p.hayEvento == null) return null
  return prima
}

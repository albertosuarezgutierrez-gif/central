// lib/cierre-mes.ts — Cierre contable MENSUAL por unidad (piso o negocio). MÓDULO PURO (sin red ni BD:
// `node --test`). Las lecturas viven en `cierre-mes-db.ts`; el cron en `/api/cron/cierre-mes`.
//
// Cada unidad y mes se evalúa con seis checks, cada uno en TRES estados:
//   · ok          — comprobado y bien.
//   · pendiente   — comprobado y falta algo. `aceptado: true` = falta, pero es lo esperable a estas alturas
//                   (Expedia y Si que Brilla cobran/facturan a mes vencido; Booking paga días después).
//   · no_se_sabe  — no se ha podido comprobar (lectura caída, dato NULL, sin cuenta identificada…).
// Regla del repo: `null` de entrada = «no se sabe», NUNCA 0 / [] / ok. Un `[]` de entrada sí es «revisado: no hay».
//
// Veredicto: «cuadra» SOLO si todo está ok o pendiente aceptado. Un `no_se_sabe` NO cuadra.
import { escapeHtml } from '@central/core-telegram'
import { eur } from './dinero.ts'

// ── Unidades ──────────────────────────────────────────────────────────────────────────────────────
export interface UnidadPiso {
  id: string
  nombre: string
  /** Destino bancario por el que entra/sale su dinero. El banco NO separa pisos dentro de un destino. */
  destino: 'turistico_duplex' | 'turistico_pisos'
}

export const UNIDADES_PISO: UnidadPiso[] = [
  { id: 'prop_duplex_center', nombre: 'Dúplex', destino: 'turistico_duplex' },
  { id: 'prop_house_sevillana', nombre: 'Socorro', destino: 'turistico_pisos' },
  { id: 'prop_luxury_busto', nombre: 'Luxury Busto', destino: 'turistico_pisos' },
  { id: 'prop_busto_reform', nombre: 'Busto Reform', destino: 'turistico_pisos' },
]

const PISO_POR_ID = new Map(UNIDADES_PISO.map(u => [u.id, u]))
/** Gasto compartido entre pisos (lavandería, material…): afecta a TODOS. */
export const PROPIEDAD_COMPARTIDA = 'prop_multi_apartamentos'

export function nombreUnidad(unidad: string): string {
  return PISO_POR_ID.get(unidad)?.nombre ?? unidad
}

/** Pisos que comparten cuenta (pool de cobros) con `unidad`, incluida ella. */
export function pisosDelDestino(destino: string): string[] {
  return UNIDADES_PISO.filter(u => u.destino === destino).map(u => u.id)
}

/**
 * Unidades cuyo cierre afecta a un GASTO con esta `propiedad`. Compartido → todos los pisos (cambia el
 * reparto de todos). Personal, vacío o desconocido → ninguna en F1 (los negocios aún no se cierran).
 */
export function unidadesDeGasto(propiedad: string | null | undefined): string[] {
  if (!propiedad) return []
  if (propiedad === PROPIEDAD_COMPARTIDA) return UNIDADES_PISO.map(u => u.id)
  return PISO_POR_ID.has(propiedad) ? [propiedad] : []
}

/**
 * Unidades afectadas por un MOVIMIENTO bancario. Con `propiedad_id` de un piso → ese piso. Sin él, el
 * movimiento es del destino entero (el banco no separa pisos) → todos los pisos de ese destino.
 */
export function unidadesDeMovimiento(destino: string | null | undefined, propiedadId: string | null | undefined): string[] {
  if (propiedadId && PISO_POR_ID.has(propiedadId)) return [propiedadId]
  if (destino === 'turistico_duplex' || destino === 'turistico_pisos') return pisosDelDestino(destino)
  return []
}

// ── Fechas (strings 'YYYY-MM-DD' / 'YYYY-MM', sin zona horaria) ─────────────────────────────────────
export function mesDe(fecha: string | Date): string {
  const s = typeof fecha === 'string' ? fecha : fecha.toISOString()
  return s.slice(0, 7)
}

export function finDeMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 0))
  return d.toISOString().slice(0, 10)
}

export function mesSiguiente(mes: string, n = 1): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(fecha.slice(0, 10) + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export function etiquetaMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const n = MESES[m - 1] ?? mes
  return `${n[0].toUpperCase()}${n.slice(1)} ${y}`
}

const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

// ── Checks ────────────────────────────────────────────────────────────────────────────────────────
export type EstadoCheck = 'ok' | 'pendiente' | 'no_se_sabe'
export type IdCheck = 'banco' | 'facturas' | 'cobros_ota' | 'limpieza' | 'gastos_fijos' | 'duplicados'

export interface Check {
  id: IdCheck
  titulo: string
  estado: EstadoCheck
  /** Solo con `pendiente`: es lo esperable a estas alturas y no impide cuadrar. */
  aceptado: boolean
  detalle: string
  /** Líneas de detalle (texto plano; el formateador de Telegram escapa). */
  items: string[]
}

const TITULOS: Record<IdCheck, string> = {
  banco: 'Banco al día',
  facturas: 'Cargos y facturas casados',
  cobros_ota: 'Reservas cobradas',
  limpieza: 'Limpieza repartida',
  gastos_fijos: 'Gastos fijos generados',
  duplicados: 'Sin movimientos duplicados',
}

function check(id: IdCheck, estado: EstadoCheck, detalle: string, items: string[] = [], aceptado = false): Check {
  return { id, titulo: TITULOS[id], estado, aceptado: estado === 'pendiente' && aceptado, detalle, items }
}

// a) Banco al día ----------------------------------------------------------------------------------
export interface CuentaUnidad {
  nombre: string
  /** `saldo_fecha`: la sincronización PSD2 lo pone a HOY en cada pasada. NULL = sin sello (Excel/manual). */
  sincronizadaHasta: string | null
  /** Último movimiento leído de esa cuenta. NULL = ninguno. */
  ultimoMovimiento: string | null
}

/** `cuentas` null = no se pudieron leer · [] = ninguna cuenta identificada para la unidad. */
export function checkBanco(cuentas: CuentaUnidad[] | null, mes: string): Check {
  if (cuentas === null) return check('banco', 'no_se_sabe', 'No se pudieron leer las cuentas.')
  if (cuentas.length === 0) return check('banco', 'no_se_sabe', 'Ninguna cuenta bancaria identificada para esta unidad.')
  const fin = finDeMes(mes)
  const atrasadas: string[] = []
  const sinSello: string[] = []
  for (const c of cuentas) {
    const sello = c.sincronizadaHasta
    const ult = c.ultimoMovimiento
    // Hay dato POSTERIOR al fin de mes → el mes entero está dentro.
    if ((sello && sello > fin) || (ult && ult > fin)) continue
    if (!sello) sinSello.push(`${c.nombre}: sin fecha de sincronización${ult ? ` (último movimiento ${ddmm(ult)})` : ''}`)
    else atrasadas.push(`${c.nombre}: sincronizada hasta ${ddmm(sello)}`)
  }
  if (atrasadas.length) return check('banco', 'pendiente', `${atrasadas.length} cuenta(s) sin sincronizar hasta fin de mes.`, [...atrasadas, ...sinSello])
  if (sinSello.length) return check('banco', 'no_se_sabe', 'No se sabe si estas cuentas están al día.', sinSello)
  return check('banco', 'ok', `${cuentas.length} cuenta(s) al día pasado el ${ddmm(fin)}.`)
}

// b) Cargos sin factura y facturas sin cargo -------------------------------------------------------
export interface Apunte { fecha: string; importe: number; nombre: string }

export interface FacturaUnidad { id: string; fecha: string; total: number; nombre: string }
export interface CargoUnidad { id: string; fecha: string; importe: number }

/**
 * Facturas (gastos con documento) sin un cargo bancario que las pague: mismo importe (±1 € o ±2 %) entre 15
 * días antes y 45 después de la fecha de factura. Cada cargo paga UNA factura. Importe ≤ 0 → no se afirma nada.
 */
export function facturasSinCargo(facturas: FacturaUnidad[], cargos: CargoUnidad[]): Apunte[] {
  const usados = new Set<string>()
  const out: Apunte[] = []
  const orden = [...facturas].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id))
  for (const f of orden) {
    if (!(f.total > 0)) continue
    const tol = Math.max(1, f.total * 0.02)
    const desde = sumarDias(f.fecha, -15)
    const hasta = sumarDias(f.fecha, 45)
    const c = cargos.find(c => !usados.has(c.id) && c.fecha >= desde && c.fecha <= hasta && Math.abs(Math.abs(c.importe) - f.total) <= tol)
    if (c) { usados.add(c.id); continue }
    out.push({ fecha: f.fecha, importe: f.total, nombre: f.nombre })
  }
  return out
}

export function checkFacturas(sinFactura: Apunte[] | null, sinCargo: Apunte[] | null): Check {
  if (sinFactura === null || sinCargo === null) return check('facturas', 'no_se_sabe', 'No se pudieron leer cargos o facturas.')
  if (!sinFactura.length && !sinCargo.length) return check('facturas', 'ok', 'Todo cargo de proveedor tiene factura y toda factura su cargo.')
  const items = [
    ...sinFactura.map(x => `Cargo sin factura: ${ddmm(x.fecha)} ${x.nombre} ${eur(x.importe)}`),
    ...sinCargo.map(x => `Factura sin cargo: ${ddmm(x.fecha)} ${x.nombre} ${eur(x.importe)}`),
  ]
  return check('facturas', 'pendiente', `${sinFactura.length} cargo(s) sin factura · ${sinCargo.length} factura(s) sin cargo.`, items)
}

// c) Reservas OTA cobradas ------------------------------------------------------------------------
export interface ReservaCobro { id: string; checkOut: string; base: number | null }
export interface AbonoCobro { fecha: string; importe: number }

/**
 * ¿Qué reservas cubre el dinero recibido? FIFO por checkout sobre el POOL de una cuenta (las OTAs agrupan
 * reservas en una transferencia y el banco no separa pisos: misma idea que `sivra/cobros-ota.ts`). Usa todo
 * lo recibido hasta hoy. `base` null → null (no se sabe) y no consume dinero.
 */
export function coberturaFifo(reservas: ReservaCobro[], abonos: AbonoCobro[], tolerancia = 1): Map<string, boolean | null> {
  let bolsa = abonos.reduce((s, a) => s + (a.importe > 0 ? a.importe : 0), 0)
  const out = new Map<string, boolean | null>()
  const orden = [...reservas].sort((a, b) => a.checkOut.localeCompare(b.checkOut) || a.id.localeCompare(b.id))
  for (const r of orden) {
    if (r.base === null || !Number.isFinite(r.base)) { out.set(r.id, null); continue }
    const toma = Math.min(bolsa, r.base)
    bolsa = Math.round((bolsa - toma) * 100) / 100
    out.set(r.id, r.base - toma <= tolerancia)
  }
  return out
}

export interface ReservaMes {
  id: string
  unidad: string
  canal: string
  checkOut: string
  bruto: number | null
  /** Resultado de `coberturaFifo`. null = no se sabe. */
  cubierta: boolean | null
}

/** Días tras el checkout en que es normal que la OTA aún no haya pagado (mismos plazos que `cobros-ota`). */
export const PLAZO_COBRO_DIAS: Record<string, number> = { BOOKING: 10, AIRBNB: 10, AGODA: 20 }

/** ¿Sigue siendo normal que no haya llegado? Expedia paga a MES VENCIDO: se acepta hasta fin del mes siguiente. */
export function cobroEnPlazo(canal: string, checkOut: string, hoy: string): boolean {
  if (canal === 'EXPEDIA') return hoy <= finDeMes(mesSiguiente(mesDe(checkOut)))
  return hoy <= sumarDias(checkOut, PLAZO_COBRO_DIAS[canal] ?? 10)
}

/**
 * `reservas` = las del MES de todo el pool (todas las unidades que cobran por la misma cuenta). Si en el pool
 * falta dinero ya vencido, la unidad queda pendiente aunque el FIFO lo atribuya a otro piso: el banco no
 * separa pisos y el reparto FIFO no es una prueba de qué reserva quedó sin pagar.
 */
export function checkCobrosOta(reservas: ReservaMes[] | null, unidad: string, hoy: string): Check {
  if (reservas === null) return check('cobros_ota', 'no_se_sabe', 'No se pudieron leer reservas o abonos.')
  const propias = reservas.filter(r => r.unidad === unidad)
  const vencidaSinCobrar = (r: ReservaMes) => r.cubierta === false && !cobroEnPlazo(r.canal, r.checkOut, hoy)
  const linea = (r: ReservaMes) => `${r.canal} salida ${ddmm(r.checkOut)} ${r.bruto === null ? '—' : eur(r.bruto)}`
  const propiasVencidas = propias.filter(vencidaSinCobrar)
  const ajenasVencidas = reservas.filter(r => r.unidad !== unidad && vencidaSinCobrar(r))
  if (propiasVencidas.length || ajenasVencidas.length) {
    const items = [
      ...propiasVencidas.map(r => `Sin cobrar: ${linea(r)}`),
      ...ajenasVencidas.map(r => `Hueco en la cuenta compartida (${nombreUnidad(r.unidad)}, el banco no separa pisos): ${linea(r)}`),
    ]
    return check('cobros_ota', 'pendiente', `${propiasVencidas.length + ajenasVencidas.length} reserva(s) vencida(s) sin cobro en la cuenta.`, items)
  }
  const sinDato = propias.filter(r => r.cubierta === null)
  if (sinDato.length) return check('cobros_ota', 'no_se_sabe', `${sinDato.length} reserva(s) sin importe: no se puede casar.`, sinDato.map(r => `Sin importe: ${r.canal} salida ${ddmm(r.checkOut)}`))
  const enPlazo = propias.filter(r => r.cubierta === false)
  if (enPlazo.length) {
    return check('cobros_ota', 'pendiente', `${enPlazo.length} reserva(s) aún en plazo de cobro.`,
      enPlazo.map(r => `En plazo: ${linea(r)}${r.canal === 'EXPEDIA' ? ' (Expedia paga a mes vencido)' : ''}`), true)
  }
  return check('cobros_ota', 'ok', propias.length ? `${propias.length} reserva(s) OTA cobradas.` : 'Sin reservas OTA en el mes.')
}

// d) Limpieza repartida ---------------------------------------------------------------------------
export interface LimpiezaMes {
  /** Importe de limpieza por piso de la factura de Si que Brilla del PERIODO. null = aún no hay factura. */
  facturaPorPiso: Record<string, number> | null
  /** Salidas (checkouts) del piso en el mes. null = no se sabe. */
  salidas: number | null
}

/** Si que Brilla factura a MES VENCIDO: sin factura del periodo, se acepta hasta fin del mes siguiente. */
export function checkLimpieza(d: LimpiezaMes | null, unidad: string, mes: string, hoy: string): Check {
  if (d === null) return check('limpieza', 'no_se_sabe', 'No se pudo leer la factura de limpieza ni las salidas.')
  if (d.facturaPorPiso) {
    const imp = d.facturaPorPiso[unidad]
    if (imp !== undefined && imp > 0) return check('limpieza', 'ok', `Factura del periodo reparte ${eur(imp)} a este piso.`)
    if (d.salidas === 0) return check('limpieza', 'ok', 'Sin salidas en el mes: nada que repartir.')
    if (d.salidas === null) return check('limpieza', 'no_se_sabe', 'La factura no incluye este piso y no se sabe cuántas salidas tuvo.')
    return check('limpieza', 'pendiente', `La factura del periodo no incluye este piso pese a ${d.salidas} salida(s).`)
  }
  if (d.salidas === 0) return check('limpieza', 'ok', 'Sin salidas en el mes: nada que repartir.')
  const aceptado = hoy <= finDeMes(mesSiguiente(mes))
  const n = d.salidas === null ? '' : ` (${d.salidas} salida(s))`
  return check('limpieza', 'pendiente', aceptado
    ? `Falta la factura de Si que Brilla del periodo${n}: factura a mes vencido.`
    : `Falta la factura de Si que Brilla del periodo${n} y ya debería haber llegado.`, [], aceptado)
}

// e) Gastos fijos ---------------------------------------------------------------------------------
export interface FijosMes { esperados: { huella: string; concepto: string }[]; generadas: string[] }

export function checkGastosFijos(d: FijosMes | null): Check {
  if (d === null) return check('gastos_fijos', 'no_se_sabe', 'No se pudieron leer los gastos fijos.')
  if (!d.esperados.length) return check('gastos_fijos', 'ok', 'Sin gastos fijos para esta unidad.')
  const hechas = new Set(d.generadas)
  const faltan = d.esperados.filter(e => !hechas.has(e.huella))
  if (!faltan.length) return check('gastos_fijos', 'ok', `${d.esperados.length} gasto(s) fijo(s) generados.`)
  return check('gastos_fijos', 'pendiente', `${faltan.length} de ${d.esperados.length} gasto(s) fijo(s) sin generar.`, faltan.map(f => `Falta: ${f.concepto}`))
}

// f) Duplicados -----------------------------------------------------------------------------------
export interface MovDuplicable {
  id: string
  cuenta: string
  fecha: string
  importe: number
  concepto: string | null
  /** 'normal' / 'confirmado' = Alberto ya lo revisó (no es duplicado / es un cobro doble real). */
  duplicadoEstado: string | null
}
export interface GrupoDuplicado { fecha: string; importe: number; concepto: string; n: number }

const normConcepto = (s: string | null) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/** Grupos de misma cuenta + fecha + importe + concepto con más de un movimiento sin revisar. */
export function buscarDuplicados(movs: MovDuplicable[]): GrupoDuplicado[] {
  const grupos = new Map<string, { m: MovDuplicable; n: number }>()
  for (const m of movs) {
    if (m.duplicadoEstado === 'normal' || m.duplicadoEstado === 'confirmado' || m.duplicadoEstado === 'ignorado') continue
    const k = [m.cuenta, m.fecha, m.importe.toFixed(2), normConcepto(m.concepto)].join('|')
    const g = grupos.get(k)
    if (g) g.n++
    else grupos.set(k, { m, n: 1 })
  }
  return [...grupos.values()].filter(g => g.n > 1)
    .map(g => ({ fecha: g.m.fecha, importe: g.m.importe, concepto: g.m.concepto ?? '—', n: g.n }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

export function checkDuplicados(movs: MovDuplicable[] | null): Check {
  if (movs === null) return check('duplicados', 'no_se_sabe', 'No se pudieron leer los movimientos.')
  const g = buscarDuplicados(movs)
  if (!g.length) return check('duplicados', 'ok', `${movs.length} movimiento(s) sin duplicados.`)
  return check('duplicados', 'pendiente', `${g.length} grupo(s) de movimientos repetidos.`,
    g.map(x => `${ddmm(x.fecha)} ${x.concepto} ${eur(x.importe)} ×${x.n}`))
}

// ── Evaluación de una unidad ──────────────────────────────────────────────────────────────────────
export interface DatosCierreUnidad {
  mes: string
  unidad: string
  hoy: string
  cuentas: CuentaUnidad[] | null
  cargosSinFactura: Apunte[] | null
  facturasSinCargo: Apunte[] | null
  reservas: ReservaMes[] | null
  limpieza: LimpiezaMes | null
  fijos: FijosMes | null
  movimientos: MovDuplicable[] | null
}

export type Veredicto = 'cuadra' | 'pendiente' | 'no_se_sabe'

export interface ResultadoUnidad { unidad: string; checks: Check[]; veredicto: Veredicto }

export function veredicto(checks: Check[]): Veredicto {
  if (checks.some(c => c.estado === 'pendiente' && !c.aceptado)) return 'pendiente'
  if (checks.some(c => c.estado === 'no_se_sabe')) return 'no_se_sabe'
  return 'cuadra'
}

export function evaluarUnidad(d: DatosCierreUnidad): ResultadoUnidad {
  const checks = [
    checkBanco(d.cuentas, d.mes),
    checkFacturas(d.cargosSinFactura, d.facturasSinCargo),
    checkCobrosOta(d.reservas, d.unidad, d.hoy),
    checkLimpieza(d.limpieza, d.unidad, d.mes, d.hoy),
    checkGastosFijos(d.fijos),
    checkDuplicados(d.movimientos),
  ]
  return { unidad: d.unidad, checks, veredicto: veredicto(checks) }
}

// ── Cron y botón ──────────────────────────────────────────────────────────────────────────────────
export type Fase = 'pre' | 'cierre'

/** Día 5 → pre-cierre; día 15 → cierre. Cualquier otro día (disparo manual) → pre desde el 1 al 14. */
export function faseDelDia(dia: number): Fase {
  return dia >= 15 ? 'cierre' : 'pre'
}

/** Fecha civil de Madrid ('YYYY-MM-DD') de un instante. */
export function hoyMadrid(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
}

/** Mes anterior al de `hoy` ('YYYY-MM-DD'). */
export function mesACerrar(hoy: string): string {
  return mesSiguiente(mesDe(hoy), -1)
}

export const PREFIJO_CIERRE_MES = 'cmes'
export const ACCION_CERRAR = 'cerrar'

export function callbackCerrar(mes: string): string {
  return `${PREFIJO_CIERRE_MES}_${ACCION_CERRAR}:${mes}`
}

/** Botón ✅ Cerrar mes: solo en la fase de cierre, si TODO cuadra y queda algo sin cerrar. */
export function ofrecerCierre(fase: Fase, res: { veredicto: Veredicto; estado: string | null }[]): boolean {
  return fase === 'cierre' && res.length > 0 && res.every(r => r.veredicto === 'cuadra') && res.some(r => r.estado !== 'cerrado')
}

/** Interpreta `cmes_cerrar:AAAA-MM`. null = botón no válido. */
export function interpretarCallbackCierre(action: string, args: string[]): { mes: string } | null {
  if (action !== ACCION_CERRAR) return null
  const mes = args[0] ?? ''
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? { mes } : null
}

const ICONO: Record<Veredicto, string> = { cuadra: '✅', pendiente: '⚠️', no_se_sabe: '❔' }

function resumenUnidad(r: ResultadoUnidad, estado: string | null): string {
  const nombre = escapeHtml(nombreUnidad(r.unidad))
  if (estado === 'cerrado') return `${nombre} 🔒 cerrado`
  if (r.veredicto === 'cuadra') return `${nombre} ✅ cuadra`
  const n = r.checks.filter(c => r.veredicto === 'pendiente' ? c.estado === 'pendiente' && !c.aceptado : c.estado === 'no_se_sabe').length
  return r.veredicto === 'pendiente' ? `${nombre} ⚠️ ${n} pendiente${n === 1 ? '' : 's'}` : `${nombre} ❔ ${n} sin comprobar`
}

const MAX_ITEMS = 5

/** Telegram (HTML). UN mensaje con el resumen de todas las unidades y la lista de lo que falta. */
export function formatearResumenCierre(p: {
  mes: string
  fase: Fase
  resultados: ResultadoUnidad[]
  estados?: Record<string, string | null>
}): string {
  const est = p.estados ?? {}
  const L: string[] = []
  const titulo = p.fase === 'pre' ? 'pre-cierre' : 'cierre'
  L.push(`📒 <b>${escapeHtml(etiquetaMes(p.mes))}</b> (${titulo}): ${p.resultados.map(r => resumenUnidad(r, est[r.unidad] ?? null)).join(' · ')}`)
  for (const r of p.resultados) {
    if (est[r.unidad] === 'cerrado') continue
    const malos = r.checks.filter(c => c.estado !== 'ok')
    if (!malos.length) continue
    L.push('', `<b>${escapeHtml(nombreUnidad(r.unidad))}</b> ${ICONO[r.veredicto]}`)
    for (const c of malos) {
      const marca = c.estado === 'no_se_sabe' ? '❔' : c.aceptado ? '⏳' : '⚠️'
      L.push(`${marca} ${escapeHtml(c.titulo)}: ${escapeHtml(c.detalle)}`)
      for (const it of c.items.slice(0, MAX_ITEMS)) L.push(`   · ${escapeHtml(it)}`)
      if (c.items.length > MAX_ITEMS) L.push(`   · … y ${c.items.length - MAX_ITEMS} más`)
    }
  }
  if (p.fase === 'cierre' && p.resultados.every(r => r.veredicto === 'cuadra')) L.push('', 'Todo cuadra: puedes cerrar el mes.')
  L.push('', '<i>⏳ = pendiente aceptado (a mes vencido / en plazo) · ❔ = no se ha podido comprobar.</i>')
  return L.join('\n')
}

// ── Guard de escrituras ───────────────────────────────────────────────────────────────────────────
export interface ParMesUnidad { mes: string; unidad: string }

/** Pares (mes, unidad) que una escritura toca y que están cerrados. Vacío = se puede escribir. */
export function paresBloqueados(tocados: ParMesUnidad[], cerrados: ParMesUnidad[]): ParMesUnidad[] {
  const c = new Set(cerrados.map(x => `${x.mes}|${x.unidad}`))
  const vistos = new Set<string>()
  const out: ParMesUnidad[] = []
  for (const t of tocados) {
    const k = `${t.mes}|${t.unidad}`
    if (c.has(k) && !vistos.has(k)) { vistos.add(k); out.push(t) }
  }
  return out
}

/** Pares que toca un gasto con esta fecha y propiedad. Fecha inválida → ninguno (lo rechaza la validación). */
export function paresDeGasto(fecha: string | null | undefined, propiedad: string | null | undefined): ParMesUnidad[] {
  if (!fecha || !/^\d{4}-\d{2}/.test(fecha)) return []
  const mes = fecha.slice(0, 7)
  return unidadesDeGasto(propiedad).map(unidad => ({ mes, unidad }))
}

export function mensajeBloqueo(b: ParMesUnidad[]): string {
  const lista = b.map(x => `${nombreUnidad(x.unidad)} ${etiquetaMes(x.mes)}`).join(', ')
  return `Mes cerrado (${lista}). Reábrelo con motivo (POST /api/cierres-mes/reabrir) antes de tocarlo.`
}

// ── Titularidad ───────────────────────────────────────────────────────────────────────────────────
/** Porcentajes por piso: cada piso debe sumar 100. Devuelve los pisos que NO suman 100. */
export function titularidadDescuadrada(filas: { propiedadId: string; porcentaje: number }[]): string[] {
  const suma = new Map<string, number>()
  for (const f of filas) suma.set(f.propiedadId, (suma.get(f.propiedadId) ?? 0) + f.porcentaje)
  return [...suma].filter(([, s]) => Math.abs(s - 100) > 0.001).map(([p]) => p)
}

// ── Decisiones puras de I/O ───────────────────────────────────────────────────────────────────────
/**
 * Unidades que impiden cerrar: no cuadran Y no están ya cerradas (un mes `cerrado` es un snapshot:
 * lo que cambie después no lo bloquea; se corrige reabriéndolo).
 */
export function unidadesQueNoCuadran(resultados: { unidad: string; veredicto: Veredicto }[], estados: Record<string, string>): string[] {
  return resultados.filter(r => r.veredicto !== 'cuadra' && estados[r.unidad] !== 'cerrado').map(r => r.unidad)
}

/**
 * Si falla la lectura de `cierres_mes` al generar fijos: 503 solo para meses PASADOS (podrían estar
 * cerrados). El mes actual o futuro no puede estar cerrado, así que se sigue con el conjunto vacío.
 */
export function lecturaCerradosFallidaBloquea(mes: string, hoy: string): boolean {
  return mes < mesDe(hoy)
}

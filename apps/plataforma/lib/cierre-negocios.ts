// Cierre mensual por negocio + revisión de suscripciones + «cargos sin factura».
// MÓDULO PURO (sin red ni BD → `node --test`). Los SQL viven en `resumen-mensual.ts`.
// Regla: null = «no se sabe». Nunca `?? 0` para afirmar; un total sin dato se muestra «—».
import { escapeHtml } from '@central/core-telegram'
import { eur, eurSinDecimales } from './dinero.ts'
import { DESTINO_LABEL, type Destino } from './destino.ts'

// ── Proveedor: clave estable a partir de contraparte / concepto / nombre de factura ───────────────
const RUIDO = new Set([
  'recibo', 'adeudo', 'pago', 'con', 'tarjeta', 'tarj', 'crdto', 'compra', 'comercio', 'extranjero', 'comision',
  'incluida', 'transf', 'sepa', 'directo', 'cargo', 'factura', 'envio', 'ordenes', 'emitidas', 'moneda', 'local',
  'los', 'las', 'del', 'por', 'una', 'que', 'servicios', 'discos', 'libros', 'fotos', 'medicina', 'farmacia',
  'sanidad', 'grupo', 'asociacion', 'cdad', 'comunidad', 'prop', 'propietarios',
  'limited', 'ltd', 'inc', 'bv', 'slu', 'sau', 'cloud', 'ireland', 'spain', 'espana', 'cia', 'sub',
])

/** Primera palabra significativa (≥4 letras, sin ruido bancario ni forma jurídica). null = no hay. */
export function claveProveedor(texto: string | null | undefined): string | null {
  if (!texto) return null
  const limpio = texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z\s]/g, ' ')
  for (const t of limpio.split(/\s+/)) {
    if (t.length >= 4 && !RUIDO.has(t)) return t
  }
  return null
}

/** Clave de un movimiento: contraparte si da una, si no el concepto normalizado. */
export function claveMovimiento(contraparte: string | null, concepto: string | null): string | null {
  // «COMPRA EN <comercio>» sin contraparte = gasto suelto de tarjeta (súper, gasolinera), no proveedor.
  if (!(contraparte ?? '').trim() && /^\s*compra en\b/i.test(concepto ?? '')) return null
  return claveProveedor(contraparte) ?? claveProveedor(concepto)
}

// ── 1. Suscripciones ──────────────────────────────────────────────────────────────────────────────
export type ItemGasto = { clave: string | null; nombre: string; mes: string; importe: number; fuente: 'banco' | 'factura' }
export type Suscripcion = { clave: string; nombre: string; meses: number; mensual: number; anual: number }

/** Últimos `n` meses 'YYYY-MM' que terminan en `mesFin` (inclusive), del más antiguo al más nuevo. */
export function ultimosMeses(mesFin: string, n: number): string[] {
  const [y, m] = mesFin.split('-').map(Number)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

// Cargos periódicos que NO se pueden «cancelar» (Seguridad Social, hipoteca/préstamo, impuestos y tasas).
const NO_CANCELABLE = /seguridad social|\btgss\b|\bptmo\b|pr[eé]stamo|hipoteca|impuesto|recaudaci[oó]n|ayuntamiento|\bayto\b/i

/**
 * Proveedor con cargo en ≥ `minMeses` de los `meses` dados. Por proveedor y mes manda el BANCO (lo
 * realmente cobrado); la factura solo cubre los meses sin cargo bancario (evita contar dos veces el
 * mismo gasto). Mensual = total / meses con cargo; anual = mensual × 12. Orden: anual desc.
 */
export function detectarSuscripciones(items: ItemGasto[], meses: string[], minMeses = 3): { lista: Suscripcion[]; totalAnual: number } {
  const set = new Set(meses)
  const porClave = new Map<string, { nombre: string; banco: Map<string, number>; factura: Map<string, number> }>()
  for (const it of items) {
    if (!it.clave || !set.has(it.mes) || !(it.importe > 0) || NO_CANCELABLE.test(it.nombre)) continue
    const e = porClave.get(it.clave) ?? { nombre: it.nombre, banco: new Map(), factura: new Map() }
    const mapa = it.fuente === 'banco' ? e.banco : e.factura
    mapa.set(it.mes, (mapa.get(it.mes) ?? 0) + it.importe)
    if (it.fuente === 'banco' || !e.nombre) e.nombre = it.nombre || e.nombre
    porClave.set(it.clave, e)
  }
  const lista: Suscripcion[] = []
  for (const [clave, e] of porClave) {
    const porMes = new Map<string, number>()
    for (const mes of meses) {
      const v = e.banco.get(mes) ?? e.factura.get(mes)
      if (v !== undefined) porMes.set(mes, v)
    }
    if (porMes.size < minMeses) continue
    const total = [...porMes.values()].reduce((s, v) => s + v, 0)
    const mensual = total / porMes.size
    lista.push({ clave, nombre: e.nombre || clave, meses: porMes.size, mensual, anual: mensual * 12 })
  }
  lista.sort((a, b) => b.anual - a.anual)
  return { lista, totalAnual: lista.reduce((s, x) => s + x.anual, 0) }
}

// ── 2a. Cierre por destino ────────────────────────────────────────────────────────────────────────
export type MovCierre = { importe: number; destino: string | null; conciliado: boolean | null; facturaRef: string | null }
export type FilaDestino = { destino: string; gastos: number; ingresos: number; pendientesN: number; pendientesEur: number | null }

const ORDEN_DESTINOS = ['seguros', 'turistico_pisos', 'turistico_duplex', 'actividad_pilar', 'personal']
const SIN_FACTURA_NO_APLICA = new Set(['personal', 'traspaso_interno'])

/** Un movimiento está casado si tiene factura_ref o conciliado = true. */
export function estaCasado(m: { conciliado: boolean | null; facturaRef: string | null }): boolean {
  return m.conciliado === true || (m.facturaRef ?? '').trim() !== ''
}

/** Gastos/ingresos y pendientes de conciliar por destino. Traspasos internos y destino null quedan fuera. */
export function agruparPorDestino(movs: MovCierre[]): FilaDestino[] {
  const mapa = new Map<string, FilaDestino>()
  for (const m of movs) {
    if (!m.destino || m.destino === 'traspaso_interno') continue
    const f = mapa.get(m.destino) ?? { destino: m.destino, gastos: 0, ingresos: 0, pendientesN: 0, pendientesEur: 0 }
    if (m.importe < 0) f.gastos += -m.importe; else f.ingresos += m.importe
    // Personal no se concilia contra facturas de negocio: su pendiente no se afirma (null, no 0).
    if (m.destino === 'personal') f.pendientesEur = null
    else if (!estaCasado(m)) { f.pendientesN++; f.pendientesEur = (f.pendientesEur ?? 0) + Math.abs(m.importe) }
    mapa.set(m.destino, f)
  }
  const idx = (d: string) => { const i = ORDEN_DESTINOS.indexOf(d); return i < 0 ? 99 : i }
  return [...mapa.values()].sort((a, b) => idx(a.destino) - idx(b.destino))
}

// ── 2b. Cargos sin factura ────────────────────────────────────────────────────────────────────────
export type CargoBanco = { id: string; fecha: string; importe: number; destino: string | null; clave: string | null; nombre: string; conciliado: boolean | null; facturaRef: string | null }
export type FacturaDoc = { clave: string | null; fecha: string; importe: number }
export type CargoSinFactura = { id: string; fecha: string; importe: number; nombre: string }

function diasEntre(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000
}

/**
 * Cargos (importe < 0) de más de `minImporte` € en destinos de negocio, de un proveedor que SÍ suele
 * facturar (su clave aparece en `facturas` históricas), sin factura_ref/conciliado y sin factura del
 * mismo proveedor a ±`dias` días con importe parecido (±10 % o 1 €). Cada factura casa con un solo cargo.
 * Cargo sin clave de proveedor → no se afirma nada (no se sabe quién es).
 */
export function cargosSinFactura(
  cargos: CargoBanco[], facturas: FacturaDoc[], opts: { minImporte?: number; dias?: number } = {},
): { lista: CargoSinFactura[]; total: number } {
  const minImporte = opts.minImporte ?? 20
  const dias = opts.dias ?? 10
  const facturan = new Set(facturas.map(f => f.clave).filter((c): c is string => !!c))
  const usadas = new Set<number>()
  const lista: CargoSinFactura[] = []
  const orden = [...cargos].sort((a, b) => a.fecha.localeCompare(b.fecha))
  for (const c of orden) {
    const gasto = -c.importe
    if (!(gasto > minImporte)) continue
    if (!c.destino || SIN_FACTURA_NO_APLICA.has(c.destino)) continue
    if (!c.clave || !facturan.has(c.clave)) continue
    if (estaCasado(c)) continue
    const tol = Math.max(1, gasto * 0.1)
    const i = facturas.findIndex((f, k) => !usadas.has(k) && f.clave === c.clave && diasEntre(f.fecha, c.fecha) <= dias && Math.abs(f.importe - gasto) <= tol)
    if (i >= 0) { usadas.add(i); continue }
    lista.push({ id: c.id, fecha: c.fecha, importe: gasto, nombre: c.nombre })
  }
  lista.sort((a, b) => b.importe - a.importe)
  return { lista, total: lista.reduce((s, x) => s + x.importe, 0) }
}

// ── Formato Telegram (HTML, escapeHtml en todo texto de BD) ───────────────────────────────────────
const TOP = 10
const etiqueta = (d: string) => escapeHtml(DESTINO_LABEL[d as Destino] ?? d)

export type DatosCierre = {
  label: string
  filas: FilaDestino[]
  ivaSoportado: number | null
  facturasSinIva: number
  sinFactura: { lista: CargoSinFactura[]; total: number }
  puntoYComa: { movimientos: number; gastos: number; ingresos: number } | null
}

export function formatearCierre(d: DatosCierre): string {
  const L: string[] = [`📒 <b>Cierre de ${escapeHtml(d.label)} por negocio</b>`, '']
  if (d.filas.length === 0) L.push('Sin movimientos bancarios en el mes.')
  for (const f of d.filas) {
    const pend = f.pendientesEur === null ? '' : ` · sin conciliar ${f.pendientesN} (${eur(f.pendientesEur)})`
    L.push(`${etiqueta(f.destino)}: gastos ${eur(f.gastos)} · ingresos ${eur(f.ingresos)}${pend}`)
  }
  L.push('')
  L.push(d.ivaSoportado === null
    ? '🧾 IVA soportado: — (sin facturas con IVA leído)'
    : `🧾 IVA soportado (facturas): ${eur(d.ivaSoportado)}${d.facturasSinIva > 0 ? ` · ${d.facturasSinIva} sin IVA leído` : ''}`)
  if (d.puntoYComa) {
    L.push('', `🏢 Punto y Coma SL (paralizada): ${d.puntoYComa.movimientos} mov. · gastos ${eur(d.puntoYComa.gastos)} · ingresos ${eur(d.puntoYComa.ingresos)}`)
  }
  const sf = d.sinFactura
  if (sf.lista.length > 0) {
    L.push('', `⚠️ Te faltan <b>${sf.lista.length}</b> facturas por <b>${eur(sf.total)}</b>: sin ellas no puedes deducir.`)
    for (const x of sf.lista.slice(0, TOP)) L.push(`· ${x.fecha.slice(8, 10)}/${x.fecha.slice(5, 7)} ${escapeHtml(x.nombre)} ${eur(x.importe)}`)
    if (sf.lista.length > TOP) L.push(`… y ${sf.lista.length - TOP} más`)
  } else {
    L.push('', '✅ Todos los cargos bancarios de proveedores que facturan tienen su factura.')
  }
  return L.join('\n')
}

export function formatearSuscripciones(r: { lista: Suscripcion[]; totalAnual: number }, ventanaMeses: number): string | null {
  if (r.lista.length === 0) return null
  const L: string[] = [`🔁 <b>Revisión de suscripciones</b> (cargos en ≥3 de los últimos ${ventanaMeses} meses)`, '']
  for (const s of r.lista.slice(0, TOP)) {
    L.push(`· ${escapeHtml(s.nombre)}: ${eur(s.mensual)}/mes · ${eurSinDecimales(s.anual)}/año`)
  }
  if (r.lista.length > TOP) {
    const resto = r.lista.slice(TOP)
    L.push(`… y ${resto.length} más (${eurSinDecimales(resto.reduce((s, x) => s + x.anual, 0))}/año)`)
  }
  L.push('', `💸 Total anual estimado: <b>${eurSinDecimales(r.totalAnual)}</b>`, '¿Sigue valiendo cada una? Cancela las que no.')
  return L.join('\n')
}

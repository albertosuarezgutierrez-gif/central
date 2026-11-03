// lib/sivra/factura-verificacion.ts — VERIFICACIÓN de la factura mensual de Si que Brilla (SQB). Puro.
//
// Alberto paga a SQB siempre él, a mano, por transferencia (el banco le pide contraseña): para SQB
// el aviso 🧾 de Telegram NO es de pago sino de VERIFICACIÓN — ¿lo facturado cuadra con lo hecho?
//   1. Limpiezas: salidas del mes de servicio POR PISO × tarifa cerrada (`LIMPIEZA_TARIFAS`).
//   2. Lavandería (sin precio cerrado): huéspedes × noches × coste medio por huésped-noche sacado
//      del histórico de facturas SQB anteriores, con banda ±15 %. Sin histórico → «sin referencia»,
//      nunca ✅ (dato que NO hay ≠ 0).
// Sin red ni BD: el borde sucio está en `factura-verificacion-db.ts`. Imports con extensión .ts
// para que `node --test` lo corra tal cual (como `factura-cuadre.ts`).
import { eur } from '../dinero.ts'
import { IVA_LIMPIEZA } from './reparto-siquebrilla.ts'

/** NIF de Si Que Brilla SL (skill facturas-correo, patrón SIQUE). La identidad manda sobre el nombre. */
export const NIF_SQB = 'B22992523'
/** Banda de la lavandería respecto a la estimación: ±15 %. */
export const BANDA_LAVANDERIA = 0.15
/** Meses facturados con lavandería necesarios para fiarse del coste medio. */
export const MIN_MESES_HISTORICO = 3
const TOL = 0.02

const r2 = (n: number) => Math.round(n * 100) / 100
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function normalizaNif(s?: string | null): string {
  let v = (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (v.length === 11 && v.startsWith('ES')) v = v.slice(2)
  return v
}

/**
 * ¿Es Si Que Brilla? Por NIF si se conoce (un NIF distinto es OTRA empresa aunque se llame parecido);
 * sin NIF, por la clave del nombre (todo el nombre en letras, no una palabra suelta).
 */
export function esProveedorSqb(p: { nif?: string | null; proveedor?: string | null }): boolean {
  const nif = normalizaNif(p.nif)
  if (nif) return nif === NIF_SQB
  const clave = (p.proveedor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase()
  return clave.startsWith('SIQUEBRILLA')
}

// ── Lavandería ───────────────────────────────────────────────────────────────────────────────

export interface ReservaAforo {
  nights: number | null
  adults: number | null
  children: number | null
  /** Capacidad del piso: fallback cuando la reserva no trae aforo (regla de `lavanderia-peso.ts`). */
  maxGuests: number | null
}

/**
 * Huésped-noches del mes. Huéspedes reales (adults+children); si la reserva no trae NINGUNO de los dos
 * cae a la capacidad del piso (misma regla que `pesoLavanderia`). Si algo no se puede resolver
 * (noches o aforo y capacidad desconocidos) → `null`, no un total que ignore esa reserva.
 */
export function huespedNoches(reservas: ReservaAforo[]): number | null {
  let total = 0
  for (const r of reservas) {
    if (r.nights == null) return null
    const real = r.adults == null && r.children == null ? null : (r.adults ?? 0) + (r.children ?? 0)
    const h = real ?? r.maxGuests
    if (h == null) return null
    total += r.nights * h
  }
  return total
}

export interface MesLavanderia {
  /** Lavandería facturada SIN IVA ese mes. */
  lavanderia: number | null
  /** Huésped-noches del mes; null = no se pudo calcular. */
  huespedNoches: number | null
}

/**
 * Coste medio por huésped-noche = Σ lavandería facturada / Σ huésped-noches, sobre los meses de
 * histórico con lavandería > 0 Y huésped-noches conocidas > 0. Un mes con lavandería 0 no cuenta
 * (hasta jun-2026 SQB no la facturaba aparte: meterlo como 0 hundiría la media). Menos de
 * `MIN_MESES_HISTORICO` meses válidos → `null` («sin referencia»).
 */
export function costeMedioLavanderia(historico: MesLavanderia[], minMeses = MIN_MESES_HISTORICO): number | null {
  const validos = historico.filter((m) => m.lavanderia != null && m.lavanderia > 0 && m.huespedNoches != null && m.huespedNoches > 0)
  if (validos.length < minMeses) return null
  const lav = validos.reduce((s, m) => s + (m.lavanderia as number), 0)
  const hn = validos.reduce((s, m) => s + (m.huespedNoches as number), 0)
  return Math.round((lav / hn) * 10000) / 10000
}

export interface EstimacionLavanderia {
  estado: 'ok' | 'fuera' | 'sin_referencia'
  estimada: number | null
  facturada: number
  /** (facturada − estimada) / estimada × 100; null si no hay estimación. */
  desvioPct: number | null
}

export function estimarLavanderia(p: {
  huespedNoches: number | null
  coste: number | null
  facturada: number
  banda?: number
}): EstimacionLavanderia {
  const banda = p.banda ?? BANDA_LAVANDERIA
  if (p.huespedNoches == null || p.coste == null) {
    return { estado: 'sin_referencia', estimada: null, facturada: p.facturada, desvioPct: null }
  }
  const estimada = r2(p.huespedNoches * p.coste)
  if (estimada <= 0) {
    return { estado: p.facturada > TOL ? 'fuera' : 'ok', estimada, facturada: p.facturada, desvioPct: null }
  }
  const desvio = (p.facturada - estimada) / estimada
  return {
    estado: Math.abs(desvio) <= banda + 1e-9 ? 'ok' : 'fuera',
    estimada,
    facturada: p.facturada,
    desvioPct: Math.round(desvio * 1000) / 10,
  }
}

// ── Limpiezas por piso ───────────────────────────────────────────────────────────────────────

export interface LineaLimp { propertyId: string; sesiones: number; importe: number }

export type EstadoPiso = 'ok' | 'sobra' | 'falta' | 'tarifa' | 'sin_tarifa'

export interface PisoVerif {
  propertyId: string
  nombre: string
  facturadas: number
  esperadas: number
  importeFacturado: number
  /** esperadas × tarifa cerrada (SIN IVA); null si el piso no tiene tarifa cerrada. */
  importeEsperado: number | null
  estado: EstadoPiso
  nota: string
}

/**
 * Cuadre por piso: sesiones facturadas vs salidas del mes (reservas no canceladas), y el importe
 * contra la tarifa cerrada. Explica la diferencia con lo que sabe: salidas canceladas del mes y
 * órdenes extra registradas (`sivra_ordenes_limpieza`) → posible limpieza extra.
 */
export function cuadrePorPiso(p: {
  lineas: LineaLimp[]
  salidas: Record<string, number>
  canceladas?: Record<string, number>
  ordenesExtra?: Record<string, number>
  tarifas: Record<string, number>
  nombres: Record<string, string>
}): PisoVerif[] {
  const ids = new Set<string>([...Object.keys(p.nombres), ...p.lineas.map((l) => l.propertyId), ...Object.keys(p.salidas)])
  const out: PisoVerif[] = []
  for (const propertyId of ids) {
    const mias = p.lineas.filter((l) => l.propertyId === propertyId)
    const facturadas = mias.reduce((s, l) => s + l.sesiones, 0)
    const importeFacturado = r2(mias.reduce((s, l) => s + l.importe, 0))
    const esperadas = p.salidas[propertyId] ?? 0
    const tarifa = p.tarifas[propertyId]
    const importeEsperado = tarifa != null ? r2(esperadas * tarifa) : null
    const canc = p.canceladas?.[propertyId] ?? 0
    const ext = p.ordenesExtra?.[propertyId] ?? 0
    let estado: EstadoPiso = 'ok'
    const notas: string[] = []
    if (facturadas > esperadas) {
      estado = 'sobra'
      notas.push(`${facturadas - esperadas} limpieza(s) de más (¿extra?)`)
      if (canc > 0) notas.push(`${canc} salida(s) cancelada(s) en el mes: ¿la ha cobrado?`)
      if (ext > 0) notas.push(`${ext} orden(es) extra registrada(s)`)
    } else if (facturadas < esperadas) {
      estado = 'falta'
      notas.push(facturadas === 0 ? 'piso sin facturar' : `${esperadas - facturadas} limpieza(s) sin facturar`)
    } else if (tarifa == null) {
      if (facturadas > 0) { estado = 'sin_tarifa'; notas.push('sin tarifa cerrada para contrastar') }
    } else if (Math.abs(importeFacturado - facturadas * tarifa) > TOL) {
      estado = 'tarifa'
      notas.push(`importe ${eur(importeFacturado)} ≠ ${facturadas} × ${eur(tarifa)}`)
    }
    out.push({
      propertyId, nombre: p.nombres[propertyId] ?? propertyId, facturadas, esperadas,
      importeFacturado, importeEsperado, estado, nota: notas.join(' · '),
    })
  }
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre))
}

// ── Veredicto ────────────────────────────────────────────────────────────────────────────────

export interface EntradaVerificacion {
  periodo: string | null
  numero: string | null
  totalFactura: number
  pisos: PisoVerif[]
  lavanderia: EstimacionLavanderia
  costeMedio: number | null
  huespedNoches: number | null
  /** Errores aritméticos de la propia factura (de `comprobarAritmetica`). */
  aritmetica?: string[]
  desconocidas?: string[]
  /** Reservas sin fecha de salida: impiden el ✅. */
  sinFechaSalida?: number
}

export interface Verificacion extends EntradaVerificacion {
  /** (Σ limpieza esperada + lavandería estimada) × 1,21; null si falta alguna pieza. */
  totalEsperado: number | null
  veredicto: 'ok' | 'revisar'
  motivos: string[]
}

export function verificarFacturaSqb(e: EntradaVerificacion): Verificacion {
  const motivos: string[] = []
  for (const p of e.pisos) {
    if (p.estado !== 'ok') motivos.push(`${p.nombre}: ${p.nota}`)
  }
  if (e.lavanderia.estado === 'fuera') {
    const d = e.lavanderia.desvioPct
    motivos.push(d == null ? 'Lavandería facturada sin que haya huéspedes' : `Lavandería ${d > 0 ? '+' : ''}${fmtPct(d)} sobre lo estimado`)
  } else if (e.lavanderia.estado === 'sin_referencia') {
    motivos.push('Lavandería sin referencia (histórico insuficiente): no puedo validarla')
  }
  for (const a of e.aritmetica ?? []) motivos.push(`Aritmética: ${a}`)
  for (const d of e.desconocidas ?? []) motivos.push(`Línea desconocida: «${d}»`)
  if ((e.sinFechaSalida ?? 0) > 0) motivos.push(`${e.sinFechaSalida} reserva(s) sin fecha de salida: salidas no verificables`)

  const limpiezaEsperada = e.pisos.every((p) => p.importeEsperado != null) || e.pisos.every((p) => p.importeEsperado != null || p.esperadas === 0)
    ? r2(e.pisos.reduce((s, p) => s + (p.importeEsperado ?? 0), 0))
    : null
  const totalEsperado = limpiezaEsperada != null && e.lavanderia.estimada != null
    ? r2((limpiezaEsperada + e.lavanderia.estimada) * (1 + IVA_LIMPIEZA))
    : null
  return { ...e, totalEsperado, veredicto: motivos.length ? 'revisar' : 'ok', motivos }
}

const fmtPct = (n: number) => `${Math.abs(n).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} %`

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
function mesLegible(periodo: string | null): string {
  if (!periodo) return 'mes sin determinar'
  const m = MESES[Number(periodo.slice(5, 7)) - 1] ?? periodo
  return `${m} ${periodo.slice(0, 4)}`
}

/** Texto del aviso 🧾 de Telegram (HTML) para SQB: desglose corto + veredicto + «pendiente de tu transferencia». */
export function mensajeVerificacionSqb(v: Verificacion): string {
  const l: string[] = []
  l.push(`🧾 <b>Si Que Brilla</b> · ${esc(mesLegible(v.periodo))}${v.numero ? ` (nº ${esc(v.numero)})` : ''} · ${eur(v.totalFactura)}`)
  for (const p of v.pisos) {
    if (p.facturadas === 0 && p.esperadas === 0) continue
    l.push(`${p.estado === 'ok' ? '✔' : '✖'} ${esc(p.nombre)}: ${p.facturadas} facturadas vs ${p.esperadas} esperadas${p.estado === 'ok' ? '' : ` — ${esc(p.nota)}`}`)
  }
  const lav = v.lavanderia
  if (lav.estado === 'sin_referencia') {
    l.push(`❔ Lavandería: facturada ${eur(lav.facturada)} · sin referencia`)
  } else {
    const coste = v.costeMedio != null ? ` (${v.huespedNoches ?? '?'} huésped-noches × ${v.costeMedio.toLocaleString('es-ES', { maximumFractionDigits: 3 })}€)` : ''
    const d = lav.desvioPct != null ? ` · ${lav.desvioPct > 0 ? '+' : '-'}${fmtPct(lav.desvioPct)}` : ''
    l.push(`${lav.estado === 'ok' ? '✅' : '⚠️'} Lavandería: estimada ${eur(lav.estimada)}${coste} vs facturada ${eur(lav.facturada)}${d}`)
  }
  l.push(`Total: esperado ${v.totalEsperado != null ? eur(v.totalEsperado) : 'sin calcular'} vs factura ${eur(v.totalFactura)} (IVA incl.)`)
  l.push(v.veredicto === 'ok' ? '✅ <b>Cuadra</b> con lo hecho.' : `⚠️ <b>Revisar</b>: ${esc(v.motivos.join('; '))}`)
  l.push('Pendiente de tu transferencia.')
  return l.join('\n')
}

export interface BotonTg { texto: string; callback: string }

/** Botones del aviso de SQB: SIN «Pagar» (paga Alberto a mano). Solo Aplazar y Rechazar. */
export function botonesVerificacionSqb(facturaId: string): BotonTg[][] {
  return [[
    { texto: '⏳ Aplazar', callback: `pago_aplazar:${facturaId}` },
    { texto: '❌ Rechazar', callback: `pago_rechazar:${facturaId}` },
  ]]
}

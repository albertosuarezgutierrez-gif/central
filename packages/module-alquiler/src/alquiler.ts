// Lógica pura del módulo ALQUILER (sin BD). Precio por días, máquina de estados de fulfillment,
// recargo por retraso, disponibilidad por solape de fechas y consolidación intercompany.
import type {
  Alquiler,
  EstadoAlquiler,
  LineaAlquiler,
  OperacionIntercompanyDeAlquiler,
  ResumenAlquileres,
} from './types'

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export const ESTADOS: EstadoAlquiler[] = ['reservado', 'entregado', 'devuelto', 'cancelado']
export const ESTADOS_ACTIVOS: EstadoAlquiler[] = ['reservado', 'entregado']

// Máquina de estados del fulfillment: reservado → entregado → devuelto. Se puede cancelar
// mientras no se haya devuelto.
export const TRANSICIONES: Record<EstadoAlquiler, EstadoAlquiler[]> = {
  reservado: ['entregado', 'cancelado'],
  entregado: ['devuelto', 'cancelado'],
  devuelto: [],
  cancelado: [],
}

export function puedeTransicionar(desde: EstadoAlquiler, hacia: EstadoAlquiler): boolean {
  return TRANSICIONES[desde]?.includes(hacia) ?? false
}

/** Transición inmutable: devuelve un nuevo Alquiler o lanza si la transición no es válida. */
export function transicionar(a: Alquiler, hacia: EstadoAlquiler): Alquiler {
  if (!puedeTransicionar(a.estado, hacia)) {
    throw new Error(`Transición de alquiler inválida: ${a.estado} → ${hacia}`)
  }
  return { ...a, estado: hacia }
}

/** Días de alquiler (inclusivos, mínimo 1). Fechas ISO yyyy-mm-dd. */
export function diasAlquiler(fechaInicio: string, fechaFin: string): number {
  const ini = Date.parse(fechaInicio)
  const fin = Date.parse(fechaFin)
  if (Number.isNaN(ini) || Number.isNaN(fin)) return 1
  const dias = Math.floor((fin - ini) / 86_400_000) + 1
  return Math.max(1, dias)
}

/** Importe de una línea: tarifa fija por unidad (si está) o tarifa por unidad y día. */
export function importeLinea(linea: LineaAlquiler, dias: number): number {
  if (linea.tarifaFija != null) return round2(linea.tarifaFija * linea.cantidad)
  return round2(linea.tarifaDia * linea.cantidad * Math.max(1, dias))
}

/** Subtotal del alquiler (suma de líneas por sus días). */
export function subtotal(a: Alquiler): number {
  const dias = diasAlquiler(a.fechaInicio, a.fechaFin)
  return round2(a.lineas.reduce((s, l) => s + importeLinea(l, dias), 0))
}

/** Total = subtotal − descuento (nunca negativo). La fianza NO suma (es un depósito reembolsable). */
export function totalAlquiler(a: Alquiler): number {
  const desc = Math.max(0, a.descuentoEur ?? 0)
  return round2(Math.max(0, subtotal(a) - desc))
}

/** Días de retraso en la devolución (0 si se devolvió a tiempo o no se ha devuelto). */
export function diasRetraso(a: Alquiler): number {
  if (!a.fechaDevolucionReal) return 0
  const fin = Date.parse(a.fechaFin)
  const real = Date.parse(a.fechaDevolucionReal)
  if (Number.isNaN(fin) || Number.isNaN(real)) return 0
  return Math.max(0, Math.floor((real - fin) / 86_400_000))
}

/** Recargo por devolución tardía: días de retraso × tarifa/día de las líneas (las de tarifa fija no recargan). */
export function recargoRetraso(a: Alquiler): number {
  const dr = diasRetraso(a)
  if (dr === 0) return 0
  const tarifaDiaTotal = a.lineas.reduce(
    (s, l) => s + (l.tarifaFija != null ? 0 : l.tarifaDia * l.cantidad),
    0,
  )
  return round2(tarifaDiaTotal * dr)
}

/** ¿Se solapan dos ventanas [aIni,aFin] y [bIni,bFin]? (fechas ISO, inclusivo) */
export function solapa(aIni: string, aFin: string, bIni: string, bFin: string): boolean {
  return Date.parse(aIni) <= Date.parse(bFin) && Date.parse(bIni) <= Date.parse(aFin)
}

/**
 * Unidades de un material comprometidas en una ventana de fechas (alquileres activos que solapan).
 * Sirve para calcular disponibilidad junto al stock total de @central/module-materiales.
 */
export function comprometidoEnVentana(
  alquileres: Alquiler[],
  materialId: string,
  inicio: string,
  fin: string,
): number {
  let total = 0
  for (const a of alquileres) {
    if (!ESTADOS_ACTIVOS.includes(a.estado)) continue
    if (!solapa(a.fechaInicio, a.fechaFin, inicio, fin)) continue
    for (const l of a.lineas) {
      if (l.materialId === materialId) total += l.cantidad
    }
  }
  return total
}

/** Disponible = stock total − comprometido en la ventana (nunca negativo). */
export function disponibleEnVentana(
  alquileres: Alquiler[],
  materialId: string,
  stockTotal: number,
  inicio: string,
  fin: string,
): number {
  return Math.max(0, stockTotal - comprometidoEnVentana(alquileres, materialId, inicio, fin))
}

// ─── Intercompany ──────────────────────────────────────────────────────────────
/** Un alquiler es intercompany si es interno (no a terceros) y va entre dos sociedades distintas del grupo. */
export function esIntercompany(a: Alquiler): boolean {
  return (
    !a.aTerceros &&
    !!a.sociedadOrigenId &&
    !!a.sociedadDestinoId &&
    a.sociedadOrigenId !== a.sociedadDestinoId
  )
}

/** Suma del total de los alquileres internos (lo que se elimina en el consolidado del holding). */
export function totalIntercompany(alquileres: Alquiler[]): number {
  return round2(
    alquileres.filter((a) => a.estado !== 'cancelado' && esIntercompany(a)).reduce((s, a) => s + totalAlquiler(a), 0),
  )
}

/** Proyecta un alquiler interno a la forma OperacionIntercompany (sin acoplar al módulo). null si no aplica. */
export function operacionIntercompanyDe(a: Alquiler): OperacionIntercompanyDeAlquiler | null {
  if (!esIntercompany(a)) return null
  return {
    sociedadOrigenId: a.sociedadOrigenId!,
    sociedadDestinoId: a.sociedadDestinoId!,
    importe: totalAlquiler(a),
    tipo: 'materiales',
    parent: { parentId: a.id, parentType: 'alquiler' },
  }
}

// ─── Resumen ─────────────────────────────────────────────────────────────────
export function resumenAlquileres(alquileres: Alquiler[]): ResumenAlquileres {
  const porEstado: Record<EstadoAlquiler, number> = {
    reservado: 0,
    entregado: 0,
    devuelto: 0,
    cancelado: 0,
  }
  let ingresosTerceros = 0
  let totalInterno = 0
  let fianzasRetenidas = 0
  for (const a of alquileres) {
    porEstado[a.estado] = (porEstado[a.estado] ?? 0) + 1
    if (a.estado !== 'cancelado') {
      if (a.aTerceros) ingresosTerceros += totalAlquiler(a)
      else totalInterno += totalAlquiler(a)
    }
    if (a.estado === 'entregado') fianzasRetenidas += a.fianza ?? 0
  }
  return {
    porEstado,
    activos: porEstado.reservado + porEstado.entregado,
    ingresosTerceros: round2(ingresosTerceros),
    totalInterno: round2(totalInterno),
    fianzasRetenidas: round2(fianzasRetenidas),
  }
}

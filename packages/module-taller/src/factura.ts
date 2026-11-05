// Facturación del taller: factura desde la OT, tipo F1/F2, rectificativas y plan de cobros. PURO (sin BD ni AEAT).
//
// Lo que es VeriFactu (huella, registro, QR, XML) lo pone `@central/core-fiscal` desde la app; aquí solo el dominio:
//   · Solo entran en la factura las líneas de la OT ACEPTADAS por el cliente (`aceptadaEn`); una ampliación sin aceptar, fuera.
//   · Cuota de IVA por TIPO (base del grupo × tipo, redondeo una vez por grupo), no por línea: es la cuota que se declara.
//   · Sin NIF del cliente solo cabe la simplificada (F2) hasta LIMITE_SIMPLIFICADA_CENT IVA incluido; por encima se exigen datos.
//   · Cobros: parciales o divididos; nunca más que el total; efectivo por debajo del límite legal (bloquea, no solo avisa).
//
// Límites legales [Probable: validar con el asesor antes de clientes reales]:
//   · Simplificada: art. 4.1.a RD 1619/2012 (400 € IVA incluido).
//   · Efectivo: art. 7 Ley 7/2012 (prohibido pagar en efectivo ≥ 1.000 € cuando una parte es empresario). El de 10.000 €
//     para particulares no residentes NO se aplica: no sabemos la residencia y lo conservador es el de 1.000 €.
// Son constantes LEGALES (iguales para todo taller), no configuración del taller.
//
// Dinero en CÉNTIMOS ENTEROS; IVA en puntos básicos (pb).

import { PUNTOS_BASICOS_100, type TipoLinea } from './config.ts'
import { dividirRedondeando, formatearEur } from './dinero.ts'

export const LIMITE_SIMPLIFICADA_CENT = 40_000
export const LIMITE_EFECTIVO_CENT = 100_000

export const TIPOS_FACTURA_TALLER = ['F1', 'F2', 'R1', 'R2', 'R3', 'R4', 'R5'] as const
export type TipoFacturaTaller = (typeof TIPOS_FACTURA_TALLER)[number]
export const ESTADOS_FACTURA = ['emitida', 'anulada'] as const
export type EstadoFactura = (typeof ESTADOS_FACTURA)[number]
/** «no se sabe» ≠ «falló» ≠ «no se envió»: `incierto` NO se reenvía a ciegas. */
export const ESTADOS_ENVIO_AEAT = ['no_enviado', 'enviado', 'rechazado', 'incierto'] as const
export type EstadoEnvioAeat = (typeof ESTADOS_ENVIO_AEAT)[number]
/** Causa de la rectificativa de una F1 (R5 es siempre la de una simplificada). */
export type CausaRectificativa = 'R1' | 'R2' | 'R3' | 'R4'

export const esRectificativaTaller = (t: string): boolean => /^R[1-5]$/.test(t)

/** Línea de la OT tal como viene de `ot_lineas`. */
export interface LineaOtFacturable {
  id: string
  tipo: TipoLinea | 'paquete'
  descripcion: string
  cantidad: number
  unidad: 'min' | 'ml' | 'ud'
  baseCent: number
  ivaCodigo: string
  ivaPuntosBasicos: number
  origen: string
  aceptadaEn: Date | null
}

/** Línea CONGELADA de la factura. En una rectificativa por diferencias la base puede ser negativa. */
export interface LineaFactura {
  orden: number
  otLineaId: string | null
  tipo: string
  descripcion: string
  cantidad: number
  unidad: 'min' | 'ml' | 'ud'
  baseCent: number
  ivaCodigo: string
  ivaPuntosBasicos: number
}

export interface GrupoIva { ivaPuntosBasicos: number; baseCent: number; cuotaCent: number }
export interface TotalesFactura { desglose: GrupoIva[]; baseCent: number; cuotaIvaCent: number; totalCent: number }

const entero = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n)

/** Separa las líneas que entran (aceptadas) de las que no (con el motivo). */
export function lineasFacturables(lineas: readonly LineaOtFacturable[]): { incluidas: LineaFactura[]; excluidas: { id: string; motivo: string }[] } {
  const incluidas: LineaFactura[] = []
  const excluidas: { id: string; motivo: string }[] = []
  for (const l of lineas) {
    if (l.aceptadaEn == null) {
      excluidas.push({ id: l.id, motivo: l.origen === 'ampliacion' ? 'ampliación sin aceptar por el cliente' : 'línea sin aceptar por el cliente' })
      continue
    }
    incluidas.push({
      orden: incluidas.length + 1, otLineaId: l.id, tipo: l.tipo, descripcion: l.descripcion, cantidad: l.cantidad, unidad: l.unidad,
      baseCent: l.baseCent, ivaCodigo: l.ivaCodigo, ivaPuntosBasicos: l.ivaPuntosBasicos,
    })
  }
  return { incluidas, excluidas }
}

/** Totales con desglose por tipo de IVA: cuota = base del grupo × pb, redondeada una vez por grupo. */
export function totalesFactura(lineas: readonly LineaFactura[]): TotalesFactura {
  const grupos = new Map<number, number>()
  for (const l of lineas) {
    if (!entero(l.baseCent)) throw new RangeError(`línea ${l.orden}: base no entera`)
    if (!entero(l.ivaPuntosBasicos) || l.ivaPuntosBasicos < 0 || l.ivaPuntosBasicos >= PUNTOS_BASICOS_100) {
      throw new RangeError(`línea ${l.orden}: IVA fuera de rango`)
    }
    grupos.set(l.ivaPuntosBasicos, (grupos.get(l.ivaPuntosBasicos) ?? 0) + l.baseCent)
  }
  const desglose = [...grupos.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([pb, base]) => ({ ivaPuntosBasicos: pb, baseCent: base, cuotaCent: dividirRedondeando(base * pb, PUNTOS_BASICOS_100) }))
  const baseCent = desglose.reduce((s, g) => s + g.baseCent, 0)
  const cuotaIvaCent = desglose.reduce((s, g) => s + g.cuotaCent, 0)
  return { desglose, baseCent, cuotaIvaCent, totalCent: baseCent + cuotaIvaCent }
}

export interface ClienteFactura { nombre: string | null; nif: string | null; domicilio: string | null }
export interface Destinatario { nombre: string; nif: string }

export type DecisionTipo =
  | { ok: true; tipo: 'F1'; destinatario: Destinatario }
  | { ok: true; tipo: 'F2'; destinatario: null }
  | { ok: false; motivo: string }

const limpio = (s: string | null | undefined) => (s ?? '').trim()
export const normalizarNif = (nif: string | null | undefined) => limpio(nif).toUpperCase().replace(/[\s-]/g, '')

/**
 * F1 (completa) si el cliente tiene NIF válido, nombre y domicilio; sin NIF, F2 (simplificada) solo hasta el límite.
 * Un NIF escrito pero inválido NO degrada a F2: se corrige (si no, se perdería el derecho a deducir del cliente).
 */
export function decidirTipoFactura(cliente: ClienteFactura, totalCent: number, nifValido: (nif: string) => boolean): DecisionTipo {
  const nif = normalizarNif(cliente.nif)
  if (nif) {
    if (!nifValido(nif)) return { ok: false, motivo: `el NIF del cliente (${nif}) no es válido: corrígelo antes de facturar` }
    const nombre = limpio(cliente.nombre)
    if (!nombre) return { ok: false, motivo: 'falta el nombre o razón social del cliente para la factura completa' }
    if (!limpio(cliente.domicilio)) return { ok: false, motivo: 'falta el domicilio del cliente para la factura completa' }
    return { ok: true, tipo: 'F1', destinatario: { nombre, nif } }
  }
  if (totalCent <= LIMITE_SIMPLIFICADA_CENT) return { ok: true, tipo: 'F2', destinatario: null }
  return {
    ok: false,
    motivo: `sin NIF del cliente solo se admite factura simplificada hasta ${formatearEur(LIMITE_SIMPLIFICADA_CENT)} IVA incluido ` +
      `(esta es de ${formatearEur(totalCent)}): pide NIF, nombre y domicilio`,
  }
}

export type FacturaConstruida =
  | { ok: true; tipo: 'F1' | 'F2'; destinatario: Destinatario | null; lineas: LineaFactura[]; totales: TotalesFactura; excluidas: { id: string; motivo: string }[] }
  | { ok: false; motivo: string }

/** Factura ordinaria desde las líneas de la OT. */
export function construirFacturaDesdeOt(e: {
  lineas: readonly LineaOtFacturable[]
  cliente: ClienteFactura
  nifValido: (nif: string) => boolean
}): FacturaConstruida {
  const { incluidas, excluidas } = lineasFacturables(e.lineas)
  if (incluidas.length === 0) return { ok: false, motivo: 'la orden no tiene líneas aceptadas que facturar' }
  if (incluidas.some((l) => l.baseCent < 0)) return { ok: false, motivo: 'una factura ordinaria no lleva importes negativos' }
  const totales = totalesFactura(incluidas)
  if (totales.totalCent <= 0) return { ok: false, motivo: 'el total de la factura es 0' }
  const tipo = decidirTipoFactura(e.cliente, totales.totalCent, e.nifValido)
  if (!tipo.ok) return tipo
  return { ok: true, tipo: tipo.tipo, destinatario: tipo.destinatario, lineas: incluidas, totales, excluidas }
}

/** «F2026-000001»: prefijo de la serie + año + número con ceros (crece sin cortar si se pasa). */
export function numeroFactura(prefijo: string, anio: number, numero: number): string {
  if (!entero(anio) || !entero(numero) || numero < 1) throw new RangeError('año o número de factura inválido')
  return `${prefijo.trim()}${anio}-${String(numero).padStart(6, '0')}`
}

export interface FacturaOriginal {
  tipo: string
  estado: string
  lineas: readonly LineaFactura[]
  totales: TotalesFactura
}

export type RectificativaConstruida =
  | {
    ok: true
    tipo: TipoFacturaTaller
    modo: 'S' | 'I'
    lineas: LineaFactura[]
    totales: TotalesFactura
    /** Solo por sustitución (S): base y cuota de la original. */
    importeRectificado: { baseCent: number; cuotaCent: number } | null
  }
  | { ok: false; motivo: string }

/** Líneas de un abono TOTAL (por diferencias): las de la original con la base cambiada de signo. */
export function lineasAbonoTotal(lineas: readonly LineaFactura[]): LineaFactura[] {
  return lineas.map((l, i) => ({ ...l, orden: i + 1, baseCent: -l.baseCent }))
}

/**
 * Rectificativa de una factura emitida.
 *   · 'diferencias' (I): las líneas son la DIFERENCIA (pueden ser negativas); total ≠ 0.
 *   · 'sustitucion' (S): las líneas son la factura correcta completa; se informa la base/cuota de la original.
 * Tipo: R5 si la original es simplificada (F2); si es F1, la causa (R1 por defecto en la app).
 */
export function construirRectificativa(e: {
  original: FacturaOriginal
  modo: 'diferencias' | 'sustitucion'
  lineas: readonly LineaFactura[]
  causa: CausaRectificativa
}): RectificativaConstruida {
  const o = e.original
  if (o.estado !== 'emitida') return { ok: false, motivo: 'solo se rectifica una factura emitida (no anulada)' }
  if (esRectificativaTaller(o.tipo)) return { ok: false, motivo: 'se rectifica la factura original, no otra rectificativa' }
  if (o.tipo !== 'F1' && o.tipo !== 'F2') return { ok: false, motivo: `tipo de factura desconocido: ${o.tipo}` }
  if (!['R1', 'R2', 'R3', 'R4'].includes(e.causa)) return { ok: false, motivo: `causa de rectificación desconocida: ${e.causa}` }
  if (e.lineas.length === 0) return { ok: false, motivo: 'la rectificativa no tiene líneas' }
  const lineas = e.lineas.map((l, i) => ({ ...l, orden: i + 1 }))
  const totales = totalesFactura(lineas)
  const tipo: TipoFacturaTaller = o.tipo === 'F2' ? 'R5' : e.causa
  if (e.modo === 'diferencias') {
    if (totales.totalCent === 0 && totales.baseCent === 0) return { ok: false, motivo: 'la rectificativa por diferencias no cambia nada' }
    if (o.totales.totalCent + totales.totalCent < 0) return { ok: false, motivo: 'la rectificación deja la factura en negativo' }
    return { ok: true, tipo, modo: 'I', lineas, totales, importeRectificado: null }
  }
  if (lineas.some((l) => l.baseCent < 0)) return { ok: false, motivo: 'en una sustitución las líneas son la factura correcta: sin importes negativos' }
  return {
    ok: true, tipo, modo: 'S', lineas, totales,
    importeRectificado: { baseCent: o.totales.baseCent, cuotaCent: o.totales.cuotaIvaCent },
  }
}

export interface CobroExistente { importeCent: number; esEfectivo: boolean }
export interface CobroNuevo { medioCodigo: string; esEfectivo: boolean; importeCent: number }

export type PlanCobros =
  | { ok: true; cobradoCent: number; pendienteCent: number; efectivoCent: number }
  | { ok: false; motivo: string }

/** Cobros de una factura (parcial o dividido). Nunca supera el total; el efectivo, por debajo del límite legal. */
export function planCobros(e: { totalCent: number; yaCobrados: readonly CobroExistente[]; nuevos: readonly CobroNuevo[] }): PlanCobros {
  if (!entero(e.totalCent) || e.totalCent <= 0) return { ok: false, motivo: 'esta factura no tiene importe a cobrar' }
  if (e.nuevos.length === 0) return { ok: false, motivo: 'no hay cobros que registrar' }
  for (const c of e.nuevos) {
    if (!entero(c.importeCent) || c.importeCent <= 0) return { ok: false, motivo: 'cada cobro debe ser un importe positivo' }
    if (!limpio(c.medioCodigo)) return { ok: false, motivo: 'falta el medio de cobro' }
  }
  const todos = [...e.yaCobrados, ...e.nuevos]
  const cobradoCent = todos.reduce((s, c) => s + c.importeCent, 0)
  if (cobradoCent > e.totalCent) {
    return { ok: false, motivo: `los cobros (${formatearEur(cobradoCent)}) superan el total de la factura (${formatearEur(e.totalCent)})` }
  }
  const efectivoCent = todos.filter((c) => c.esEfectivo).reduce((s, c) => s + c.importeCent, 0)
  if (efectivoCent >= LIMITE_EFECTIVO_CENT) {
    return {
      ok: false,
      motivo: `no se puede cobrar en efectivo ${formatearEur(efectivoCent)}: el límite legal es por debajo de ${formatearEur(LIMITE_EFECTIVO_CENT)} ` +
        '(Ley 7/2012). Cobra el resto con tarjeta, Bizum o transferencia',
    }
  }
  return { ok: true, cobradoCent, pendienteCent: e.totalCent - cobradoCent, efectivoCent }
}

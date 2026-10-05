// ¿Una factura de proveedor EXIGE que Alberto la pague a mano? Caso fundacional (05/10/2026): el
// resumen del lunes avisó «32 facturas pendientes · 2.930,90€» con botones «Pagar todo», cuando
// casi todas se cobran SOLAS (domiciliación, tarjeta de PriceLabs/IONOS, comisión de Booking
// descontada del payout). `facturas_proveedor` no guarda la forma de pago, así que se deduce de lo
// que hay: la domiciliación explícita de la lectura, el nombre de una plataforma que descuenta, y el
// histórico de cargos del proveedor en el banco.
//
// Módulo PURO (solo importa `dinero.ts`, también puro) para testearlo con `node --test`.
//
// 🚨 null ≠ transferencia. Solo la transferencia es acción manual, y solo con una señal positiva
// (el histórico del proveedor son transferencias nuestras). Sin ninguna señal → `desconocida`, que se
// cuenta aparte y NUNCA como «pendiente de pagar» ni con botón de pagar.

import { eur } from '../dinero.ts'
import { cuentasParadas, type CuentaCobertura } from './domiciliados.ts'

export type FormaPago =
  /** Exige acción manual: la pagamos por transferencia. */
  | 'transferencia'
  /** Se carga sola en cuenta (recibo domiciliado o tarjeta). */
  | 'cargo_automatico'
  /** La plataforma lo descuenta de lo que nos paga (Booking, Airbnb…). No sale del banco como cargo. */
  | 'plataforma'
  /** No hay dato suficiente. */
  | 'desconocida'

export interface EntradaForma {
  proveedor: string | null
  /** `raw_extraction.domiciliado` leído de la factura: true/false, o null = no se sabe. */
  domiciliadoExplicito: boolean | null
  /** Cargos anteriores del proveedor en el banco que NO fueron transferencia (recibo, adeudo, tarjeta). */
  cargosAutomaticosPrevios: number
  /** Cargos anteriores del proveedor en el banco que SÍ fueron transferencia nuestra. */
  transferenciasPrevias: number
}

/** Plataformas que descuentan su comisión/factura del payout: no hay nada que pagar por banco. */
const RE_PLATAFORMA = /\b(booking(\.com)?|airbnb|expedia|vrbo|homeaway)\b/i

export function esPlataformaQueDescuenta(proveedor: string | null | undefined): boolean {
  return !!proveedor && RE_PLATAFORMA.test(proveedor)
}

/**
 * Un cargo de banco es TRANSFERENCIA si su concepto empieza así (todas las variantes que escribe el banco).
 * Única fuente: la usa el SQL de `formasPago` (como cadena) y los tests.
 */
export const RE_CONCEPTO_TRANSFERENCIA_SQL = '^(ORDEN DE TRANSFERENCIA|TRANSFERENCIA|TRANSFER|TRANSF|TRF|TRANS|TRASPASO|BIZUM)'
export const RE_CONCEPTO_TRANSFERENCIA = new RegExp(RE_CONCEPTO_TRANSFERENCIA_SQL, 'i')

/** Palabras genéricas que no identifican a un proveedor: casarían con cargos de otros. Única fuente (conciliación y forma de pago). */
export const CLAVES_GENERICAS = ['FUNDACION', 'ASOCIACION', 'COMUNIDAD', 'AYUNTAMIENTO', 'SERVICIOS', 'GRUPO']

/** Nombres propios del titular: una factura a nombre «ALBERTO SUAREZ» casaría con todos los cargos propios. */
export const CLAVES_TITULAR_BASE = ['ALBERTO', 'SUAREZ', 'GUTIERREZ', 'PILAR']

/** Primera palabra significativa (sin tildes, solo letras) en mayúsculas. */
export function claveProveedor(proveedor: string): string {
  return proveedor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z ]/g, '').trim().split(/\s+/)[0]?.toUpperCase() ?? ''
}

/** Palabras (≥4 letras) de los nombres de titulares, para excluirlas como clave. */
export function clavesDeTitulares(nombres: (string | null | undefined)[]): string[] {
  const out = new Set(CLAVES_TITULAR_BASE)
  for (const n of nombres) for (const w of (n ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().split(/[^A-Z]+/)) if (w.length >= 4) out.add(w)
  return [...out]
}

/** ¿La clave sirve para buscar cargos del proveedor? ≥4 letras, no genérica y no un nombre del titular. */
export function claveUtil(clave: string, extraExcluidas: string[] = []): boolean {
  return clave.length >= 4 && !CLAVES_GENERICAS.includes(clave) && !extraExcluidas.includes(clave)
}

export function clasificarFormaPago(e: EntradaForma): FormaPago {
  if (esPlataformaQueDescuenta(e.proveedor)) return 'plataforma'
  if (e.domiciliadoExplicito === true) return 'cargo_automatico'
  // Historial MIXTO (transferencias y cargos que no lo son): no se sabe cuál manda → desconocida.
  if (e.cargosAutomaticosPrevios > 0 && e.transferenciasPrevias > 0) return 'desconocida'
  if (e.cargosAutomaticosPrevios > 0) return 'cargo_automatico'
  // `domiciliado=false` por sí solo NO prueba transferencia (Fly.io 6,68€ es tarjeta): hace falta
  // haberla pagado así en el banco.
  if (e.transferenciasPrevias > 0) return 'transferencia'
  return 'desconocida'
}

/** Días tras el vencimiento antes de reclamar un cargo que no aparece (finde + fecha valor). */
export const MARGEN_CARGO_DIAS = 5

export interface FacturaResumen {
  id: string
  proveedor: string
  importe: number
  fecha_vencimiento: string | null
  forma: FormaPago
}

export interface PlanAviso {
  /** Acción manual: transferencia pendiente. */
  manuales: FacturaResumen[]
  /** Se cargarán solas y aún no toca reclamar. */
  automaticas: FacturaResumen[]
  /** Se cargarán solas, vencieron + margen y el cargo no ha aparecido: accionable. */
  sinCargo: FacturaResumen[]
  /** No se sabe cómo se pagan. */
  desconocidas: FacturaResumen[]
}

function sumaDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + dias)).toISOString().slice(0, 10)
}

/**
 * Reparte las facturas aún sin cargo casado. `hayCobertura` = el extracto llega hasta la fecha
 * de cargo: si no, la ausencia del apunte no prueba nada y NO se reclama.
 */
export function planificarAviso(
  facturas: FacturaResumen[],
  hoy: string,
  hayCobertura: (fechaCargo: string) => boolean = () => true,
  margen: number = MARGEN_CARGO_DIAS,
): PlanAviso {
  const plan: PlanAviso = { manuales: [], automaticas: [], sinCargo: [], desconocidas: [] }
  for (const f of facturas) {
    if (f.forma === 'transferencia') plan.manuales.push(f)
    else if (f.forma === 'desconocida') plan.desconocidas.push(f)
    else {
      const vencida = !!f.fecha_vencimiento && hoy > sumaDias(f.fecha_vencimiento, margen)
      // La plataforma descuenta del payout: nunca aparece como cargo, no se reclama.
      if (f.forma === 'cargo_automatico' && vencida && hayCobertura(f.fecha_vencimiento!)) plan.sinCargo.push(f)
      else plan.automaticas.push(f)
    }
  }
  return plan
}

const suma = (l: FacturaResumen[]) => l.reduce((s, f) => s + f.importe, 0)

/** ¿Hay algo que decir? Sin manuales, cargos que faltan ni desconocidas, no se avisa. */
export function hayAviso(p: PlanAviso): boolean {
  return p.manuales.length > 0 || p.sinCargo.length > 0 || p.desconocidas.length > 0
}

const MAX_LINEAS = 5

function lineas(l: FacturaResumen[]): string[] {
  const out = l.slice(0, MAX_LINEAS).map((f) => {
    const vence = f.fecha_vencimiento ? ` · vence ${f.fecha_vencimiento}` : ''
    return `  • ${f.proveedor} · ${eur(f.importe)}${vence}`
  })
  if (l.length > MAX_LINEAS) out.push(`  <i>... y ${l.length - MAX_LINEAS} más</i>`)
  return out
}

/** Texto HTML del aviso (el proveedor viene ya escapado por quien llama si hace falta). */
export function componerTexto(p: PlanAviso): string {
  const partes: string[] = []
  if (p.manuales.length > 0) {
    partes.push(`📋 <b>${p.manuales.length} factura(s) por pagar por transferencia:</b>\n${lineas(p.manuales).join('\n')}\n<b>Total: ${eur(suma(p.manuales))}</b>`)
  }
  if (p.sinCargo.length > 0) {
    partes.push(`⚠️ <b>${p.sinCargo.length} cargo(s) que no han aparecido en el banco:</b>\n${lineas(p.sinCargo).join('\n')}`)
  }
  if (p.automaticas.length > 0) {
    partes.push(`🏦 ${p.automaticas.length} se cargarán solas por banco/tarjeta (${eur(suma(p.automaticas))})`)
  }
  if (p.desconocidas.length > 0) {
    partes.push(`❔ <b>${p.desconocidas.length} sin forma de pago conocida (${eur(suma(p.desconocidas))}) — decide cómo se paga:</b>\n${lineas(p.desconocidas).join('\n')}`)
  }
  return partes.join('\n\n')
}

/**
 * ¿El extracto cubre la fecha de cargo en TODAS las cuentas (incluidas las ocultas, p. ej. tarjetas paradas)?
 * Basta una cuenta parada para no poder afirmar «sin cargo»: el cargo pudo caer en ella.
 */
export function hayCoberturaTotal(cuentas: CuentaCobertura[] | null, fechaCargo: string): boolean {
  return !!cuentas && cuentas.length > 0 && cuentasParadas(cuentas, fechaCargo).length === 0
}

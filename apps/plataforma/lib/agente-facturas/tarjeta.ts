// Facturas de proveedor que se cobran con TARJETA (Fly.io, Vercel…): no se pagan a mano, quedan
// «pendientes de revisión hasta que aparezca el cargo» y casan solas al subir el extracto de la tarjeta.
// Módulo PURO (solo importa módulos puros) para testearlo con `node --test`.
//
// 🚨 Tres estados, nunca asumir: true = tarjeta · false = otra forma (transferencia/recibo) · null = no se sabe.
// Y un feed parado NO es un cargo ausente: el aviso dice «puede que falte subir el extracto».

import { eur } from '../dinero.ts'
import { sumaDias } from './domiciliados.ts'

/** Proveedores conocidos que cobran con tarjeta. Señal positiva débil: el historial de transferencias la anula. */
export const RE_PROVEEDOR_TARJETA = /\b(fly(\.io)?|vercel|pricelabs|ionos|openrouter|github|cloudflare|supabase)\b/i
/** Proveedores conocidos que facturan en USD aunque la factura no guarde la divisa. */
export const RE_PROVEEDOR_USD = /\b(fly(\.io)?|vercel|openrouter|pricelabs|github|openai|cursor|supabase|cloudflare)\b/i

/** Días tras la fecha de factura antes de avisar de que el cargo no ha llegado. */
export const DIAS_AVISO_TARJETA = 10

/**
 * La tarjeta (Kutxabank, débito) carga en la cuenta CORRIENTE: «cargo en corriente» NO implica transferencia.
 * Conceptos reales: «Fly.io · Pago con tarjeta», «COMPRA EN COMERCIO EXTRANJERO… // PAGO CON TARJETA // VERCEL INC.»,
 * «TARJ.CRDTO 4662…». Las otras formas dicen «TRANSF.» o «RECIBO …». Sin `\b` ni lookaround: la misma fuente
 * se pasa a Postgres (`~*`) en `tarjeta-cargos.ts`.
 */
export const RE_CONCEPTO_TARJETA = /pago con tarjeta|compra en comercio|compra tarj|tarj\.? ?cr/i
export const RE_CONCEPTO_OTRO = /transf|recibo|domicili|adeudo|sepa/i

/** 'tarjeta' = cuenta tipo tarjeta o concepto de tarjeta · 'otro' = transferencia/recibo identificable · null = ambiguo (no cuenta). */
export function clasificarCargo(tipoCuenta: string | null, concepto: string | null): 'tarjeta' | 'otro' | null {
  if (tipoCuenta === 'tarjeta') return 'tarjeta'
  const c = concepto ?? ''
  if (RE_CONCEPTO_TARJETA.test(c)) return 'tarjeta'
  if (RE_CONCEPTO_OTRO.test(c)) return 'otro'
  return null
}

export interface EntradaTarjeta {
  proveedor: string | null
  /** Lo que dice la propia factura (`raw_extraction.forma_pago`/`metodo_pago`): true/false/null = no dice. */
  tarjetaExplicita: boolean | null
  /** Cargos previos del proveedor de tarjeta: cuenta tipo tarjeta O concepto de tarjeta en la corriente (`clasificarCargo`). */
  cargosTarjetaPrevios: number
  /** Cargos previos del proveedor que son transferencia/recibo identificable (`clasificarCargo` = 'otro'). */
  cargosOtrosPrevios: number
}

/** Lee la forma de pago escrita en la factura. Texto no reconocido = null (no se sabe). */
export function tarjetaDeRaw(raw: unknown): boolean | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const txt = [r.forma_pago, r.metodo_pago, r.payment_method]
    .filter((x): x is string => typeof x === 'string').join(' ').toLowerCase()
  if (!txt.trim()) return null
  if (/tarjeta|card|visa|mastercard|amex/.test(txt)) return true
  if (/transfer|domicili|sepa|recibo|giro|efectivo|cash/.test(txt)) return false
  return null
}

export function clasificarTarjeta(e: EntradaTarjeta): boolean | null {
  if (e.tarjetaExplicita !== null) return e.tarjetaExplicita
  const t = e.cargosTarjetaPrevios, o = e.cargosOtrosPrevios
  if (t > 0 && o > 0) return null                 // historial mixto: no se sabe cuál manda
  if (t > 0) return true
  if (o > 0) return false                          // se ha pagado antes por otra vía
  if (e.proveedor && RE_PROVEEDOR_TARJETA.test(e.proveedor)) return true
  return null
}

/** Divisa efectiva: la guardada, o USD si el proveedor es de los que facturan en USD; null = se tratará como EUR. */
export function divisaEfectiva(proveedor: string | null, divisa: string | null | undefined): string | null {
  const d = (divisa ?? '').trim().toUpperCase()
  if (d) return d
  return proveedor && RE_PROVEEDOR_USD.test(proveedor) ? 'USD' : null
}

export interface FacturaTarjeta {
  id: string
  proveedor: string
  importe: number
  divisa: string | null
  /** YYYY-MM-DD */
  fecha_factura: string
}

export interface PlanAvisoTarjeta {
  /** Pasaron ≥ DIAS_AVISO_TARJETA días y no hay cargo casado. */
  sinCargo: FacturaTarjeta[]
  /** Aún dentro del plazo. */
  enPlazo: FacturaTarjeta[]
}

export function planificarAvisoTarjeta(facturas: FacturaTarjeta[], hoy: string, dias = DIAS_AVISO_TARJETA): PlanAvisoTarjeta {
  const plan: PlanAvisoTarjeta = { sinCargo: [], enPlazo: [] }
  for (const f of facturas) (hoy >= sumaDias(f.fecha_factura, dias) ? plan.sinCargo : plan.enPlazo).push(f)
  return plan
}

const MAX_LINEAS = 8

/** Texto HTML del aviso (el proveedor lo escapa quien llama). Vacío si no hay nada que decir. */
export function textoAvisoTarjeta(p: PlanAvisoTarjeta, escapar: (s: string) => string = (s) => s, cuenta?: string | null): string {
  if (p.sinCargo.length === 0) return ''
  const deCuenta = cuenta ? ` (cuenta ${escapar(cuenta)})` : ''
  const lineas = p.sinCargo.slice(0, MAX_LINEAS).map((f) => {
    const imp = f.divisa && f.divisa.toUpperCase() !== 'EUR' ? `${f.importe.toFixed(2).replace('.', ',')} ${f.divisa.toUpperCase()}` : eur(f.importe)
    return `• ${escapar(f.proveedor)} · ${imp} · factura del ${f.fecha_factura}`
  })
  if (p.sinCargo.length > MAX_LINEAS) lineas.push(`<i>... y ${p.sinCargo.length - MAX_LINEAS} más</i>`)
  return `💳 <b>${p.sinCargo.length}</b> factura(s) de tarjeta${deCuenta} sin cargo casado tras ${DIAS_AVISO_TARJETA} días:\n${lineas.join('\n')}\n`
    + `Puede que simplemente falte subir el extracto de la tarjeta (los feeds automáticos están parados): no es un impago confirmado.`
}

/**
 * El aviso de «sin cargo» no guarda estado (sin migración): para no repetirlo cada día con el mismo
 * conjunto de facturas, solo sale los LUNES (`hoy` = YYYY-MM-DD).
 */
export function tocaAvisoTarjetaSemanal(hoy: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(hoy)
  if (!m) return false
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() === 1
}

// ── Cableado en el flujo de pago (puro; lo usa pagos.ts) ──

export const NOTA_TARJETA = '💳 se cobra con tarjeta · pendiente del cargo\n'

/** Nota del aviso 🧾: solo con tarjeta === true (null = no se sabe → nada) y si no hay ya otra nota «se cobra sola». */
export function notaTarjeta(tarjeta: boolean | null | undefined, yaSeCobraSola = false): string {
  return tarjeta === true && !yaSeCobraSola ? NOTA_TARJETA : ''
}

/** ¿Se puede ofrecer/hacer el pago a mano? Solo `true` lo impide; null/undefined (no se sabe, error de lectura) = como hasta ahora. */
export function pagableAMano(tarjeta: boolean | null | undefined): boolean {
  return tarjeta !== true
}

/** Para `pagarTodo`: quita las facturas de tarjeta confirmada. */
export function sinFacturasTarjeta<T extends { proveedor: string }>(facturas: T[], formas: Map<string, boolean | null>): T[] {
  return facturas.filter((f) => pagableAMano(formas.get(f.proveedor)))
}

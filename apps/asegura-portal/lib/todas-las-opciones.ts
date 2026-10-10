// «Todas las opciones» del presupuesto (29/09/2026): la lista entera de precios congelados, con los
// interruptores de garantías, paginada. PURO (sin BD ni React) para que el cepo lo pruebe sin levantar
// nada; el componente es `app/(portal)/boveda/presupuesto/[id]/TodasLasOpciones.tsx`.
//
// 🚨 Las reglas que no se negocian, todas heredadas de la casa:
//   · `garantias` NULL o con forma rara = «no clasificada» → cuenta como `no_consta`, nunca como `no`.
//   · Franquicia `null` = «no declara franquicia», jamás «sin franquicia».
//   · «Qué cambia frente a tu seguro actual» solo se dice con la actual LEÍDA; sin ella, nada.
//   · Capital de decesos `null` = no se dice nada (nunca «0,00€»).

import {
  CATALOGO_GARANTIAS,
  cambiosFrenteActual,
  diferenciasDeOpcion,
  capitalServicio,
  clasificarCoberturas,
  garantiasDeNecesidades,
  preseleccionFija,
  type EstadoGarantia,
  type GarantiasClasificadas,
  type InterruptorGarantia,
  type RamoGarantias,
} from '@central/module-seguros'

import { eur } from './dinero.ts'

export const POR_PAGINA = 10
/** Espera tras el último cambio antes de mandar la telemetría (ms). */
export const ESPERA_ACTIVIDAD_MS = 3_000
export const MAX_COMPARAR = 2

// ─── La columna `presupuesto_opcion.garantias` ───────────────────────────────

const ESTADOS: readonly EstadoGarantia[] = ['si', 'no', 'no_consta']

/**
 * Lee el jsonb `{version, porClave: {clave: 'si'|'no'|'no_consta'}}` sin fiarse de su forma.
 * Cualquier cosa que no sea exactamente eso → `null` («no clasificada»), que el filtro trata como
 * `no_consta`. Un valor desconocido en UNA clave invalida el objeto entero: medio clasificar con una
 * clave basura dentro es un «no lo sé» disfrazado de dato.
 */
export function garantiasDeJson(v: unknown): GarantiasClasificadas | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  if (typeof o.version !== 'number' || !Number.isFinite(o.version)) return null
  const pc = o.porClave
  if (!pc || typeof pc !== 'object' || Array.isArray(pc)) return null
  const porClave: Record<string, EstadoGarantia> = {}
  for (const [k, e] of Object.entries(pc as Record<string, unknown>)) {
    if (typeof e !== 'string' || !(ESTADOS as readonly string[]).includes(e)) return null
    porClave[k] = e as EstadoGarantia
  }
  return { version: o.version, porClave }
}

/**
 * Las coberturas de la póliza actual, llevadas al catálogo. Lo que figura en la póliza es lo que
 * TIENE (`incluida: true`). `null` o `[]` = no hay desglose leído → `null`: sin él no se compara.
 */
export function garantiasDeActual(ramo: RamoGarantias, coberturas: readonly string[] | null | undefined): GarantiasClasificadas | null {
  if (!coberturas || coberturas.length === 0) return null
  return clasificarCoberturas(ramo, coberturas.map((nombre) => ({ nombre, incluida: true })))
}

// ─── Interruptores preseleccionados ──────────────────────────────────────────

/**
 * Lo que el cliente pidió, cruzado con los interruptores que existen (los que alguna opción incluye).
 * Marcar una garantía sin interruptor dejaría un filtro que el cliente no ve ni puede quitar.
 * Sale en el orden de los interruptores, que es el del catálogo.
 */
export function preseleccion(ramo: RamoGarantias | null, necesidades: string | null | undefined, interruptores: readonly InterruptorGarantia[]): string[] {
  if (ramo === null) return []
  // Lo que pidió + lo que sale marcado siempre en su ramo (la grúa en coche y moto).
  const pedidas = new Set([...garantiasDeNecesidades(ramo, necesidades), ...preseleccionFija(ramo, interruptores)])
  return interruptores.map((i) => i.clave).filter((c) => pedidas.has(c))
}

/** Marca o desmarca una garantía, conservando el orden de los interruptores. */
export function alternarGarantia(marcadas: readonly string[], clave: string, interruptores: readonly InterruptorGarantia[]): string[] {
  const set = new Set(marcadas)
  if (set.has(clave)) set.delete(clave)
  else set.add(clave)
  return interruptores.map((i) => i.clave).filter((c) => set.has(c))
}

// ─── Paginación ──────────────────────────────────────────────────────────────

// ─── Antes de aceptar: lo que PIERDE frente a su seguro actual (29/09/2026) ──

export type AvisoPerdidas = { pierdes: string[]; sinDato: string[] }

/**
 * Lo que el cliente dejaría de tener si acepta ESTA opción, frente a la póliza que tiene hoy.
 * `null` = no hay nada que avisar (o no se puede comparar: sin ramo con catálogo, sin desglose de su
 * póliza o sin garantías leídas de la opción). «Sin dato» es lo que su póliza tiene y esta opción no
 * dice: no se afirma que lo pierde, se le pide que lo pregunte.
 */
export function avisoPerdidas(
  ramo: RamoGarantias | null,
  opcion: GarantiasClasificadas | null,
  actual: GarantiasClasificadas | null,
): AvisoPerdidas | null {
  if (ramo === null) return null
  const c = cambiosFrenteActual(ramo, opcion, actual)
  if (c === null || (c.pierdes.length === 0 && c.sinDato.length === 0)) return null
  return { pierdes: c.pierdes, sinDato: c.sinDato }
}

export type Pagina<T> = { mostradas: T[]; quedan: number; siguiente: number }

/** Las `cuantas` primeras, cuántas quedan y cuántas se enseñan tras «Ver 10 más». */
export function paginar<T>(lista: readonly T[], cuantas: number): Pagina<T> {
  const n = Math.max(0, Math.min(Math.floor(cuantas), lista.length))
  const quedan = lista.length - n
  return { mostradas: lista.slice(0, n), quedan, siguiente: Math.min(lista.length, n + POR_PAGINA) }
}

/** Texto del botón: «Ver 10 más» o, si quedan menos, «Ver 3 más». `null` = no queda nada. */
export function textoVerMas(quedan: number): string | null {
  return quedan > 0 ? `Ver ${Math.min(quedan, POR_PAGINA)} más` : null
}

// ─── Comparar ────────────────────────────────────────────────────────────────

/** Marca/desmarca una opción para comparar. Con dos elegidas, una tercera no entra. */
export function alternarComparar(sel: readonly string[], id: string): string[] {
  if (sel.includes(id)) return sel.filter((x) => x !== id)
  if (sel.length >= MAX_COMPARAR) return [...sel]
  return [...sel, id]
}

/** La casilla de una opción NO elegida se deshabilita cuando ya hay dos. */
export function compararDeshabilitado(sel: readonly string[], id: string): boolean {
  return !sel.includes(id) && sel.length >= MAX_COMPARAR
}

// ─── La fila ─────────────────────────────────────────────────────────────────

export type OpcionParaFila = {
  id: string
  compania: string
  producto: string
  modalidad: string | null
  primaEur: number | null
  franquiciaEur: number | null
  firmeza: 'firme' | 'condicionado' | 'estimado'
  avisos: readonly string[]
  garantias: GarantiasClasificadas | null
  esPortada: boolean
}

export type FilaOpcion = {
  id: string
  compania: string
  producto: string
  recomendada: boolean
  prima: string
  sinPrecio: boolean
  franquicia: string
  /** «precio estimado» cuando la compañía no lo ha confirmado. `null` = firme. */
  firmeza: string | null
  /** «Frente a tu seguro actual: + X · − Y». `null` = no se puede decir (sin actual leída). */
  cambios: string | null
  /** «Sin dato: Z» — lo que tienes hoy y de esta opción no consta. `null` = nada que decir. */
  cambiosSinDato: string | null
  /** Solo decesos: «Capital del servicio: 3.600,00€». `null` = no viene o no aplica. */
  capital: string | null
  /** «No incluye: X» — donde las opciones no dicen lo mismo y ESTA dice que no. `null` = nada. */
  noIncluye: string | null
  /** «Sin confirmar por la compañía: X» — donde otras sí lo dicen y esta no. `null` = nada. */
  sinConfirmar: string | null
}

export function filaDeOpcion(
  o: OpcionParaFila,
  ctx: { ramo: RamoGarantias | null; actual: GarantiasClasificadas | null; todas?: readonly OpcionParaFila[] },
): FilaOpcion {
  const producto = o.modalidad !== null && o.modalidad.trim() !== '' ? `${o.producto} · ${o.modalidad.trim()}` : o.producto
  let cambios: string | null = null
  let cambiosSinDato: string | null = null
  let noIncluye: string | null = null
  let sinConfirmar: string | null = null
  if (ctx.ramo !== null) {
    const c = cambiosFrenteActual(ctx.ramo, o.garantias, ctx.actual)
    // Lo que ya dice «frente a tu seguro actual» no se repite.
    const d = diferenciasDeOpcion(ctx.ramo, o, ctx.todas ?? [])
    if (d !== null) {
      const no = d.noIncluye.filter((x) => !c?.pierdes.includes(x))
      const sc = d.sinConfirmar.filter((x) => !c?.sinDato.includes(x))
      if (no.length > 0) noIncluye = `No incluye: ${listaY(no)}`
      if (sc.length > 0) sinConfirmar = `Sin confirmar por la compañía: ${listaY(sc)}`
    }
    if (c !== null) {
      const partes: string[] = []
      if (c.ganas.length > 0) partes.push(`+ ${c.ganas.join(', ')}`)
      if (c.pierdes.length > 0) partes.push(`− ${c.pierdes.join(', ')}`)
      cambios = partes.length > 0
        ? `Frente a tu seguro actual: ${partes.join(' · ')}`
        : c.sinDato.length > 0 ? null : 'Frente a tu seguro actual: las mismas garantías de las que consta'
      if (c.sinDato.length > 0) cambiosSinDato = `Sin dato: ${c.sinDato.join(', ')}`
    }
  }
  let capital: string | null = null
  if (ctx.ramo === 'decesos') {
    const n = capitalServicio(o.avisos)
    if (n !== null) capital = `Capital del servicio: ${eur(n)}`
  }
  return {
    id: o.id,
    compania: o.compania,
    producto,
    recomendada: o.esPortada,
    prima: o.primaEur === null ? 'sin precio' : `${eur(o.primaEur)} al año`,
    sinPrecio: o.primaEur === null,
    franquicia: o.franquiciaEur === null ? 'no declara franquicia' : `Franquicia: ${eur(o.franquiciaEur)}`,
    firmeza: o.firmeza === 'firme' ? null : 'precio estimado',
    cambios,
    cambiosSinDato,
    capital,
    noIncluye,
    sinConfirmar,
  }
}

// ─── Los textos del filtro ───────────────────────────────────────────────────

/** «Lunas», «Lunas y Robo», «Lunas, Robo y Grúa». */
export function listaY(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`
}

export function etiquetasDe(ramo: RamoGarantias | null, claves: readonly string[]): string[] {
  if (ramo === null) return []
  const porClave = new Map(CATALOGO_GARANTIAS[ramo].map((g) => [g.clave, g.etiqueta]))
  return claves.map((c) => porClave.get(c) ?? c)
}

/** «3 opciones no dicen si incluyen Lunas» / «1 opción no dice si incluye Lunas y Robo». */
export function textoSinDato(n: number, etiquetas: readonly string[]): string {
  const g = listaY(etiquetas)
  return n === 1 ? `1 opción no dice si incluye ${g}` : `${n} opciones no dicen si incluyen ${g}`
}

/** «2 no la incluyen» (una garantía) / «2 no incluyen alguna de ellas» (varias). `null` si 0. */
export function textoDescartadas(n: number, cuantasGarantias: number): string | null {
  if (n <= 0) return null
  if (cuantasGarantias <= 1) return n === 1 ? '1 no la incluye.' : `${n} no la incluyen.`
  return n === 1 ? '1 no incluye alguna de ellas.' : `${n} no incluyen alguna de ellas.`
}

// ─── Telemetría: lo que se manda al puente ───────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CLAVE = /^[a-z0-9_]{1,40}$/
const MAX_GARANTIAS = 40

export type Actividad = { presupuestoId: string; garantias: string[]; comparadas: string[] }

/**
 * Valida el cuerpo de `POST /api/presupuesto/actividad`. `null` = no se reenvía nada. Las claves
 * de garantía son identificadores del catálogo (`[a-z0-9_]`), nunca texto libre; las comparadas,
 * uuids y como mucho dos.
 */
export function leerActividad(b: unknown): Actividad | null {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null
  const o = b as Record<string, unknown>
  if (typeof o.presupuestoId !== 'string' || !UUID.test(o.presupuestoId)) return null
  if (!Array.isArray(o.garantias) || o.garantias.length > MAX_GARANTIAS) return null
  if (!o.garantias.every((g) => typeof g === 'string' && CLAVE.test(g))) return null
  if (!Array.isArray(o.comparadas) || o.comparadas.length > MAX_COMPARAR) return null
  if (!o.comparadas.every((c) => typeof c === 'string' && UUID.test(c))) return null
  return {
    presupuestoId: o.presupuestoId,
    garantias: [...new Set(o.garantias as string[])],
    comparadas: [...new Set(o.comparadas as string[])],
  }
}

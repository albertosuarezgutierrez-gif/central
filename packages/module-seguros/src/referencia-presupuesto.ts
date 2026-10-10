/**
 * La REFERENCIA propia de un presupuesto (30/09/2026, dictado de Alberto): `AS-AA-NNNN`.
 *
 * Es lo que se le da al cliente y a la gente de la correduría para rescatar EXACTAMENTE la
 * propuesta enviada desde el buscador principal de `/correduria`. El nº de proyecto de
 * Avant2/Codeoscopic NO se enseña nunca al cliente: es del vendor, cambia si se re-tarifica y
 * no dice nada a quien lo lee.
 *
 * La numeración la da la BD (contador por correduría + año, sin carreras:
 * `apps/asegura/prisma/sql/2026-09-30b_presupuesto_referencia.sql`). Aquí solo vive lo PURO:
 * reconocer lo que teclea una persona, el estado que se enseña junto a la referencia y la
 * igualdad del conjunto de opciones que van en el documento (lo que decide si un presupuesto
 * se REUTILIZA en vez de crear otro idéntico).
 *
 * Sin `index.ts` a propósito (subruta `@central/module-seguros/referencia-presupuesto`): así la
 * consumen plataforma y asegura sin tocar el barril del paquete.
 */

import { estadoPresupuesto, type SellosPresupuesto } from './presupuesto-cliente.ts'

export const PREFIJO_REFERENCIA = 'AS'

/** El formato CANÓNICO que guarda la BD (el CHECK de la migración dice lo mismo). */
export const PATRON_REFERENCIA = /^AS-\d{2}-\d{4,}$/

/** `AS-26-0042`. `anio` puede ser 2026 o 26; `n` empieza en 1. `null` si algo no cuadra. */
export function formatearReferencia(anio: number, n: number): string | null {
  if (!Number.isInteger(anio) || !Number.isInteger(n) || anio < 0 || n < 1) return null
  const aa = String(anio % 100).padStart(2, '0')
  return `${PREFIJO_REFERENCIA}-${aa}-${String(n).padStart(4, '0')}`
}

// Separadores que una persona teclea o que mete un dictado: espacio, guion (también los
// tipográficos que pega un móvil), punto, barra, guion bajo.
const SEP = '[\\s._/\\-\\u2010-\\u2015]'
const CON_SEPARADORES = new RegExp(`^AS${SEP}*(\\d{2})${SEP}+(\\d{1,6})$`)
const COMPACTA = /^AS(\d{2})(\d{4,6})$/

/**
 * Lo que alguien escribe en el buscador → la referencia canónica, o `null` si NO es una
 * referencia. Tolerante a minúsculas, espacios y guiones: «as 26 42», «AS-26-0042»,
 * «as260042», «AS–26–42» (guion largo de móvil). Sin separador entre año y número exige
 * al menos cuatro cifras de número: «AS2642» es ambiguo y no se adivina.
 */
export function normalizarReferencia(q: unknown): string | null {
  if (typeof q !== 'string') return null
  const t = q.trim().toUpperCase()
  if (t.length < 5 || t.length > 20) return null
  const m = CON_SEPARADORES.exec(t) ?? COMPACTA.exec(t)
  if (!m) return null
  const n = Number(m[2])
  if (!Number.isInteger(n) || n < 1) return null
  return formatearReferencia(Number(m[1]), n)
}

export function esReferenciaPresupuesto(q: unknown): boolean {
  return normalizarReferencia(q) !== null
}

// ─── Estado que se enseña junto a la referencia ────────────────────────────────

export type SellosReferencia = SellosPresupuesto & {
  /**
   * Se descargó el PDF para el cliente. 🚨 NO prueba que se le mandara (eso pasa fuera del
   * sistema), por eso no es `enviadoAt`. NULL = no consta que se descargara.
   */
  documentoDescargadoAt?: string | Date | null
}

export type EstadoReferencia =
  | 'retirado'
  | 'emitido'
  | 'caducado'
  | 'aceptado'
  | 'elegido'
  | 'visto'
  | 'enviado'
  | 'enlazado'
  /** PDF descargado; no consta que saliera. */
  | 'descargado'
  /** Preparado y sin rastro de salida. */
  | 'preparado'

function instante(v: string | Date | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const t = v instanceof Date ? v.getTime() : Date.parse(v)
  return Number.isFinite(t) ? t : null
}

/**
 * El estado de un presupuesto BUSCADO POR SU REFERENCIA.
 *
 * Se diferencia de `estadoPresupuesto()` en un punto, a propósito: aquí `caducado` manda sobre
 * `aceptado`/`elegido`. La pregunta de esta pantalla es «¿puedo emitir CON ESTE PRECIO?», y un
 * precio caducado no se emite aunque el cliente lo aceptara: se re-tarifica. Una fecha que no se
 * puede leer NO se da por vigente (fallo seguro: caducado).
 */
export function estadoReferencia(p: SellosReferencia, hoy: Date): EstadoReferencia {
  if (instante(p.retiradoAt) !== null) return 'retirado'
  if (instante(p.emitidoAt) !== null) return 'emitido'
  const vence = instante(p.venceEl)
  if (vence === null || vence < hoy.getTime()) return 'caducado'
  const e = estadoPresupuesto(p, hoy)
  if (e === 'borrador') return instante(p.documentoDescargadoAt) !== null ? 'descargado' : 'preparado'
  // `retirado`/`emitido`/`caducado` ya se han resuelto arriba; el resto coincide.
  return e as EstadoReferencia
}

/** Se ofrece EMITIR desde la referencia solo si ese precio sigue vivo. */
export function admiteEmitir(e: EstadoReferencia): boolean {
  return e !== 'retirado' && e !== 'emitido' && e !== 'caducado'
}

export const ROTULO_ESTADO_REFERENCIA: Record<EstadoReferencia, string> = {
  retirado: 'Retirado',
  emitido: 'Emitido',
  caducado: 'Caducado: hay que re-tarificar',
  aceptado: 'Aceptado y firmado · falta emitir',
  elegido: 'Ha elegido una opción',
  visto: 'Enviado · lo ha abierto',
  enviado: 'Enviado · no consta que lo haya abierto',
  enlazado: 'WhatsApp abierto · no consta que saliera',
  descargado: 'PDF descargado · no consta que saliera',
  preparado: 'Preparado · sin enviar',
}

// ─── El conjunto de opciones que va en el documento ────────────────────────────

/**
 * Las filas de `tarificacion_precios` que el documento ENSEÑA (opciones con `oculta_at` NULL),
 * normalizadas y ordenadas. `null` = no se puede saber: alguna opción visible no guarda su
 * `precio_id` (presupuestos anteriores al 29/09/2026). Con `null` NO se reutiliza nada: dar por
 * igual un conjunto que no se puede leer es exactamente cómo se manda al cliente otra cosa.
 */
export function conjuntoEnDocumento(
  opciones: readonly { precioId: string | null; oculta: boolean }[],
): string[] | null {
  const visibles = opciones.filter((o) => !o.oculta)
  if (visibles.length === 0) return null
  const ids: string[] = []
  for (const o of visibles) {
    const id = typeof o.precioId === 'string' ? o.precioId.trim().toLowerCase() : ''
    if (id === '') return null
    ids.push(id)
  }
  return [...new Set(ids)].sort()
}

/** Igualdad de CONJUNTOS (orden y mayúsculas no cuentan). Cualquiera de los dos `null` → false. */
export function mismoConjunto(a: readonly string[] | null, b: readonly string[] | null): boolean {
  if (a === null || b === null) return false
  const x = [...new Set(a.map((s) => s.trim().toLowerCase()))].sort()
  const y = [...new Set(b.map((s) => s.trim().toLowerCase()))].sort()
  return x.length > 0 && x.length === y.length && x.every((v, i) => v === y[i])
}

export type CandidatoReutilizar = {
  id: string
  venceEl: string | Date
  retiradoAt?: string | Date | null
  emitidoAt?: string | Date | null
  creadoAt: string | Date
  opciones: readonly { precioId: string | null; oculta: boolean }[]
}

/**
 * De los presupuestos YA preparados sobre la misma tarificación, el que se reutiliza: no
 * retirado, no emitido, vigente y con EXACTAMENTE el mismo conjunto en documento. El más
 * reciente si hubiera varios. `null` = se prepara uno nuevo.
 */
export function elegirReutilizable<T extends CandidatoReutilizar>(
  candidatos: readonly T[],
  enDocumento: readonly string[] | null,
  hoy: Date,
): T | null {
  if (enDocumento === null || enDocumento.length === 0) return null
  const validos = candidatos.filter((c) => {
    if (instante(c.retiradoAt) !== null || instante(c.emitidoAt) !== null) return false
    const vence = instante(c.venceEl)
    if (vence === null || vence < hoy.getTime()) return false
    return mismoConjunto(conjuntoEnDocumento(c.opciones), enDocumento)
  })
  validos.sort((a, b) => (instante(b.creadoAt) ?? 0) - (instante(a.creadoAt) ?? 0))
  return validos[0] ?? null
}

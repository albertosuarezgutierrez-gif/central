// packages/module-seguros/src/declaracion-emision.ts
//
// «Póliza emitida» DECLARADA A MANO por el corredor (22/10/2026, Alberto). Para los ramos que no se tarifican desde la
// pantalla (accidentes colectivos de Occident, RC, comercios…): se cotiza y emite en el portal de la compañía, y Alberto
// apunta en la oportunidad el desenlace (nº de póliza + compañía, obligatorios; fecha de efecto y nota, opcionales).
// PURO: decide, no escribe.
//
// 🚨 Lo declarado NO es cartera ni «cliente». Cliente = `esCarteraEnVigor()` de CIMA (cartera-viva.ts). La declaración
// no crea póliza ni escribe en `seguros.polizas`: la oportunidad pasa a `ganada` SIN `poliza_ganada_id` y la pantalla dice
// «Emitida · pendiente de confirmar con CIMA» hasta que el pull de CIMA trae esa póliza y el enlace F1
// (`decidirEnlacesPolizaOportunidad`, vía `declaracion`) la casa por nº EXACTO + compañía (DGS) + mismo tomador.
//
// Dónde vive: una fila de `oportunidad_historial` con `accion = 'declarada_emitida'` y el `detalle` estructurado (sin texto
// libre: esa tabla no se puede borrar; la NOTA va a `historial_interno`, la ficha). La vigente es la ÚLTIMA declaración
// que no haya sido seguida por un `anulada_declaracion` (`anular_declaracion` la deja sin efecto). Sin migración.

import { numeroPolizaComparable } from './duplicados.ts'
import { mismoTomador } from './correo-cruce-cima.ts'

/** La acción de `oportunidad_historial` que guarda la declaración. */
export const ACCION_DECLARADA_EMITIDA = 'declarada_emitida'
/** La que la deja SIN EFECTO (`anular_declaracion`: la oportunidad vuelve a abierta). Es lo único que la invalida. */
export const ACCION_ANULADA_DECLARACION = 'anulada_declaracion'
/** La que deja el enlace al confirmarla con la póliza de CIMA (sin cambio de estado: ya estaba ganada). */
export const ACCION_DECLARACION_CONFIRMADA = 'declaracion_confirmada_cima'

/** Origen de la declaración (por si un día la escribe otro camino: el agente de correo, p. ej.). */
export const ORIGEN_DECLARACION_MANUAL = 'manual'

/** Días NATURALES que se espera a que CIMA traiga una póliza declarada a mano antes de avisar. En código: se revisa. */
export const DIAS_ESPERA_CIMA_DECLARADA = 10

/** Rótulos del estado visible. «En vigor» NUNCA sale de aquí: eso lo dice la cartera de CIMA. */
export const ROTULO_DECLARADA_PENDIENTE = 'Emitida · pendiente de confirmar con CIMA'
export const ROTULO_DECLARADA_CONFIRMADA = 'Emitida · confirmada por CIMA'

const ABIERTOS: ReadonlySet<string> = new Set(['competencia', 'en_negociacion', 'pendiente_cliente'])
const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/
const DGS = /^[A-Z]\d{4}$/
const MAX_NUMERO = 60
const MAX_NOTA = 500
const MAX_COMPANIA = 120

/** Una entrada del catálogo de compañías (`seguros.companias_dgs`: código DGSFP real, nunca inventado). */
export type CompaniaDeclarable = { codigoDgs: string; nombreComun: string }

export type DeclaracionEmitida = {
  /** Tal como lo tecleó el corredor (sin espacios de los lados). */
  numeroPoliza: string
  /** Nombre de la compañía (el del catálogo si se eligió de él). */
  compania: string
  /** Código DGS del catálogo. `null` = compañía sin código conocido: se enlaza solo por nº + tomador. */
  codigoDgs: string | null
  /** aaaa-mm-dd. `null` = no se dijo (≠ «sin efecto»). */
  fechaEfecto: string | null
  origen: string
}

export type PeticionDeclaracion = { numeroPoliza?: unknown; codigoDgs?: unknown; compania?: unknown; fechaEfecto?: unknown; nota?: unknown }

export type DeclaracionValidada = DeclaracionEmitida & {
  /** La nota (va a la ficha, NUNCA al historial de la oportunidad). `null` = sin nota. */
  nota: string | null
  /** `true` = la oportunidad está abierta y pasa a ganada (acción `ganar`); `false` = corrige una ya ganada sin póliza. */
  ganar: boolean
}

function diaValido(v: string): boolean {
  if (!ISO_DIA.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

/**
 * Valida la declaración. Se puede declarar sobre una oportunidad ABIERTA (pasa a ganada) o corregir sobre una GANADA que
 * aún no tiene póliza de CIMA enlazada (`polizaGanadaId` null). Una perdida, o una ganada ya enlazada, no.
 * El nº tiene que servir para casar (`numeroPolizaComparable`: ni comodín, ni «12345», ni menos de 5 caracteres útiles).
 * Compañía: o un `codigoDgs` del CATÁLOGO (`catalogo`, inyectado; `null` = no se pudo leer → no se acepta un código), o
 * un nombre libre SIN código (no se deduce ni se inventa: casará solo por nº + tomador). Fecha de efecto opcional,
 * dentro de ±2 años de `hoy` (aaaa-mm-dd, inyectado).
 */
export function validarDeclaracionEmitida(
  actual: { estado: string; polizaGanadaId: string | null },
  p: PeticionDeclaracion,
  hoy: string,
  catalogo: readonly CompaniaDeclarable[] | null,
): { ok: true; declaracion: DeclaracionValidada } | { ok: false; motivo: string } {
  const abierta = ABIERTOS.has(actual.estado)
  if (!abierta && actual.estado !== 'ganada') return { ok: false, motivo: `Una oportunidad «${actual.estado}» no se puede dar por emitida: reábrela antes.` }
  if (actual.estado === 'ganada' && actual.polizaGanadaId) return { ok: false, motivo: 'Esta oportunidad ya tiene su póliza de CIMA enlazada: no hay nada que declarar.' }
  const numero = typeof p.numeroPoliza === 'string' || typeof p.numeroPoliza === 'number' ? String(p.numeroPoliza).trim() : ''
  if (numero === '') return { ok: false, motivo: 'Falta el nº de póliza (obligatorio).' }
  if (numero.length > MAX_NUMERO) return { ok: false, motivo: `El nº de póliza no puede pasar de ${MAX_NUMERO} caracteres.` }
  if (numeroPolizaComparable(numero) === null) return { ok: false, motivo: 'Ese nº de póliza no sirve para casarlo con CIMA (muy corto, comodín o sin cifras).' }
  let compania: string
  let codigoDgs: string | null
  const dgsPedido = typeof p.codigoDgs === 'string' ? p.codigoDgs.trim().toUpperCase() : ''
  if (dgsPedido !== '') {
    if (catalogo === null) return { ok: false, motivo: 'No se ha podido leer el catálogo de compañías: no se puede comprobar ese código DGS. Reintenta.' }
    const c = catalogo.find((x) => x.codigoDgs.toUpperCase() === dgsPedido)
    if (!c) return { ok: false, motivo: 'Ese código DGS no está en el catálogo de compañías.' }
    compania = c.nombreComun
    codigoDgs = c.codigoDgs.toUpperCase()
  } else {
    const nombre = typeof p.compania === 'string' ? p.compania.trim().replace(/\s+/g, ' ') : ''
    if (nombre.length < 2) return { ok: false, motivo: 'Falta la compañía (obligatoria): elígela del catálogo o escribe su nombre.' }
    if (nombre.length > MAX_COMPANIA) return { ok: false, motivo: `El nombre de la compañía no puede pasar de ${MAX_COMPANIA} caracteres.` }
    compania = nombre
    codigoDgs = null
  }
  let fechaEfecto: string | null = null
  if (p.fechaEfecto !== undefined && p.fechaEfecto !== null && p.fechaEfecto !== '') {
    if (typeof p.fechaEfecto !== 'string' || !diaValido(p.fechaEfecto)) return { ok: false, motivo: 'La fecha de efecto no es una fecha válida (aaaa-mm-dd).' }
    if (!diaValido(hoy)) return { ok: false, motivo: 'Fecha de hoy no válida.' }
    const dif = Math.abs(Date.parse(`${p.fechaEfecto}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000
    if (dif > 731) return { ok: false, motivo: 'La fecha de efecto está a más de dos años de hoy: revísala.' }
    fechaEfecto = p.fechaEfecto
  }
  let nota: string | null = null
  if (p.nota !== undefined && p.nota !== null) {
    if (typeof p.nota !== 'string') return { ok: false, motivo: 'La nota tiene que ser texto.' }
    const t = p.nota.trim()
    if (t.length > MAX_NOTA) return { ok: false, motivo: `La nota no puede pasar de ${MAX_NOTA} caracteres.` }
    nota = t === '' ? null : t
  }
  return { ok: true, declaracion: { numeroPoliza: numero, compania, codigoDgs, fechaEfecto, origen: ORIGEN_DECLARACION_MANUAL, nota, ganar: abierta } }
}

/** ¿Es la MISMA declaración (mismo nº comparable, compañía y fecha de efecto)? Repetirla es un no-op, no una corrección. */
export function mismaDeclaracion(a: DeclaracionEmitida | null, b: DeclaracionEmitida): boolean {
  if (!a) return false
  return numeroPolizaComparable(a.numeroPoliza) === numeroPolizaComparable(b.numeroPoliza)
    && a.codigoDgs === b.codigoDgs
    && (a.codigoDgs !== null || a.compania.toLowerCase() === b.compania.toLowerCase())
    && a.fechaEfecto === b.fechaEfecto
}

/** El `detalle` que se guarda en `oportunidad_historial` (sin la nota: texto libre no va ahí). */
export function detalleDeclaracion(d: DeclaracionEmitida): Record<string, string | null> {
  return { numeroPoliza: d.numeroPoliza, compania: d.compania, codigoDgs: d.codigoDgs, fechaEfecto: d.fechaEfecto, origen: d.origen }
}

/** Lee un `detalle` guardado. Forma que no se entiende → `null` (no se inventa una declaración). */
export function leerDetalleDeclaracion(v: unknown): DeclaracionEmitida | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const numeroPoliza = typeof o.numeroPoliza === 'string' ? o.numeroPoliza.trim() : ''
  const compania = typeof o.compania === 'string' ? o.compania.trim() : ''
  const codigoDgs = o.codigoDgs === null || o.codigoDgs === undefined ? null : typeof o.codigoDgs === 'string' && DGS.test(o.codigoDgs) ? o.codigoDgs : undefined
  if (numeroPoliza === '' || compania === '' || codigoDgs === undefined || numeroPolizaComparable(numeroPoliza) === null) return null
  const fechaEfecto = typeof o.fechaEfecto === 'string' && diaValido(o.fechaEfecto) ? o.fechaEfecto : null
  const origen = typeof o.origen === 'string' && o.origen !== '' ? o.origen : ORIGEN_DECLARACION_MANUAL
  return { numeroPoliza, compania, codigoDgs, fechaEfecto, origen }
}

export type DeclaracionVigente = DeclaracionEmitida & { declaradaAt: string; actor: string | null }

/**
 * La declaración vigente de una oportunidad a partir de su historial (cualquier orden): la ÚLTIMA `declarada_emitida`
 * legible, siempre que después no haya un `anulada_declaracion`. `null` = no hay (o se anuló).
 */
export function declaracionVigente(
  historial: readonly { accion: string; detalle: unknown; fecha: string; actor?: string | null }[],
): DeclaracionVigente | null {
  const orden = [...historial].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
  let vigente: DeclaracionVigente | null = null
  for (const h of orden) {
    if (h.accion === ACCION_ANULADA_DECLARACION) { vigente = null; continue }
    if (h.accion !== ACCION_DECLARADA_EMITIDA) continue
    const d = leerDetalleDeclaracion(h.detalle)
    if (d) vigente = { ...d, declaradaAt: h.fecha, actor: h.actor ?? null }
  }
  return vigente
}

export type EstadoDeclaracion = 'pendiente_cima' | 'confirmada'

/**
 * El estado visible de una oportunidad declarada. `pendiente_cima` = ganada con declaración y sin póliza de CIMA;
 * `confirmada` = ganada con su póliza enlazada (y declaración). `null` = no hay declaración que pintar.
 */
export function estadoDeclaracion(o: { estado: string; polizaGanadaId: string | null; declaracion: DeclaracionEmitida | null }): EstadoDeclaracion | null {
  if (o.estado !== 'ganada' || !o.declaracion) return null
  return o.polizaGanadaId ? 'confirmada' : 'pendiente_cima'
}

export function rotuloDeclaracion(e: EstadoDeclaracion): string {
  return e === 'confirmada' ? ROTULO_DECLARADA_CONFIRMADA : ROTULO_DECLARADA_PENDIENTE
}

/** Días naturales entre dos fechas aaaa-mm-dd. `null` si alguna no vale. */
export function diasNaturalesEntre(desde: string, hasta: string): number | null {
  if (!diaValido(desde) || !diaValido(hasta)) return null
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)
}

/** Ventana de pólizas «nuevas» del enlace F1 (`enlace-poliza-oportunidad.ts`): fuera de ella no se enlaza sola. */
export const VENTANA_ENLACE_DIAS = 60

/** Una póliza de la correduría con el MISMO nº (comparable) que la declaración, esté como esté. */
export type PolizaConNumero = {
  id: string
  clienteId: string
  dniHash: string | null
  codigoDgs: string | null
  /** Cartera de CIMA (`esCarteraViva`). Una del volcado no cuenta como «CIMA la trae». */
  viva: boolean
  /** Estado vigente (`POLIZA_ESTADOS_VIGENTES`). */
  vigente: boolean
  sustituida: boolean
  /** La oportunidad que ya la tiene como `poliza_ganada_id`, si alguna. */
  enlazadaA: string | null
  /** ISO con hora (entrada en la cartera). */
  creadaEn: string
}

export type MotivoNoEnlaza = 'otra_compania' | 'otro_tomador' | 'enlazada_otra' | 'no_vigente' | 'antigua' | 'varias'

export type DiagnosticoDeclarada =
  | { tipo: 'enlazada' }
  | { tipo: 'enlazable' }
  | { tipo: 'esperar' }
  | { tipo: 'no_llega'; dias: number }
  | { tipo: 'no_enlaza'; motivo: MotivoNoEnlaza; polizaId: string }
  | { tipo: 'no_se_sabe' }

/**
 * PURA. ¿Qué pasa con una declaración que sigue sin póliza enlazada? Se mira por la FECHA DE LA DECLARACIÓN, no por el
 * cierre. `polizas` = las de la correduría con ese nº (cualquier estado); `null` = no se pudo leer → `no_se_sabe` (nunca
 * avisa). Sin ninguna de CIMA con ese nº: `esperar` hasta `DIAS_ESPERA_CIMA_DECLARADA` días naturales y luego `no_llega`.
 * Con alguna de CIMA que el enlace NO puede casar: `no_enlaza` con el primer motivo que la descarta (otra compañía, otro
 * tomador, ya enlazada a otra oportunidad, no vigente/sustituida, anterior a la ventana del enlace, varias). Así una
 * declaración no enlazada nunca queda muda. Sin código DGS, la compañía no filtra (casa por nº + tomador).
 */
export function diagnosticarDeclarada(
  o: { id: string; clienteId: string; dniHash: string | null },
  d: { codigoDgs: string | null; declaradaEl: string | null },
  polizas: readonly PolizaConNumero[] | null,
  hoy: string,
  ahoraMs: number,
): DiagnosticoDeclarada {
  if (polizas === null) return { tipo: 'no_se_sabe' }
  if (polizas.some((p) => p.enlazadaA === o.id)) return { tipo: 'enlazada' }
  const vivas = polizas.filter((p) => p.viva)
  if (vivas.length === 0) {
    const n = d.declaradaEl ? diasNaturalesEntre(d.declaradaEl, hoy) : null
    if (n === null) return { tipo: 'no_se_sabe' }
    return n >= DIAS_ESPERA_CIMA_DECLARADA ? { tipo: 'no_llega', dias: n } : { tipo: 'esperar' }
  }
  const primero = (xs: readonly PolizaConNumero[], motivo: MotivoNoEnlaza): DiagnosticoDeclarada => ({ tipo: 'no_enlaza', motivo, polizaId: xs[0]!.id })
  const deCompania = d.codigoDgs ? vivas.filter((p) => p.codigoDgs === d.codigoDgs) : vivas
  if (deCompania.length === 0) return primero(vivas, 'otra_compania')
  const delTomador = deCompania.filter((p) => mismoTomador(o, p))
  if (delTomador.length === 0) return primero(deCompania, 'otro_tomador')
  const libres = delTomador.filter((p) => p.enlazadaA === null)
  if (libres.length === 0) return primero(delTomador, 'enlazada_otra')
  const buenas = libres.filter((p) => p.vigente && !p.sustituida)
  if (buenas.length === 0) return primero(libres, 'no_vigente')
  const recientes = buenas.filter((p) => {
    const t = Date.parse(p.creadaEn)
    return !Number.isNaN(t) && t >= ahoraMs - VENTANA_ENLACE_DIAS * 86_400_000
  })
  if (recientes.length === 0) return primero(buenas, 'antigua')
  if (recientes.length > 1) return primero(recientes, 'varias')
  return { tipo: 'enlazable' }
}

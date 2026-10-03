// Descubrimiento AUTOMÁTICO de emisiones de Codeoscopic / Avant2 (03/10/2026).
//
// Hasta hoy una emisión hecha en la web de Avant2 solo entraba en la intranet si alguien la
// registraba a mano o si el proyecto ya estaba retenido (`/retenidas`). El webhook del vendor sigue
// apuntando al CRM de Manuel, y no queremos depender de él ni de terceros. Esto mira EN Avant2:
//
//   1. `GET /insurances?fromDate&toDate&policyApplicationSubmitted=true` (gratis), paginado, en una
//      ventana de los últimos N días (por defecto 14).
//   2. Por cada id: ¿ya está acuñado en la intranet? → se salta. Si no, `GET /insurances/{id}`
//      (gratis) y se decide:
//        · auto/moto con UNA sola ficha cuyo hash de documento casa con el del tomador →
//          `sincronizarEmisionExterna()` (la misma que el botón y `/retenidas`: crea/actualiza la
//          fila y acuña si Avant2 ya da nº de póliza, con su candado y su comprobación de tomador).
//        · 0 o varias fichas, sin documento, ramo que no se acuña, estado desconocido, bloqueo →
//          NO se escribe en la cartera: va a la cola de revisión (`codeoscopic_emisiones_revision`).
//
// 🚨 Fail-closed en TODO: un error del vendor o de la BD es un ERROR de la pasada, nunca «no hay
// nada»; un 401 corta la pasada entera (`credenciales_rechazadas`); una lista con forma desconocida
// es un error, no una lista vacía; si se agota el tope de llamadas, lo que quedó sin mirar se cuenta
// (`pendientesPorTope`) y la lista se marca `truncado` — nunca se da por revisado.
//
// Aquí NO hay BD ni Prisma: todo lo que toca la BD o la red de escritura entra por `deps`
// (cableado en `lib/descubrir-emisiones.ts`). Solo hace GET al vendor: ni un POST (lo vigila
// `test/regression-asegura-gasto-codeoscopic.test.ts`).

import { ErrorCodeoscopic, peticion } from './cliente.ts'
import type { ConfigCodeoscopic } from './config.ts'
import { leerEmisionExterna, type EmisionExterna } from './emision-externa.ts'
import { documentoTomador, ramoDeLinea } from './importar.ts'

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export const DIAS_POR_DEFECTO = 14
/** La API no admite un rango de más de un año. */
export const DIAS_MAX = 364
export const PAGE_SIZE = 100
export const MAX_PAGINAS = 10
/** Llamadas al vendor (lista + detalle + reintentos) por pasada. Todas gratis, pero no infinitas. */
export const TOPE_LLAMADAS = 40
/** Reintentos tras 429/5xx/timeout. Solo para GET: son lecturas idempotentes y gratis. */
export const REINTENTOS = 2
export const BACKOFF_BASE_MS = 1_000
/** Una fila en revisión, o un proyecto rechazado/vencido, no se vuelve a pedir antes de esto. */
export const HORAS_ENTRE_REVISIONES = 6

export const ID_PROYECTO = /^\d{1,12}$/

// ─── Presupuesto de llamadas y reintentos ─────────────────────────────────────

export type Presupuesto = { tope: number; usadas: number }
export const nuevoPresupuesto = (tope = TOPE_LLAMADAS): Presupuesto => ({ tope, usadas: 0 })

/** Se agotó el tope de llamadas de la pasada: lo que quede se cuenta como pendiente, no como visto. */
export class TopeAgotado extends Error {
  constructor() {
    super('tope de llamadas al vendor agotado en esta pasada')
    this.name = 'TopeAgotado'
  }
}

export const esAuth = (e: unknown): boolean => e instanceof ErrorCodeoscopic && e.clase === 'auth'

/** ¿Merece otro intento? 429 y 5xx (el vendor pide calma o tropieza), timeout y cortes de red. */
export function reintentable(e: unknown): boolean {
  if (!(e instanceof ErrorCodeoscopic)) return false
  if (e.clase === 'timeout' || e.clase === 'red-indeterminada' || e.clase === 'conexion') return true
  if (e.clase === 'servidor') return e.status === undefined || e.status === 429 || e.status >= 500
  return false
}

export type Esperar = (ms: number) => Promise<void>
export const esperarReal: Esperar = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Una LECTURA al vendor con backoff simple (1 s, 2 s…) y tope de llamadas. Cada intento gasta una
 * llamada del presupuesto. Un 401/403 NO se reintenta (lo propaga: la pasada se corta).
 */
export async function leerConReintento<T>(
  fn: () => Promise<T>,
  presupuesto: Presupuesto,
  esperar: Esperar = esperarReal,
): Promise<T> {
  for (let intento = 0; ; intento++) {
    if (presupuesto.usadas >= presupuesto.tope) throw new TopeAgotado()
    presupuesto.usadas++
    try {
      return await fn()
    } catch (e) {
      if (intento >= REINTENTOS || !reintentable(e)) throw e
      await esperar(BACKOFF_BASE_MS * 2 ** intento)
    }
  }
}

// ─── Lista paginada ───────────────────────────────────────────────────────────

/** La lista CRUDA de una página. `null` = forma desconocida (nunca «vacía»). */
export function itemsDePagina(raw: unknown): unknown[] | null {
  if (raw === null) return [] // 200/204 sin cuerpo
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    for (const k of ['items', 'results', 'data', 'content']) {
      const v = (raw as Json)[k]
      if (Array.isArray(v)) return v
    }
  }
  return null
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

export function ventanaDe(dias: number, hoy: Date): { desde: string; hasta: string } {
  const n = Math.min(Math.max(1, Math.trunc(dias)), DIAS_MAX)
  return { desde: iso(new Date(hoy.getTime() - n * 86_400_000)), hasta: iso(hoy) }
}

export type Listado = { ids: string[]; paginas: number; truncado: boolean }

/**
 * Ids de los proyectos con solicitud presentada en la ventana. Pagina con `pageNumber` (1…) hasta
 * una página incompleta. `X-Total-Count` no se lee (el transporte solo devuelve el cuerpo): por eso
 * se corta por página corta y, si se llega a `MAX_PAGINAS` con páginas llenas, `truncado = true`.
 */
export async function listarPresentadas(
  leer: (path: string) => Promise<unknown>,
  ventana: { desde: string; hasta: string },
  presupuesto: Presupuesto,
  esperar: Esperar = esperarReal,
  opciones: { pageSize?: number; maxPaginas?: number } = {},
): Promise<Listado> {
  const pageSize = opciones.pageSize ?? PAGE_SIZE
  const maxPaginas = opciones.maxPaginas ?? MAX_PAGINAS
  const vistos = new Set<string>()
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const q = new URLSearchParams({
      fromDate: ventana.desde,
      toDate: ventana.hasta,
      policyApplicationSubmitted: 'true',
      pageSize: String(pageSize),
      pageNumber: String(pagina),
    })
    const raw = await leerConReintento(() => leer(`/insurances?${q}`), presupuesto, esperar)
    const items = itemsDePagina(raw)
    if (!items) throw new Error('la lista de proyectos de Codeoscopic tiene una forma desconocida')
    for (const it of items) {
      const id = obj(it).id
      const s = typeof id === 'number' && Number.isFinite(id) ? String(id) : str(id)
      if (s && ID_PROYECTO.test(s)) vistos.add(s)
    }
    if (items.length < pageSize) return { ids: [...vistos], paginas: pagina, truncado: false }
  }
  return { ids: [...vistos], paginas: maxPaginas, truncado: true }
}

// ─── Planificación ────────────────────────────────────────────────────────────

/** Lo que la BD sabe de un id antes de mirar el vendor. */
export type EstadoLocal = {
  proyecto: { estado: string; clienteId: string | null; revisadoAt: Date | null } | null
  revision: { abierta: boolean; ultimaVezAt: Date | null; resueltaPorPersona: boolean } | null
}

export type Plan = {
  aProcesar: { projectId: string; tipo: 'nuevo' | 'proyecto' | 'revision' }[]
  saltados: { yaEmitida: number; descartadaPorPersona: number; reciente: number }
}

const TERMINALES = new Set(['rechazada', 'vencida'])
const horasDesde = (d: Date | null, ahora: Date) => (d ? (ahora.getTime() - d.getTime()) / 3_600_000 : Infinity)

// ─── Rotación de los NUEVOS (sin persistencia) ────────────────────────────────
//
// Un proyecto cuyo desenlace no deja fila (`ramo_no_vigilado`, `sin_solicitud`, `en_vuelo` sin
// fila…) vuelve a ser «nuevo» en cada pasada. Con un orden fijo, si hay más de los que caben en el
// tope (~38), los mismos de cabeza se comían el tope SIEMPRE y los de detrás no se miraban nunca
// (inanición). Sin tabla nueva: cada id tiene una posición ESTABLE en un anillo (hash del id) y cada
// pasada arranca en un punto que gira con la hora (una vuelta cada `HORAS_VUELTA_NUEVOS`). Con el
// cron cada 30 min, en una vuelta (12 pasadas) se recorre el anillo entero siempre que quepan
// ~1/12 de los nuevos por pasada (≈450 con el tope de 40). Lo que no cabe, sigue contándose en
// `pendientesPorTope` (y el latido de plataforma se pone en rojo si se sostiene).

/** Una vuelta completa del anillo de los nuevos. 12 pasadas del cron (cada 30 min). */
export const HORAS_VUELTA_NUEVOS = 6
const ANILLO = 2 ** 32

/**
 * Posición estable de un id en el anillo: FNV-1a de 32 bits + mezcla final (fmix32 de murmur3). Sin
 * la mezcla, ids consecutivos (como los de Avant2) caen todos en un arco del ~4 % y se pierde el reparto.
 * No depende de cuántos ids haya.
 */
export function posicionEnAnillo(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** Punto del anillo por el que empieza la pasada de `ahora`. Gira una vuelta cada `horas`. */
export function arranqueRotacion(ahora: Date, horas = HORAS_VUELTA_NUEVOS): number {
  const periodo = horas * 3_600_000
  const fase = ((ahora.getTime() % periodo) + periodo) % periodo
  return Math.floor((fase / periodo) * ANILLO)
}

/** Los nuevos en el orden de esta pasada: desde el arranque, siguiendo el anillo. */
export function rotarNuevos(ids: string[], ahora: Date): string[] {
  const inicio = arranqueRotacion(ahora)
  return ids
    .map((id) => ({ id, k: (posicionEnAnillo(id) - inicio + ANILLO) % ANILLO }))
    .sort((a, b) => a.k - b.k || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((x) => x.id)
}

/** Reparto por turnos (uno de cada lista): ningún grupo deja sin tope a los otros. */
function intercalar<T>(listas: T[][]): T[] {
  const out: T[] = []
  const largo = Math.max(0, ...listas.map((l) => l.length))
  for (let i = 0; i < largo; i++) for (const l of listas) if (i < l.length) out.push(l[i])
  return out
}

/**
 * Qué se mira en esta pasada y en qué orden: por TURNOS un nuevo (en el orden rotado del anillo),
 * un proyecto vivo de la intranet (revisión más antigua primero) y una fila en revisión (la más
 * antigua primero), para que ningún grupo deje sin tope a los otros. «Ya acuñado» =
 * `estado = 'emitida'` (NO `poliza_id`: ahí puede estar la póliza RETARIFICADA que se sustituye).
 */
export function planificar(ids: string[], locales: Map<string, EstadoLocal>, ahora: Date): Plan {
  const saltados = { yaEmitida: 0, descartadaPorPersona: 0, reciente: 0 }
  const nuevos: string[] = []
  const vivos: { id: string; at: Date | null }[] = []
  const revision: { id: string; at: Date | null }[] = []
  for (const id of [...new Set(ids)]) {
    const l = locales.get(id) ?? { proyecto: null, revision: null }
    if (l.proyecto?.estado === 'emitida') { saltados.yaEmitida++; continue }
    if (l.revision?.resueltaPorPersona && !l.revision.abierta) { saltados.descartadaPorPersona++; continue }
    if (l.proyecto) {
      if (TERMINALES.has(l.proyecto.estado) && horasDesde(l.proyecto.revisadoAt, ahora) < HORAS_ENTRE_REVISIONES) { saltados.reciente++; continue }
      vivos.push({ id, at: l.proyecto.revisadoAt })
      continue
    }
    if (l.revision?.abierta) {
      if (horasDesde(l.revision.ultimaVezAt, ahora) < HORAS_ENTRE_REVISIONES) { saltados.reciente++; continue }
      revision.push({ id, at: l.revision.ultimaVezAt })
      continue
    }
    nuevos.push(id)
  }
  const porAntiguedad = (a: { at: Date | null }, b: { at: Date | null }) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0)
  return {
    aProcesar: intercalar<Plan['aProcesar'][number]>([
      rotarNuevos(nuevos, ahora).map((projectId) => ({ projectId, tipo: 'nuevo' as const })),
      vivos.sort(porAntiguedad).map((v) => ({ projectId: v.id, tipo: 'proyecto' as const })),
      revision.sort(porAntiguedad).map((v) => ({ projectId: v.id, tipo: 'revision' as const })),
    ]),
    saltados,
  }
}

// ─── Un proyecto ──────────────────────────────────────────────────────────────

export type MotivoRevision =
  | 'sin_cliente' | 'varios_clientes' | 'sin_documento' | 'ramo_sin_acunar'
  | 'emitida_sin_acunar' | 'estado_desconocido' | 'bloqueada'

export type ItemRevision = {
  projectId: string
  motivo: MotivoRevision
  /** NULL = no se buscó. */
  coincidencias: number | null
  ramoVendor: string | null
  estadoEmision: string
  estadoVendor: string | null
  compania: string | null
  numeroPoliza: string | null
  /** Solo con un match ÚNICO. */
  clienteId: string | null
  detalle: string | null
}

/** Lo mínimo de `ResultadoSincronizar` (`lib/emision-externa.ts`) que se necesita aquí. */
export type ResultadoSync =
  | { ok: true; tipo: 'escrito'; estado: 'ok' | 'ya_emitida' | 'emitido_sin_acunar'; antes: string | null; despues: string | null; mensaje?: string; compania?: string | null; numeroPoliza?: string | null }
  | { ok: true; tipo: 'vista' }
  | { ok: false; status: number; origen: string; mensaje: string }

export type DepsProyecto = {
  /** `GET /insurances/{id}` YA con reintento y presupuesto. */
  leerProyecto: (projectId: string) => Promise<unknown>
  filaLocal: (projectId: string) => Promise<{ estado: string; clienteId: string | null } | null>
  /** Fichas vivas (no fusionadas) de la correduría con ese hash de documento. */
  clientesPorHash: (hash: string) => Promise<string[]>
  /** `computeDniLookupHash`. Lanza en producción sin clave; `null` = no se pudo calcular. */
  hashDni: (doc: string) => string | null
  sincronizar: (e: { projectId: string; clienteId: string; crudo: unknown }) => Promise<ResultadoSync>
  /** Upsert en la cola. `nueva` = es la primera vez que se abre para ese proyecto. */
  encolar: (item: ItemRevision) => Promise<{ nueva: boolean }>
  /** Cierra la fila abierta (si la hay): el proyecto ya se registró solo. */
  resolverRevision: (projectId: string) => Promise<void>
  /** ¿Una PERSONA cerró ya la revisión de este proyecto? Entonces no se vuelve a abrir. */
  descartadoPorPersona: (projectId: string) => Promise<boolean>
}

export type DesenlaceProyecto =
  | { tipo: 'ya_emitida' }
  | { tipo: 'acunada' }
  | { tipo: 'registrada'; estado: string | null } // fila creada/actualizada sin acuñar (retenida, rechazada…)
  | { tipo: 'revision'; motivo: MotivoRevision; nueva: boolean }
  | { tipo: 'sin_solicitud' }
  | { tipo: 'ramo_no_vigilado' }
  | { tipo: 'en_vuelo' } // solicitud recién creada en un proyecto de la intranet: es de `/emitir`, no se toca
  | { tipo: 'descartada' } // una persona cerró su revisión: no se vuelve a mirar

/**
 * Minutos durante los que una solicitud RECIÉN creada en un proyecto que ya tiene fila se deja en
 * paz: `/emitir` suelta su candado (`cerrarEnvio`) ANTES de acuñar, y en ese hueco esta pasada
 * podría acuñar la misma póliza (la guarda «ya acuñada» de `registrarPolizaEmitida` no es atómica).
 */
export const MINUTOS_EN_VUELO = 15

function itemBase(projectId: string, crudo: unknown, e: EmisionExterna): Omit<ItemRevision, 'motivo' | 'coincidencias' | 'clienteId' | 'detalle'> {
  const s = e.estado === 'sin_solicitud' ? null : e
  return {
    projectId,
    ramoVendor: str(obj(obj(crudo).insuranceLine).id),
    estadoEmision: e.estado,
    estadoVendor: s ? s.solicitud.estadoNombre ?? s.solicitud.estadoId : null,
    compania: s ? s.compania : null,
    numeroPoliza: s ? s.solicitud.numeroPoliza : null,
  }
}

/**
 * Resuelve UN proyecto. Lanza ante errores de vendor/BD (los cuenta la pasada como ERROR; un
 * `ErrorCodeoscopic` de auth corta la pasada). Nunca escribe en la cartera sin un match ÚNICO por
 * documento, y aun entonces es `sincronizarEmisionExterna` quien re-comprueba el tomador.
 */
export async function procesarProyecto(
  projectId: string,
  deps: DepsProyecto,
  opciones: { presentadaSegunLista: boolean; ahora?: Date },
): Promise<DesenlaceProyecto> {
  const fila = await deps.filaLocal(projectId)
  if (fila?.estado === 'emitida') return { tipo: 'ya_emitida' }
  if (!fila && (await deps.descartadoPorPersona(projectId))) return { tipo: 'descartada' }

  const crudo = await deps.leerProyecto(projectId)
  const emision = leerEmisionExterna(crudo)
  const base = itemBase(projectId, crudo, emision)
  const encolar = async (motivo: MotivoRevision, extra: Partial<Pick<ItemRevision, 'coincidencias' | 'clienteId' | 'detalle'>> = {}): Promise<DesenlaceProyecto> => {
    const r = await deps.encolar({ ...base, motivo, coincidencias: extra.coincidencias ?? null, clienteId: extra.clienteId ?? null, detalle: extra.detalle ?? null })
    return { tipo: 'revision', motivo, nueva: r.nueva }
  }

  if (emision.estado === 'sin_solicitud') {
    // La lista dijo «presentada» y el proyecto no cuenta ninguna: incoherente → se mira a mano.
    if (opciones.presentadaSegunLista) return encolar('estado_desconocido', { detalle: 'la lista de Avant2 la da por presentada y el proyecto no cuenta ninguna solicitud' })
    return { tipo: 'sin_solicitud' }
  }
  if (emision.estado === 'desconocido') return encolar('estado_desconocido')
  if (fila && emision.solicitud.creadaEn) {
    const creada = new Date(emision.solicitud.creadaEn).getTime()
    const ahora = (opciones.ahora ?? new Date()).getTime()
    if (Number.isFinite(creada) && ahora - creada < MINUTOS_EN_VUELO * 60_000) return { tipo: 'en_vuelo' }
  }

  const ramo = ramoDeLinea(crudo)

  // ¿De quién es? La ficha de la fila manda (y sincronizar re-comprueba su documento); si no hay,
  // se busca por el hash del documento del tomador. NUNCA por nombre.
  let clienteId = fila?.clienteId ?? null
  let coincidencias: number | null = null
  if (!clienteId) {
    const doc = documentoTomador(crudo)
    if (!doc) {
      if (!ramo) return emisionNoAcunable(emision, encolar, null, null)
      return encolar('sin_documento')
    }
    const hash = deps.hashDni(doc)
    // Sin hash con documento = falta la clave del índice ciego: es un fallo de CONFIGURACIÓN, no
    // «este tomador no es cliente».
    if (!hash) throw new Error('no se puede calcular el hash del documento (¿falta PII_LOOKUP_KEY?)')
    const fichas = [...new Set((await deps.clientesPorHash(hash)).map((x) => x.toLowerCase()))]
    coincidencias = fichas.length
    if (fichas.length === 1) clienteId = fichas[0]
    else if (ramo) return encolar(fichas.length === 0 ? 'sin_cliente' : 'varios_clientes', { coincidencias })
  }

  if (!ramo) return emisionNoAcunable(emision, encolar, clienteId, coincidencias)
  if (!clienteId) return encolar('sin_cliente', { coincidencias })

  const r = await deps.sincronizar({ projectId, clienteId, crudo })
  if (!r.ok) {
    if (r.status === 409 || r.status === 422) return encolar('bloqueada', { coincidencias, clienteId, detalle: r.mensaje.slice(0, 500) })
    throw new Error(`sincronizar ${r.status} (${r.origen}): ${r.mensaje}`)
  }
  if (r.tipo !== 'escrito') throw new Error('sincronizar devolvió una vista previa en una escritura')
  if (r.estado === 'emitido_sin_acunar') return encolar('emitida_sin_acunar', { coincidencias, clienteId, detalle: r.mensaje?.slice(0, 500) ?? null })
  await deps.resolverRevision(projectId)
  if (r.estado === 'ya_emitida') return { tipo: 'ya_emitida' }
  if (r.despues === 'emitida' && r.antes !== 'emitida') return { tipo: 'acunada' }
  return { tipo: 'registrada', estado: r.despues }
}

/** Hogar, salud, vida, decesos…: la intranet no los acuña sola. Emitida con nº → «emitida sin acuñar». */
async function emisionNoAcunable(
  emision: EmisionExterna,
  encolar: (m: MotivoRevision, extra?: Partial<Pick<ItemRevision, 'coincidencias' | 'clienteId' | 'detalle'>>) => Promise<DesenlaceProyecto>,
  clienteId: string | null,
  coincidencias: number | null,
): Promise<DesenlaceProyecto> {
  if (emision.estado === 'aprobada' && emision.solicitud.numeroPoliza) {
    return encolar('ramo_sin_acunar', { clienteId, coincidencias, detalle: 'ramo que la intranet no acuña sola: se registra a mano' })
  }
  return { tipo: 'ramo_no_vigilado' }
}

// ─── La pasada ────────────────────────────────────────────────────────────────

export type EstadoPasada = 'ok' | 'credenciales_rechazadas' | 'error_vendor'

export type ResumenPasada = {
  estado: EstadoPasada
  ventana: { desde: string; hasta: string }
  listados: number
  paginas: number
  /** La lista no se recorrió entera (tope de páginas): NO se ha visto todo. */
  truncado: boolean
  /** Ids que vienen de la BD (preemisión de la intranet) y no de la lista. */
  deLaIntranet: number
  llamadas: number
  revisados: number
  saltados: Plan['saltados']
  acunadas: number
  registradas: number
  yaEmitidas: number
  sinSolicitud: number
  ramoNoVigilado: number
  enVuelo: number
  revisionNuevas: number
  revisionPorMotivo: Partial<Record<MotivoRevision, number>>
  desconocidosNuevos: number
  /** Se quedaron sin mirar por el tope de llamadas o de tiempo: la próxima pasada los coge. */
  pendientesPorTope: number
  errores: { projectId: string | null; mensaje: string }[]
  /** Mensaje del fallo que cortó la pasada (lista o credenciales). */
  motivo?: string
}

export type DepsPasada = DepsProyecto & {
  /** GET sin reintento (el reintento lo pone la pasada). */
  leer: (path: string) => Promise<unknown>
  locales: (ids: string[]) => Promise<Map<string, EstadoLocal>>
  /** Proyectos de la intranet en `preemision` (Submit hecho, sin póliza) aunque estén fuera de la ventana. */
  candidatosIntranet: () => Promise<string[]>
  /** Rotación: marca que el proyecto (si tiene fila) se acaba de mirar. */
  marcarRevisado: (projectId: string) => Promise<void>
  esperar?: Esperar
  ahora?: () => Date
}

const textoError = (e: unknown): string => {
  if (e instanceof ErrorCodeoscopic) return `vendor:${e.clase}${e.status ? ` ${e.status}` : ''}`
  return (e instanceof Error ? e.message : String(e)).slice(0, 300)
}

export async function descubrirEmisiones(
  opciones: { dias?: number; topeLlamadas?: number; presupuestoMs?: number },
  deps: DepsPasada,
): Promise<ResumenPasada> {
  const ahora = deps.ahora ?? (() => new Date())
  const inicio = ahora()
  const esperar = deps.esperar ?? esperarReal
  const presupuesto = nuevoPresupuesto(opciones.topeLlamadas ?? TOPE_LLAMADAS)
  const ventana = ventanaDe(opciones.dias ?? DIAS_POR_DEFECTO, inicio)
  const resumen: ResumenPasada = {
    estado: 'ok', ventana, listados: 0, paginas: 0, truncado: false, deLaIntranet: 0, llamadas: 0, revisados: 0,
    saltados: { yaEmitida: 0, descartadaPorPersona: 0, reciente: 0 },
    acunadas: 0, registradas: 0, yaEmitidas: 0, sinSolicitud: 0, ramoNoVigilado: 0, enVuelo: 0,
    revisionNuevas: 0, revisionPorMotivo: {}, desconocidosNuevos: 0, pendientesPorTope: 0, errores: [],
  }
  const cerrar = () => ({ ...resumen, llamadas: presupuesto.usadas })

  let listado: Listado
  try {
    listado = await listarPresentadas(deps.leer, ventana, presupuesto, esperar)
  } catch (e) {
    resumen.estado = esAuth(e) ? 'credenciales_rechazadas' : 'error_vendor'
    resumen.motivo = textoError(e)
    return cerrar()
  }
  resumen.listados = listado.ids.length
  resumen.paginas = listado.paginas
  resumen.truncado = listado.truncado

  const deLista = new Set(listado.ids)
  const intranet = (await deps.candidatosIntranet()).filter((id) => ID_PROYECTO.test(id) && !deLista.has(id))
  resumen.deLaIntranet = intranet.length
  const todos = [...listado.ids, ...intranet]
  const plan = planificar(todos, await deps.locales(todos), inicio)
  resumen.saltados = plan.saltados

  const leerProyecto = (id: string) => leerConReintento(() => deps.leer(`/insurances/${id}`), presupuesto, esperar)
  const depsProyecto: DepsProyecto = { ...deps, leerProyecto }

  for (let i = 0; i < plan.aProcesar.length; i++) {
    const { projectId } = plan.aProcesar[i]
    const fueraDeTiempo = opciones.presupuestoMs !== undefined && ahora().getTime() - inicio.getTime() > opciones.presupuestoMs
    if (presupuesto.usadas >= presupuesto.tope || fueraDeTiempo) {
      resumen.pendientesPorTope = plan.aProcesar.length - i
      break
    }
    try {
      const d = await procesarProyecto(projectId, depsProyecto, { presentadaSegunLista: deLista.has(projectId), ahora: ahora() })
      resumen.revisados++
      if (d.tipo === 'acunada') resumen.acunadas++
      else if (d.tipo === 'registrada') resumen.registradas++
      else if (d.tipo === 'ya_emitida') resumen.yaEmitidas++
      else if (d.tipo === 'sin_solicitud') resumen.sinSolicitud++
      else if (d.tipo === 'ramo_no_vigilado') resumen.ramoNoVigilado++
      else if (d.tipo === 'en_vuelo') resumen.enVuelo++
      else if (d.tipo === 'descartada') resumen.saltados.descartadaPorPersona++
      else {
        resumen.revisionPorMotivo[d.motivo] = (resumen.revisionPorMotivo[d.motivo] ?? 0) + 1
        if (d.nueva) {
          resumen.revisionNuevas++
          if (d.motivo === 'estado_desconocido') resumen.desconocidosNuevos++
        }
      }
    } catch (e) {
      if (e instanceof TopeAgotado) {
        resumen.pendientesPorTope = plan.aProcesar.length - i
        break
      }
      if (esAuth(e)) {
        resumen.estado = 'credenciales_rechazadas'
        resumen.motivo = textoError(e)
        resumen.pendientesPorTope = plan.aProcesar.length - i
        break
      }
      resumen.errores.push({ projectId, mensaje: textoError(e) })
    }
    await deps.marcarRevisado(projectId).catch((e) => {
      resumen.errores.push({ projectId, mensaje: `rotación: ${textoError(e)}` })
    })
  }
  return cerrar()
}

// ─── Webhook: best-effort ─────────────────────────────────────────────────────

export const MAX_IDS_WEBHOOK = 5

/** Ids válidos y únicos de un envío del webhook (como mucho `MAX_IDS_WEBHOOK`). */
export function idsDelWebhook(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((x): x is string => typeof x === 'string' && ID_PROYECTO.test(x)))].slice(0, MAX_IDS_WEBHOOK)
}

/**
 * Tras guardar el crudo del webhook, intenta sincronizar cada proyecto. NUNCA lanza: si falla, el
 * cron de descubrimiento lo recoge. El receptor tiene que seguir contestando 200 pase lo que pase
 * (Codeoscopic reintenta cada ~30 min hasta un 200/204).
 */
export async function sincronizarTrasWebhook(
  ids: (string | null | undefined)[],
  procesar: (projectId: string) => Promise<DesenlaceProyecto>,
  log: (linea: string) => void = (l) => console.log(l),
): Promise<{ intentados: number; fallidos: number }> {
  let fallidos = 0
  const validos = idsDelWebhook(ids)
  for (const id of validos) {
    try {
      const d = await procesar(id)
      log(`[webhooks/codeoscopic] sync ${id}: ${d.tipo}${d.tipo === 'revision' ? ` (${d.motivo})` : ''}`)
    } catch (e) {
      fallidos++
      log(`[webhooks/codeoscopic] sync ${id} falló (lo recoge el cron): ${textoError(e)}`)
    }
  }
  return { intentados: validos.length, fallidos }
}

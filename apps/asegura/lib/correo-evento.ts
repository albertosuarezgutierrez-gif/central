// apps/asegura/lib/correo-evento.ts
//
// Despacho de los EVENTOS que el triaje de correo de plataforma lee en los avisos de las compañías
// (`leerCorreoEventoAseguradora` de `@central/module-seguros`, 14/10/2026). PURO (sin BD ni red,
// `node --test`): aquí se valida lo que llega por el puerto, se resuelve la póliza entre candidatas YA
// leídas y se DECIDE qué se escribe. La escritura vive en `correo-evento-bd.ts`.
//
// Reglas:
// - Solo se escribe sobre la cartera EN VIGOR (`esCarteraEnVigor`). Póliza que no casa (o casa con dos)
//   → `sin_resolver`: no se toca la cartera y el evento queda para la bandeja «Correos de compañía».
// - Un siniestro que ya vino por CIMA no se duplica ni se le cambia el estado (lo fija la compañía):
//   solo una nota de seguimiento en la ficha (`duplicado_cima`).
// - Pre-anulación / impago → nota + UNA tarea por póliza y recibo con vencimiento = la fecha límite de
//   la compañía (nunca en el pasado: si el aviso llega tarde, vence hoy).
// - Anulación → NUNCA se crea un expediente de /anulaciones solo: ese expediente modela una baja que
//   PIDE el cliente (firma → comunicar → confirmar) y abrirlo por un correo lo dejaría pidiendo una
//   firma que no existe, y en la cola de «comunicar a la compañía» algo que la compañía ya hizo. Se
//   deja nota + tarea «confirmar anulación» (si hay expediente abierto, la tarea dice cuál).
// - Suplemento → nota + tarea de revisar.
// - Emisión (póliza nueva, Allianz «Rel. Emisión Producción») → NUNCA se crea la póliza desde el correo: la
//   fuente es CIMA. Si CIMA ya la trae en vigor → `duplicado_cima` (nada que hacer); si no → `sin_resolver`
//   con «póliza nueva aún no llegada por CIMA», para que Alberto la vea en la bandeja. Sin notas ni tareas.
// - Sin IBAN ni NIF: el lector ya los quita; aquí se vuelve a pasar `sinDatosSensibles` por todo texto
//   libre que entra por el puerto (segunda red: el puerto no se fía de quien llama).

import { esCarteraEnVigor, esCarteraViva, motivoReciboAnulado, normalizarNumeroSolicitud, pideDocumentacion, sinDatosSensibles, textoTareaDocumentacion, urlSolicitudValida, validarTarea } from '@central/module-seguros'
import { eur } from './dinero.ts'

export const TIPOS_EVENTO_CORREO = ['siniestro', 'pre_anulacion', 'impago', 'anulacion', 'suplemento', 'emision', 'solicitud'] as const
export type TipoEventoCorreo = (typeof TIPOS_EVENTO_CORREO)[number]

/** Desenlace guardado por fila. `procesando` = reservada y sin desenlace confirmado (se mira a mano). */
export const ESTADOS_EVENTO_CORREO = ['aplicado', 'duplicado_cima', 'sin_resolver', 'procesando'] as const
export type EstadoEventoCorreo = (typeof ESTADOS_EVENTO_CORREO)[number]

/** Prefijo de las tareas que nacen de un aviso de compañía (y origen de las sueltas). */
export const PREFIJO_TAREA_CORREO = '[Aviso de compañía]'
export const ORIGEN_TAREA_CORREO = 'central:correo-compania'
export const ACTOR_CORREO = 'triaje-correo'

const COMPANIAS: Record<string, { codigo: string; nombre: string; claves: string[] }> = {
  occident: { codigo: 'C0468', nombre: 'Occident', claves: ['occident', 'catalana'] },
  reale: { codigo: 'C0613', nombre: 'Reale', claves: ['reale'] },
  mapfre: { codigo: 'C0058', nombre: 'Mapfre', claves: ['mapfre'] },
  allianz: { codigo: 'C0109', nombre: 'Allianz', claves: ['allianz'] },
}

export function nombreCompania(c: string): string {
  return COMPANIAS[c]?.nombre ?? c
}

// ── Entrada ──────────────────────────────────────────────────────────────────

export type ItemEvento =
  | {
      tipo: 'siniestro'; clave: string; subtipo: 'apertura' | 'actualizacion' | 'cierre'
      numeroSiniestro: string; numeroPoliza: string | null; ramo: string | null
      fechaOcurrencia: string | null; fechaAccion: string | null; accion: string | null
    }
  | {
      tipo: 'pre_anulacion' | 'impago'; clave: string
      numeroPoliza: string; idRecibo: string | null; importe: number | null; fechaLimite: string | null
    }
  | {
      tipo: 'anulacion'; clave: string; numeroPoliza: string | null; fechaEfecto: string | null; motivo: string | null
      /**
       * Solo en el resumen de recibos ANULADOS por impago (Occident, 20/10/2026): lo anulado es ESTE RECIBO, no
       * necesariamente la póliza. Con él, la nota y la tarea hablan del recibo y la clave es póliza/recibo.
       */
      idRecibo?: string
    }
  | {
      tipo: 'suplemento'; clave: string
      numeroPoliza: string; descripcion: string | null; periodoDesde: string | null; periodoHasta: string | null
    }
  | {
      tipo: 'emision'; clave: string
      numeroPoliza: string; idRecibo: string | null; producto: string | null; fechaEfecto: string | null
      /** Total del primer recibo. `null` = no se leyó (no es 0€). */
      prima: number | null
    }
  | {
      /** Estado de una solicitud/proyecto en la compañía (20/10/2026). Se casa con la OPORTUNIDAD, no con una póliza. */
      tipo: 'solicitud'; clave: string
      /** Nº de solicitud normalizado (sin ceros de relleno). Es también la `clave`. */
      numeroSolicitud: string; ramo: string | null
      /** Estado de la plantilla de la compañía. `null` = el lector no lo reconoció (no «sin estado»). */
      estado: string | null
      /** Enlace al proyecto, ya validado (`urlSolicitudValida`). El TOMADOR no entra: no se guarda en la tabla. */
      url: string | null
    }

export type EntradaEvento = {
  mensajeId: string
  compania: string
  codigoDgs: string
  tipo: TipoEventoCorreo
  /** Trozos del correo que el lector no supo leer (se dicen, no se callan). */
  ilegibles: number
  items: ItemEvento[]
}

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/
const ISO_MES = /^\d{4}-\d{2}$/
const ID = /^[A-Z0-9][A-Z0-9.\-/]{2,40}$/i

function obj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function id(v: unknown): string | null {
  return typeof v === 'string' && ID.test(v.trim()) ? v.trim() : null
}
function dia(v: unknown): string | null {
  if (typeof v !== 'string' || !ISO_DIA.test(v)) return null
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v
}
function periodo(v: unknown): string | null {
  return dia(v) ?? (typeof v === 'string' && ISO_MES.test(v) ? v : null)
}
function libre(v: unknown, max = 300): string | null {
  if (typeof v !== 'string') return null
  const t = sinDatosSensibles(v.replace(/\s+/g, ' ').trim())
  if (t === '') return null
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}
function importe(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1_000_000 ? Math.round(v * 100) / 100 : null
}

/**
 * Valida el cuerpo de `POST /api/operador/correo/evento`: `{ mensajeId, compania?, evento }`. No se fía
 * de la forma: un trozo que no se entiende se CUENTA en `ilegibles` (se dice), nunca se inventa.
 */
export function validarEntradaEvento(b: unknown): { ok: true; entrada: EntradaEvento } | { ok: false; motivo: string } {
  const o = obj(b)
  if (!o) return { ok: false, motivo: 'cuerpo JSON no válido' }
  const mensajeId = typeof o.mensajeId === 'string' ? o.mensajeId.trim() : ''
  if (mensajeId === '' || mensajeId.length > 300) return { ok: false, motivo: 'falta mensajeId (Message-ID del correo)' }
  const e = obj(o.evento)
  if (!e) return { ok: false, motivo: 'falta evento' }
  const compania = typeof e.compania === 'string' ? e.compania : ''
  const cia = COMPANIAS[compania]
  if (!cia) return { ok: false, motivo: 'compañía desconocida' }
  if (typeof o.compania === 'string' && o.compania !== compania) return { ok: false, motivo: 'la compañía del cuerpo no es la del evento' }
  // El código DGS sale de la compañía, no de quien llama: con uno ajeno se resolverían pólizas de otra.
  if (e.codigoDgs !== cia.codigo) return { ok: false, motivo: 'el código DGS no es el de la compañía' }
  const tipo = TIPOS_EVENTO_CORREO.find((t) => t === e.tipo)
  if (!tipo) return { ok: false, motivo: 'tipo de evento desconocido' }
  let ilegibles = typeof e.ilegibles === 'number' && Number.isInteger(e.ilegibles) && e.ilegibles >= 0 ? Math.min(e.ilegibles, 999) : 0
  const items: ItemEvento[] = []
  const vistos = new Set<string>()
  const meter = (i: ItemEvento | null) => {
    if (!i) { ilegibles++; return }
    if (vistos.has(i.clave)) return // la misma fila dos veces en un correo: una vez
    vistos.add(i.clave)
    items.push(i)
  }

  if (tipo === 'siniestro') {
    const lista = Array.isArray(e.siniestros) ? e.siniestros.slice(0, 200) : null
    if (!lista) return { ok: false, motivo: 'faltan los siniestros' }
    for (const s of lista.map(obj)) {
      const numero = id(s?.numeroSiniestro)
      const subtipo = s?.subtipo === 'apertura' || s?.subtipo === 'actualizacion' || s?.subtipo === 'cierre' ? s.subtipo : null
      meter(numero && subtipo ? {
        tipo, clave: numero, subtipo, numeroSiniestro: numero, numeroPoliza: id(s?.numeroPoliza), ramo: libre(s?.ramo, 60),
        fechaOcurrencia: dia(s?.fechaOcurrencia), fechaAccion: dia(s?.fechaAccion), accion: libre(s?.accion),
      } : null)
    }
  } else if (tipo === 'pre_anulacion' || tipo === 'impago') {
    const lista = Array.isArray(e.recibos) ? e.recibos.slice(0, 200) : null
    if (!lista) return { ok: false, motivo: 'faltan los recibos' }
    for (const r of lista.map(obj)) {
      const poliza = id(r?.numeroPoliza)
      const recibo = r?.idRecibo === null ? null : id(r?.idRecibo)
      if (r?.idRecibo !== null && r?.idRecibo !== undefined && recibo === null) { ilegibles++; continue }
      meter(poliza ? {
        tipo, clave: recibo ? `${poliza}/${recibo}` : poliza, numeroPoliza: poliza, idRecibo: recibo,
        importe: importe(r?.importe), fechaLimite: dia(r?.fechaLimite),
      } : null)
    }
  } else if (tipo === 'anulacion' && Array.isArray(e.recibos)) {
    // Resumen de recibos ANULADOS por impago (Occident, 20/10/2026): una anulación por póliza. «Anulado en fecha» es del
    // RECIBO, no el efecto de la baja: `fechaEfecto` queda null (no se sabe) y la fecha va en el motivo.
    for (const r of e.recibos.slice(0, 200).map(obj)) {
      const poliza = id(r?.numeroPoliza)
      const recibo = id(r?.idRecibo)
      meter(poliza && recibo ? {
        tipo, clave: `${poliza}/${recibo}`, numeroPoliza: poliza, idRecibo: recibo, fechaEfecto: null,
        motivo: libre(motivoReciboAnulado({ idRecibo: recibo, fechaAnulacion: dia(r?.fechaAnulacion) }), 120),
      } : null)
    }
  } else if (tipo === 'anulacion') {
    const poliza = id(e.numeroPoliza)
    meter({ tipo, clave: poliza ?? 'sin-poliza', numeroPoliza: poliza, fechaEfecto: dia(e.fechaEfecto), motivo: libre(e.motivo, 120) })
  } else if (tipo === 'emision') {
    const lista = Array.isArray(e.polizas) ? e.polizas.slice(0, 200) : null
    if (!lista) return { ok: false, motivo: 'faltan las pólizas emitidas' }
    for (const p of lista.map(obj)) {
      const poliza = id(p?.numeroPoliza)
      const recibo = p?.idRecibo === null || p?.idRecibo === undefined ? null : id(p.idRecibo)
      if (p?.idRecibo !== null && p?.idRecibo !== undefined && recibo === null) { ilegibles++; continue }
      meter(poliza ? {
        tipo, clave: poliza, numeroPoliza: poliza, idRecibo: recibo, producto: libre(p?.producto, 60),
        fechaEfecto: dia(p?.fechaEfecto), prima: importe(p?.prima),
      } : null)
    }
  } else if (tipo === 'solicitud') {
    // El `tomador` que trae el evento NO se copia: la fila guarda `detalle` y en ella no van nombres.
    const numero = normalizarNumeroSolicitud(e.numeroSolicitud)
    meter(numero ? {
      tipo, clave: numero, numeroSolicitud: numero, ramo: libre(e.ramo, 60), estado: libre(e.estado, 200),
      url: urlSolicitudValida(e.url, compania, numero),
    } : null)
  } else {
    const poliza = id(e.numeroPoliza)
    meter(poliza ? {
      tipo, clave: poliza, numeroPoliza: poliza, descripcion: libre(e.descripcion),
      periodoDesde: periodo(e.periodoDesde), periodoHasta: periodo(e.periodoHasta),
    } : null)
  }
  return { ok: true, entrada: { mensajeId, compania, codigoDgs: cia.codigo, tipo, ilegibles, items } }
}

// ── Resolver la póliza ───────────────────────────────────────────────────────

/** Una póliza de la cartera con lo justo para decidir. */
export type PolizaCandidata = {
  id: string
  clienteId: string
  numeroPoliza: string | null
  codigoDgs: string | null
  aseguradora: string | null
  importRef: string | null
  eiacXmlHash: string | null
  estado: string | null
  sustituidaAt: Date | string | null
}

export type ResolucionEvento =
  | { estado: 'en_vigor'; poliza: PolizaCandidata }
  | { estado: 'no_en_vigor'; poliza: PolizaCandidata }
  | { estado: 'sin_resolver'; motivo: 'sin_numero' | 'no_encontrada' | 'ambigua' }

/** Sin espacios, puntos, guiones ni barras, en mayúsculas y SIN ceros a la izquierda (Mapfre los pone, CIMA no siempre). */
export function claveNumero(n: string | null | undefined): string | null {
  if (!n) return null
  const t = n.replace(/[\s.\-/]/g, '').toUpperCase().replace(/^0+/, '')
  return t === '' ? null : t
}

function esDeLaCompania(p: Pick<PolizaCandidata, 'codigoDgs' | 'aseguradora'>, compania: string, codigoDgs: string): boolean {
  if (p.codigoDgs) return p.codigoDgs === codigoDgs
  const nombre = (p.aseguradora ?? '').toLowerCase()
  return nombre !== '' && (COMPANIAS[compania]?.claves ?? []).some((c) => nombre.includes(c))
}

/**
 * La póliza del evento por nº + compañía, entre las de la cartera VIVA (origen CIMA). En vigor → se
 * escribe; viva pero no en vigor → cada tipo decide (casi siempre «CIMA ya lo sabe»); nada o más de
 * una distinta → `sin_resolver` (nunca se elige una al azar).
 */
export function resolverPolizaEvento(
  numeroPoliza: string | null, compania: string, codigoDgs: string, candidatas: readonly PolizaCandidata[],
): ResolucionEvento {
  const buscada = claveNumero(numeroPoliza)
  if (!buscada) return { estado: 'sin_resolver', motivo: 'sin_numero' }
  const casan = candidatas.filter((p) => esCarteraViva(p) && claveNumero(p.numeroPoliza) === buscada && esDeLaCompania(p, compania, codigoDgs))
  const enVigor = casan.filter((p) => esCarteraEnVigor(p))
  if (enVigor.length === 1) return { estado: 'en_vigor', poliza: enVigor[0] }
  if (enVigor.length > 1) return { estado: 'sin_resolver', motivo: 'ambigua' }
  if (casan.length === 1) return { estado: 'no_en_vigor', poliza: casan[0] }
  return { estado: 'sin_resolver', motivo: casan.length > 1 ? 'ambigua' : 'no_encontrada' }
}

// ── Decidir ──────────────────────────────────────────────────────────────────

export type SiniestroExistente = { id: string; origen: string; clienteId: string; polizaId: string }

/** Un siniestro de la cartera con ese nº (la consulta busca por «contiene»; aquí se exige el nº entero). */
export type SiniestroCandidato = SiniestroExistente & {
  idSiniestroEntidad: string | null
  referencia: string | null
  codigoEntidadDgs: string | null
  /** La póliza del siniestro; `null` = no se pudo leer (entonces no se sabe de qué compañía es). */
  poliza: { numeroPoliza: string | null; codigoDgs: string | null; aseguradora: string | null } | null
}

export type EleccionSiniestro =
  | { estado: 'casa'; siniestro: SiniestroExistente }
  /** Hay un siniestro de esa compañía con ese nº, pero el correo trae OTRA póliza: no se elige. */
  | { estado: 'poliza_distinta' }
  | { estado: 'ninguno' }

/**
 * El siniestro de la cartera al que se refiere el correo. Un nº de siniestro solo es único DENTRO de una
 * compañía: sin código DGS en el siniestro, la compañía se mira en SU póliza (sin póliza, no casa). Y si
 * el correo trae un nº de póliza distinto del de la póliza del siniestro, no se apunta a ninguno: es otro
 * siniestro con el mismo nº o un correo mal leído → `sin_resolver`, nunca una nota en la ficha equivocada.
 */
export function elegirSiniestro(
  filas: readonly SiniestroCandidato[], numero: string, compania: string, codigoDgs: string, numeroPolizaCorreo: string | null,
): EleccionSiniestro {
  const n = claveNumero(numero)
  if (!n) return { estado: 'ninguno' }
  const polizaCorreo = claveNumero(numeroPolizaCorreo)
  const deLaCompania = filas.filter((s) => (claveNumero(s.idSiniestroEntidad) === n || claveNumero(s.referencia) === n)
    && (s.codigoEntidadDgs !== null ? s.codigoEntidadDgs === codigoDgs : s.poliza !== null && esDeLaCompania(s.poliza, compania, codigoDgs)))
  const casan = deLaCompania.filter((s) => {
    const suya = claveNumero(s.poliza?.numeroPoliza)
    return !polizaCorreo || !suya || suya === polizaCorreo
  })
  // El de CIMA manda (es el que la compañía mantiene); si hubiera dos nuestros, el primero basta para la nota.
  const s = casan.find((x) => x.origen === 'cima') ?? casan[0]
  if (s) return { estado: 'casa', siniestro: { id: s.id, origen: s.origen, clienteId: s.clienteId, polizaId: s.polizaId } }
  return deLaCompania.length > 0 ? { estado: 'poliza_distinta' } : { estado: 'ninguno' }
}

/** Tope de candidatos que lee la consulta de siniestro por nº; con más, no se adivina (ver `elegirSiniestroAcotado`). */
export const TOPE_SINIESTROS_CANDIDATOS = 50

/**
 * Como `elegirSiniestro`, pero sobre una lectura acotada: la consulta pide `tope + 1` filas; si llegan más de `tope`
 * el LIMIT pudo dejar fuera el bueno, así que NO se elige ninguno (`poliza_distinta` → `sin_resolver`), nunca uno al azar.
 */
export function elegirSiniestroAcotado(
  filas: readonly SiniestroCandidato[], tope: number, numero: string, compania: string, codigoDgs: string, numeroPolizaCorreo: string | null,
): EleccionSiniestro {
  if (!claveNumero(numero)) return { estado: 'ninguno' }
  if (filas.length > tope) return { estado: 'poliza_distinta' }
  return elegirSiniestro(filas, numero, compania, codigoDgs, numeroPolizaCorreo)
}

/**
 * Fecha (aaaa-mm-dd) en Europe/Madrid de la `fechaCorreo` recibida. Un ISO con hora ('2026-10-14T22:30:00.000Z') se
 * pasa a Madrid (a las 00:30 de Madrid ya es el día siguiente); una fecha sola se respeta. Otra cosa → null.
 */
export function fechaCorreoMadrid(v: unknown): string | null {
  if (typeof v !== 'string') return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  if (!/^\d{4}-\d{2}-\d{2}T/.test(v)) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

/**
 * La fecha del aviso que distingue «la compañía repite lo mismo» de «dice algo nuevo» (para no anotar cada
 * día el mismo resumen de Occident, que llega con otro Message-ID). `null` = el tipo no se deduplica así.
 */
export function campoFechaDedupe(tipo: TipoEventoCorreo): 'fechaLimite' | 'fechaEfecto' | 'periodoHasta' | null {
  if (tipo === 'pre_anulacion' || tipo === 'impago') return 'fechaLimite'
  if (tipo === 'anulacion') return 'fechaEfecto'
  if (tipo === 'suplemento') return 'periodoHasta'
  return null
}
export type ExpedienteAbierto = { id: string; estado: string; fechaEfecto: string | null }

export type ContextoItem = {
  resolucion: ResolucionEvento
  /** El siniestro con ese nº ya en la cartera (CIMA o nuestro). Solo para `siniestro`. */
  siniestro: SiniestroExistente | null
  /** Hay un siniestro de la compañía con ese nº pero con OTRA póliza que la del correo → sin_resolver. */
  siniestroPolizaDistinta?: boolean
  /** Expediente de /anulaciones abierto en esa póliza. Solo para `anulacion`. */
  expediente: ExpedienteAbierto | null
  /** Ya hay una tarea abierta de un aviso de compañía para esa póliza/recibo. */
  tareaAbierta: boolean
  /** Fecha del correo (aaaa-mm-dd) o null. */
  fechaCorreo: string | null
  /** Hoy en Madrid (aaaa-mm-dd). */
  hoy: string
}

export type TareaPlan = { tipo: 'llamada' | 'tarea'; prioridad: 'alta' | 'media'; observaciones: string; fechaLimite: string }

export type Plan = {
  estado: Exclude<EstadoEventoCorreo, 'procesando'>
  /** Por qué no se aplicó (sin_resolver) o qué se sabía ya (duplicado_cima). */
  motivo: string | null
  /** Línea para `historial_interno` del cliente. `null` = no se anota nada. */
  nota: string | null
  /** Tipo de la línea del historial. */
  tipoNota: 'gestion' | 'siniestro'
  /** Abrir un siniestro nuestro (origen gestionado_correduria). */
  abrirSiniestro: { tipo: 'otro'; fechaHora: string; descripcion: string; referencia: string } | null
  /** Si al abrir resulta que CIMA ya lo tenía (409 duplicado): esta nota en su lugar. */
  notaSiDuplicado: string | null
  tarea: TareaPlan | null
  /** Llave de «una tarea por póliza/recibo». */
  claveTarea: string | null
  siniestroId: string | null
  /** Lo que se hizo, en corto, para el aviso y la bandeja. */
  resumen: string
}

const fechaEs = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

function sumarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Nunca en el pasado: un aviso que llega tarde vence HOY. */
export function venceTarea(fecha: string | null, hoy: string, porDefecto: number): string {
  if (fecha && fecha >= hoy) return fecha
  return fecha ? hoy : sumarDias(hoy, porDefecto)
}

const MOTIVO_RESOLUCION: Record<'sin_numero' | 'no_encontrada' | 'ambigua', string> = {
  sin_numero: 'el correo no trae nº de póliza',
  no_encontrada: 'ninguna póliza viva de esa compañía con ese nº',
  ambigua: 'más de una póliza casa con ese nº: no se elige una',
}

function base(resumen: string): Plan {
  return { estado: 'aplicado', motivo: null, nota: null, tipoNota: 'gestion', abrirSiniestro: null, notaSiDuplicado: null, tarea: null, claveTarea: null, siniestroId: null, resumen }
}

function sinResolver(motivo: string): Plan {
  return { ...base(`póliza no encontrada → bandeja (${motivo})`), estado: 'sin_resolver', motivo }
}

/** Motivo de una emisión que CIMA aún no trae (la bandeja y el aviso lo pintan tal cual). */
export const MOTIVO_EMISION_NO_LLEGADA = 'póliza nueva aún no llegada por CIMA'

/** Importe que se guarda en la fila (columna `importe`): el del recibo en riesgo o la prima de la póliza nueva. */
export function importeDeItem(item: ItemEvento): number | null {
  if (item.tipo === 'pre_anulacion' || item.tipo === 'impago') return item.importe
  if (item.tipo === 'emision') return item.prima
  return null
}

/**
 * ¿El insert chocó con el CHECK de `tipo` (un tipo nuevo, como `emision`, antes de aplicar su SQL)? Es «falta la
 * migración» (503 `sin_migracion`), no un fallo del servidor. El nombre es el que Postgres pone al CHECK en línea.
 */
export function esCheckTipoEventoCorreo(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  const meta = (e as { meta?: { code?: unknown; message?: unknown } } | null)?.meta
  const texto = `${msg} ${typeof meta?.message === 'string' ? meta.message : ''}`
  return /correo_evento_entrante_tipo_check/.test(texto) && (meta?.code === '23514' || /violates check constraint|23514/i.test(texto))
}

/** Clave de «una tarea por póliza/recibo» (pre-anulación e impago del MISMO recibo comparten tarea). */
export function claveTareaDe(item: ItemEvento, polizaId: string): string {
  if (item.tipo === 'pre_anulacion' || item.tipo === 'impago') return `recibo:${polizaId}:${claveNumero(item.idRecibo) ?? '-'}`
  // Un recibo anulado por impago: una tarea por RECIBO (otro recibo de la misma póliza, meses después, es otro aviso).
  if (item.tipo === 'anulacion' && item.idRecibo) return `anulacion-recibo:${polizaId}:${claveNumero(item.idRecibo) ?? '-'}`
  return `${item.tipo}:${polizaId}`
}

export function planItem(item: ItemEvento, compania: string, ctx: ContextoItem): Plan {
  const cia = nombreCompania(compania)
  const delCorreo = ctx.fechaCorreo ? ` (correo del ${fechaEs(ctx.fechaCorreo)})` : ''

  if (item.tipo === 'siniestro') {
    const que = item.subtipo === 'apertura' ? 'apertura' : item.subtipo === 'cierre' ? 'cierre' : 'actualización'
    const detalle = `${que}${item.accion ? `: ${item.accion}` : ''}`
    if (ctx.siniestroPolizaDistinta) {
      return sinResolver('el siniestro con ese nº está en la cartera con otra póliza que la del correo: no se elige')
    }
    if (ctx.siniestro) {
      const nota = `Siniestro ${item.numeroSiniestro} — ${cia} avisa por correo${delCorreo}: ${detalle}`
      const deCima = ctx.siniestro.origen === 'cima'
      return {
        ...base(deCima ? `siniestro ${item.numeroSiniestro} ya en CIMA: nota de seguimiento en la ficha` : `nota en el siniestro ${item.numeroSiniestro} de la ficha`),
        estado: deCima ? 'duplicado_cima' : 'aplicado',
        motivo: deCima ? 'el siniestro ya vino por CIMA: su estado lo fija la compañía' : null,
        nota, tipoNota: 'siniestro', siniestroId: ctx.siniestro.id,
      }
    }
    const r = ctx.resolucion
    if (r.estado === 'sin_resolver') {
      return sinResolver(r.motivo === 'sin_numero' ? 'el siniestro no está en la cartera y el correo no trae nº de póliza' : MOTIVO_RESOLUCION[r.motivo])
    }
    if (r.estado === 'no_en_vigor') return sinResolver('la póliza no está en vigor según CIMA')
    if (item.subtipo !== 'cierre' && item.fechaOcurrencia) {
      const descripcion = `Comunicado por ${cia} por correo (siniestro ${item.numeroSiniestro}${item.ramo ? `, ${item.ramo}` : ''}): ${detalle}`.slice(0, 4000)
      return {
        ...base(`siniestro ${item.numeroSiniestro} abierto en la ficha`),
        // Mediodía UTC: el día de ocurrencia no se corre de fecha en ninguna zona horaria.
        abrirSiniestro: { tipo: 'otro', fechaHora: `${item.fechaOcurrencia}T12:00:00.000Z`, descripcion, referencia: item.numeroSiniestro },
        notaSiDuplicado: `Siniestro ${item.numeroSiniestro} — ${cia} avisa por correo${delCorreo}: ${detalle}`,
        tipoNota: 'siniestro',
      }
    }
    // Un cierre (o un aviso sin fecha del hecho) de un siniestro que no tenemos: no se abre uno para
    // cerrarlo; queda escrito en la ficha.
    return {
      ...base(`nota en la ficha: siniestro ${item.numeroSiniestro} (${que}) que no constaba en la cartera`),
      nota: `Siniestro ${item.numeroSiniestro} — ${cia} avisa por correo${delCorreo}: ${detalle}. No constaba en la cartera${item.subtipo === 'cierre' ? '' : ' (sin fecha del hecho: no se abre solo)'}.`,
      tipoNota: 'siniestro',
    }
  }

  if (item.tipo === 'pre_anulacion' || item.tipo === 'impago') {
    const r = ctx.resolucion
    if (r.estado === 'sin_resolver') return sinResolver(MOTIVO_RESOLUCION[r.motivo])
    const recibo = item.idRecibo ? `recibo ${item.idRecibo}` : 'recibo sin nº'
    if (r.estado === 'no_en_vigor') {
      return { ...base('CIMA ya da la póliza por no vigente: no se crea tarea'), estado: 'duplicado_cima', motivo: 'la póliza ya no está en vigor según CIMA' }
    }
    const imp = item.importe !== null ? ` de ${eur(item.importe)}` : ''
    const plazo = item.fechaLimite ? `anulará el ${fechaEs(item.fechaLimite)}` : 'anulará (no da fecha)'
    const nota = item.tipo === 'pre_anulacion'
      ? `${cia} avisa por correo${delCorreo}: ${recibo}${imp} sin cobrar; ${plazo} si no se paga.`
      : `${cia} DELEGA el cobro del ${recibo}${imp} en la correduría${delCorreo}${item.fechaLimite ? `; plazo hasta el ${fechaEs(item.fechaLimite)}` : ''}.`
    if (ctx.tareaAbierta) return { ...base('ya había tarea abierta de ese recibo: solo nota'), nota }
    const fecha = venceTarea(item.fechaLimite, ctx.hoy, 0)
    return {
      ...base(`tarea creada, vence ${fechaEs(fecha)}`),
      nota,
      tarea: {
        tipo: 'llamada', prioridad: 'alta', fechaLimite: fecha,
        observaciones: `${PREFIJO_TAREA_CORREO} ${item.tipo === 'pre_anulacion' ? 'Pre-anulación' : 'Impago delegado'} ${cia}: ${recibo}${imp}. Llamar al cliente para que pague antes de que se anule${item.fechaLimite ? ` (${fechaEs(item.fechaLimite)})` : ''}.`,
      },
      claveTarea: claveTareaDe(item, r.poliza.id),
    }
  }

  if (item.tipo === 'anulacion') {
    const r = ctx.resolucion
    if (r.estado === 'sin_resolver') return sinResolver(MOTIVO_RESOLUCION[r.motivo])
    if (r.estado === 'no_en_vigor') {
      return { ...base('CIMA ya la trae no vigente: no se hace nada'), estado: 'duplicado_cima', motivo: 'la póliza ya no está en vigor según CIMA' }
    }
    if (item.idRecibo) {
      // Lo anulado es el RECIBO (anulación automática por impago). Que la póliza siga viva o no, el correo no lo dice.
      const nota = `${cia} comunica por correo${delCorreo} que ha ANULADO POR IMPAGO el recibo ${item.idRecibo}${item.motivo ? ` (${item.motivo})` : ''}. El correo no dice que la póliza esté anulada.`
      if (ctx.tareaAbierta) return { ...base('ya había tarea de ese recibo anulado: solo nota'), nota }
      const fecha = venceTarea(null, ctx.hoy, 2)
      return {
        ...base(`tarea «recibo anulado por impago» creada, vence ${fechaEs(fecha)}`),
        nota,
        tarea: {
          tipo: 'tarea', prioridad: 'alta', fechaLimite: fecha,
          observaciones: `${PREFIJO_TAREA_CORREO} ${cia} ha anulado por impago el recibo ${item.idRecibo}. Comprobar en el portal de la compañía cómo queda la póliza y hablar con el cliente.`,
        },
        claveTarea: claveTareaDe(item, r.poliza.id),
      }
    }
    const efecto = item.fechaEfecto ? ` con efecto ${fechaEs(item.fechaEfecto)}` : ''
    const nota = `${cia} comunica por correo${delCorreo} la ANULACIÓN de la póliza${efecto}${item.motivo ? ` (${item.motivo})` : ''}.`
    if (ctx.tareaAbierta) return { ...base('ya había tarea de confirmar la anulación: solo nota'), nota }
    const exp = ctx.expediente
    const observaciones = exp
      ? `${PREFIJO_TAREA_CORREO} ${cia} confirma la anulación${efecto}. Hay un expediente abierto en /anulaciones (${exp.estado}): compruébalo y márcalo confirmado.`
      : `${PREFIJO_TAREA_CORREO} ${cia} comunica la anulación${efecto} y no hay expediente en /anulaciones. Confirmar en el portal de la compañía quién la pidió y por qué; si el cliente se va, tratarlo como baja.`
    const fecha = venceTarea(null, ctx.hoy, 2)
    return {
      ...base(`tarea «confirmar anulación» creada, vence ${fechaEs(fecha)}${exp ? ' (hay expediente abierto)' : ''}`),
      nota,
      tarea: { tipo: 'tarea', prioridad: 'alta', fechaLimite: fecha, observaciones },
      claveTarea: claveTareaDe(item, r.poliza.id),
    }
  }

  if (item.tipo === 'emision') {
    // Nunca se crea la póliza ni se escribe en la ficha: CIMA es la fuente. Solo se dice si ya la trae.
    const r = ctx.resolucion
    const que = `póliza nueva ${item.numeroPoliza}${item.producto ? ` (${item.producto})` : ''}`
    if (r.estado === 'en_vigor') {
      return { ...base(`${que} ya en CIMA: nada que hacer`), estado: 'duplicado_cima', motivo: 'CIMA ya trae la póliza en vigor' }
    }
    if (r.estado === 'no_en_vigor') {
      return { ...base(`${que}: CIMA tiene ese nº pero no en vigor → bandeja`), estado: 'sin_resolver', motivo: 'CIMA tiene ese nº pero no en vigor: compruébalo en el portal de la compañía' }
    }
    if (r.motivo === 'ambigua') return { ...base(`${que}: casa con más de una póliza → bandeja`), estado: 'sin_resolver', motivo: MOTIVO_RESOLUCION.ambigua }
    return { ...base(`${que} emitida, aún no llegada por CIMA → bandeja`), estado: 'sin_resolver', motivo: MOTIVO_EMISION_NO_LLEGADA }
  }

  // `solicitud` no se resuelve por póliza: va por `planSolicitud` (contra la oportunidad).
  if (item.tipo !== 'suplemento') return sinResolver('tipo de aviso desconocido')
  const r = ctx.resolucion
  if (r.estado === 'sin_resolver') return sinResolver(MOTIVO_RESOLUCION[r.motivo])
  if (r.estado === 'no_en_vigor') return sinResolver('la póliza no está en vigor según CIMA')
  const per = item.periodoDesde || item.periodoHasta ? ` (periodo ${item.periodoDesde ?? '?'} a ${item.periodoHasta ?? '?'})` : ''
  const nota = `${cia} por correo${delCorreo}: suplemento${item.descripcion ? ` — ${item.descripcion}` : ''}${per}.`
  if (ctx.tareaAbierta) return { ...base('ya había tarea de revisar ese suplemento: solo nota'), nota }
  const fecha = venceTarea(null, ctx.hoy, 7)
  return {
    ...base(`tarea «revisar suplemento» creada, vence ${fechaEs(fecha)}`),
    nota,
    tarea: { tipo: 'tarea', prioridad: 'media', fechaLimite: fecha, observaciones: `${PREFIJO_TAREA_CORREO} Revisar suplemento ${cia}${item.descripcion ? `: ${item.descripcion}` : ''}${per}.` },
    claveTarea: claveTareaDe(item, r.poliza.id),
  }
}

// ── Solicitud en la compañía (20/10/2026) ────────────────────────────────────

/** La oportunidad que lleva ese nº de solicitud de esa compañía (el índice único garantiza una como mucho). */
export type OportunidadSolicitud = {
  id: string
  clienteId: string
  estado: string
  ramo: string | null
  cliente: string | null
}

export type PlanSolicitud =
  | { estado: 'sin_resolver'; motivo: string; resumen: string }
  | {
      estado: 'aplicado'
      motivo: null
      resumen: string
      /** Línea de `oportunidad_historial` (accion `correo_compania`). */
      detalleHistorial: { compania: string; numeroSolicitud: string; estado: string | null; url: boolean; fechaCorreo: string | null }
      /** Texto de la tarea «enviar documentación» si toca crearla (la BD comprueba que no haya una abierta igual). */
      tareaDocumentacion: TareaPlan | null
    }

const ABIERTAS_OPORTUNIDAD: ReadonlySet<string> = new Set(['competencia', 'en_negociacion', 'pendiente_cliente'])

/**
 * Desenlace de una solicitud que revienta a mitad. Si NADA se escribió en la oportunidad (falló la lectura o la
 * transacción del estado, que es atómica) vuelve a `sin_resolver`: la bandeja la enseña y `vincularSolicitudesPendientes`
 * la puede volver a enganchar (solo coge `sin_resolver`). Si el estado YA se aplicó, `procesando` con el error, como
 * el resto de tipos: a mano, para no repetir la nota ni la tarea.
 */
export function estadoTrasErrorSolicitud(estadoYaAplicado: boolean): Extract<EstadoEventoCorreo, 'sin_resolver' | 'procesando'> {
  return estadoYaAplicado ? 'procesando' : 'sin_resolver'
}

/**
 * Qué se hace con el estado de una solicitud. Sin oportunidad con ese nº → `sin_resolver` (bandeja «Correos de
 * compañía»: Alberto apunta el nº en la oportunidad y el correo se engancha solo). Con ella → nota en su historial
 * y, si la compañía pide documentación y la oportunidad sigue abierta, tarea para HOY.
 */
export function planSolicitud(
  item: Extract<ItemEvento, { tipo: 'solicitud' }>, compania: string, op: OportunidadSolicitud | null, ctx: { fechaCorreo: string | null; hoy: string },
): PlanSolicitud {
  const cia = nombreCompania(compania)
  if (!op) {
    return {
      estado: 'sin_resolver',
      motivo: `ninguna oportunidad lleva la solicitud ${item.numeroSolicitud} de ${cia}: apunta el nº en la oportunidad`,
      resumen: `solicitud ${item.numeroSolicitud} sin oportunidad → bandeja`,
    }
  }
  const abierta = ABIERTAS_OPORTUNIDAD.has(op.estado)
  const tarea: TareaPlan | null = abierta && pideDocumentacion(item.estado)
    ? { tipo: 'tarea', prioridad: 'alta', fechaLimite: ctx.hoy, observaciones: textoTareaDocumentacion(compania, item.numeroSolicitud) }
    : null
  const que = item.estado ? `«${item.estado}»` : 'estado no reconocido (míralo en el correo)'
  return {
    estado: 'aplicado',
    motivo: null,
    resumen: `oportunidad ${op.ramo ?? 'sin ramo'}${op.cliente ? ` de ${op.cliente}` : ''}: ${que}${abierta ? '' : ` (está ${op.estado})`}`,
    detalleHistorial: { compania, numeroSolicitud: item.numeroSolicitud, estado: item.estado, url: item.url !== null, fechaCorreo: ctx.fechaCorreo },
    tareaDocumentacion: tarea,
  }
}

/** La tarea del plan pasa las MISMAS reglas que una tarea a mano (`validarTarea`). */
export type DecisionReevaluacion =
  | { resuelve: true; polizaId: string; clienteId: string; motivo: string | null; resumen: string }
  | { resuelve: false }

/**
 * Reevaluación (14/10/2026): una emisión que quedó `sin_resolver` («aún no llegada por CIMA») pasa a
 * `duplicado_cima` cuando CIMA ya trae la póliza. Reutiliza `planItem` (la MISMA regla que el POST): solo
 * resuelve si el plan sale `duplicado_cima` Y la resolución es una única póliza en vigor. Sin póliza,
 * dos o no en vigor → se queda como estaba. `hoy` = aaaa-mm-dd (día en que CIMA se ve con la póliza).
 */
export function decidirReevaluacionEmision(
  item: ItemEvento, compania: string, resolucion: ResolucionEvento, hoy: string,
): DecisionReevaluacion {
  if (item.tipo !== 'emision') return { resuelve: false }
  const plan = planItem(item, compania, { resolucion, siniestro: null, expediente: null, tareaAbierta: false, fechaCorreo: null, hoy })
  if (plan.estado !== 'duplicado_cima' || resolucion.estado !== 'en_vigor') return { resuelve: false }
  return {
    resuelve: true, polizaId: resolucion.poliza.id, clienteId: resolucion.poliza.clienteId,
    motivo: null, resumen: `CIMA ya la trae (${fechaEs(hoy)})`,
  }
}

export function tareaValida(t: TareaPlan, hoy: Date): { ok: true } | { ok: false; motivo: string } {
  const v = validarTarea(t, hoy)
  return v.ok ? { ok: true } : { ok: false, motivo: v.motivo }
}

// ── «Marcar como mirado» (14/10/2026) ────────────────────────────────────────

const UUID_EVENTO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Cuerpo de `PATCH /api/operador/correo/evento`: `{ id: uuid, revisado: boolean }`. Nada se coacciona. */
export function validarMarcaRevisado(b: unknown): { ok: true; id: string; revisado: boolean } | { ok: false; motivo: string } {
  if (typeof b !== 'object' || b === null || Array.isArray(b)) return { ok: false, motivo: 'cuerpo no válido' }
  const o = b as Record<string, unknown>
  if (typeof o.id !== 'string' || !UUID_EVENTO.test(o.id)) return { ok: false, motivo: 'id no válido' }
  if (typeof o.revisado !== 'boolean') return { ok: false, motivo: 'revisado debe ser true o false' }
  return { ok: true, id: o.id, revisado: o.revisado }
}

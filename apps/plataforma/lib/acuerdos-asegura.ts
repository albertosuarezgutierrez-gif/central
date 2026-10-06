// Acuerdos con compañías, claves de mediador y productividad, servidos por asegura
// (`GET /api/operador/companias/acuerdos` y `…/productividad`). Lo PURO: leer las
// respuestas y decidir qué texto pintar. La red vive en `companias-asegura.ts`.
// Spec: docs/superpowers/specs/2026-10-06-correduria-acuerdos-companias-design.md
//
// 🚨 NULL ≠ 0 en todo el fichero. Un % que el acuerdo no dice se lee `null` y se
// pinta «—» («no consta»), nunca «0 %». Una suma sin recibos detrás se pinta «sin
// recibos», nunca «0,00€». Un objetivo «pendiente» se pinta ⚪ con su motivo,
// nunca 🟢. Un valor de lista que no se reconoce se DECLARA, no se esconde.
//
// 🔒 Las cifras de APROMES (PDF privado de asociados) llegan por la red en tiempo
// de ejecución y NUNCA se escriben en el repo: ni aquí, ni en tests, ni en fixtures.

import { eur } from './dinero.ts'

// ─── Tipos (espejo del DTO de asegura) ───────────────────────────────────────

export type Cerrado = { valor: string } | { valor: null; crudo: string }

export type Clave = {
  id: string
  companiaCodigoDgs: string
  estado: Cerrado
  canal: Cerrado
  asociacion: string | null
  codigosCima: string[]
  etiqueta: string | null
  fechaAlta: string | null
}

export type LineaAcuerdo = {
  id: string
  ramo: string | null
  ramoTexto: string
  producto: string | null
  modalidad: string | null
  /** `null` = no consta. */
  pctNp: number | null
  pctCartera: number | null
  notas: string | null
}

export type Tramo = { desde: number; hasta: number | null; pct: number | null; importe: number | null }

export type Objetivo = {
  id: string
  tipo: Cerrado
  ambito: Cerrado
  base: Cerrado
  criterioCobro: Cerrado | null
  ramos: string[]
  periodoDesde: string
  periodoHasta: string
  tramos: { estado: 'ok'; tramos: Tramo[] } | { estado: 'ilegible'; motivo: string }
  siniestralidadMaxPct: number | null
  condiciones: string | null
}

export type Acuerdo = {
  id: string
  companiaCodigoDgs: string
  fuente: Cerrado
  fuenteNombre: string | null
  claveId: string | null
  vigenciaDesde: string
  vigenciaHasta: string | null
  requisitosApertura: string | null
  letraPequena: string | null
  documentoFuente: string
  /** `null` = sin cotejar con el documento original. */
  revisadoAt: string | null
  comisiones: LineaAcuerdo[]
  objetivos: Objetivo[]
}

export type RespuestaAcuerdos =
  | { estado: 'ok'; claves: Clave[]; acuerdos: Acuerdo[]; conflictosCodigos: { companiaCodigoDgs: string; codigo: string }[] }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

export type Suma = { importe: number; recibos: number; ilegibles: number }

export type Produccion = {
  companiaCodigoDgs: string
  npCobrada: Suma
  npPendiente: Suma
  carteraCobrada: Suma
  comisionAplicada: Suma
  polizasNp: number
  sinFecha: number
}

export type EstadoObjetivo =
  | { color: 'pendiente'; motivo: string; detalle: string | null; medido: number | null }
  | {
      color: 'alcanzado' | 'en_camino' | 'por_debajo' | 'no_llega'
      medido: number
      proyectado: number | null
      umbral: number
      siguiente: Tramo | null
      falta: number | null
      rappelEstimado: number | null
      diasRestantes: number
    }

export type ObjetivoEvaluado = { acuerdoId: string; objetivoId: string; companiaCodigoDgs: string; estado: EstadoObjetivo }

export type RespuestaProductividad =
  | {
      estado: 'ok'
      anio: number
      periodo: { desde: string; hasta: string }
      hoy: string
      truncado: boolean
      /** `null` = no consta en la respuesta. */
      sinCompania: number | null
      produccion: Produccion[]
      objetivos: ObjetivoEvaluado[]
    }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

// ─── Lectura defensiva ───────────────────────────────────────────────────────

type O = Record<string, unknown>
const obj = (v: unknown): O | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as O) : null)
const cadena = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
/** Número o `null`. Un texto, un NaN o un `undefined` NO se convierten en 0. */
const numOnull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const cadenas = (v: unknown): string[] => lista(v).filter((x): x is string => typeof x === 'string')

function cerrado(v: unknown): Cerrado | null {
  const o = obj(v)
  if (!o) return null
  if (typeof o.valor === 'string') return { valor: o.valor }
  if (o.valor === null && typeof o.crudo === 'string') return { valor: null, crudo: o.crudo }
  return null
}

function leerLinea(v: unknown): LineaAcuerdo | null {
  const o = obj(v)
  const id = cadena(o?.id)
  const ramoTexto = cadena(o?.ramoTexto)
  if (!o || !id || !ramoTexto) return null
  return {
    id, ramoTexto,
    ramo: cadena(o.ramo), producto: cadena(o.producto), modalidad: cadena(o.modalidad),
    pctNp: numOnull(o.pctNp), pctCartera: numOnull(o.pctCartera), notas: cadena(o.notas),
  }
}

function leerTramo(v: unknown): Tramo | null {
  const o = obj(v)
  const desde = numOnull(o?.desde)
  if (!o || desde === null) return null
  return { desde, hasta: numOnull(o.hasta), pct: numOnull(o.pct), importe: numOnull(o.importe) }
}

function leerObjetivo(v: unknown): Objetivo | null {
  const o = obj(v)
  const id = cadena(o?.id)
  const tipo = cerrado(o?.tipo), ambito = cerrado(o?.ambito), base = cerrado(o?.base)
  const desde = cadena(o?.periodoDesde), hasta = cadena(o?.periodoHasta)
  if (!o || !id || !tipo || !ambito || !base || !desde || !hasta) return null
  const t = obj(o.tramos)
  const tramos: Objetivo['tramos'] = t?.estado === 'ok'
    ? { estado: 'ok', tramos: lista(t.tramos).map(leerTramo).filter((x): x is Tramo => x !== null) }
    : { estado: 'ilegible', motivo: cadena(t?.motivo) ?? 'tramos ilegibles' }
  return {
    id, tipo, ambito, base, criterioCobro: o.criterioCobro === null ? null : cerrado(o.criterioCobro),
    ramos: cadenas(o.ramos), periodoDesde: desde, periodoHasta: hasta, tramos,
    siniestralidadMaxPct: numOnull(o.siniestralidadMaxPct), condiciones: cadena(o.condiciones),
  }
}

function leerAcuerdo(v: unknown): Acuerdo | null {
  const o = obj(v)
  const id = cadena(o?.id), compania = cadena(o?.companiaCodigoDgs), fuente = cerrado(o?.fuente)
  const desde = cadena(o?.vigenciaDesde), doc = cadena(o?.documentoFuente)
  if (!o || !id || !compania || !fuente || !desde || !doc) return null
  return {
    id, companiaCodigoDgs: compania, fuente, fuenteNombre: cadena(o.fuenteNombre), claveId: cadena(o.claveId),
    vigenciaDesde: desde, vigenciaHasta: cadena(o.vigenciaHasta),
    requisitosApertura: cadena(o.requisitosApertura), letraPequena: cadena(o.letraPequena),
    documentoFuente: doc, revisadoAt: cadena(o.revisadoAt),
    comisiones: lista(o.comisiones).map(leerLinea).filter((x): x is LineaAcuerdo => x !== null),
    objetivos: lista(o.objetivos).map(leerObjetivo).filter((x): x is Objetivo => x !== null),
  }
}

function leerClave(v: unknown): Clave | null {
  const o = obj(v)
  const id = cadena(o?.id), compania = cadena(o?.companiaCodigoDgs), estado = cerrado(o?.estado), canal = cerrado(o?.canal)
  if (!o || !id || !compania || !estado || !canal) return null
  return {
    id, companiaCodigoDgs: compania, estado, canal, asociacion: cadena(o.asociacion),
    codigosCima: cadenas(o.codigosCima), etiqueta: cadena(o.etiqueta), fechaAlta: cadena(o.fechaAlta),
  }
}

function errorDe(status: number, o: O): { estado: 'error'; motivo: string } {
  return { estado: 'error', motivo: cadena(o.causa) ?? cadena(o.motivo) ?? cadena(o.error) ?? `HTTP ${status}` }
}

export function interpretarAcuerdos(status: number, json: unknown): RespuestaAcuerdos {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = obj(json) ?? {}
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status !== 200 || o.estado !== 'ok') return errorDe(status, o)
  if (!Array.isArray(o.acuerdos) || !Array.isArray(o.claves)) return { estado: 'error', motivo: 'respuesta_ilegible' }
  return {
    estado: 'ok',
    claves: o.claves.map(leerClave).filter((x): x is Clave => x !== null),
    acuerdos: o.acuerdos.map(leerAcuerdo).filter((x): x is Acuerdo => x !== null),
    conflictosCodigos: lista(o.conflictosCodigos).map(obj).filter((x): x is O => x !== null)
      .map((c) => ({ companiaCodigoDgs: String(c.companiaCodigoDgs), codigo: String(c.codigo) })),
  }
}

function leerSuma(v: unknown): Suma | null {
  const o = obj(v)
  const importe = numOnull(o?.importe), recibos = numOnull(o?.recibos), ilegibles = numOnull(o?.ilegibles)
  if (importe === null || recibos === null || ilegibles === null) return null
  return { importe, recibos, ilegibles }
}

function leerProduccion(v: unknown): Produccion | null {
  const o = obj(v)
  const c = cadena(o?.companiaCodigoDgs)
  const np = leerSuma(o?.npCobrada), npp = leerSuma(o?.npPendiente), ca = leerSuma(o?.carteraCobrada), com = leerSuma(o?.comisionAplicada)
  const polizasNp = numOnull(o?.polizasNp), sinFecha = numOnull(o?.sinFecha)
  // Sin alguno de sus campos, la fila entera es ilegible: no se rellena con 0.
  if (!o || !c || !np || !npp || !ca || !com || polizasNp === null || sinFecha === null) return null
  return { companiaCodigoDgs: c, npCobrada: np, npPendiente: npp, carteraCobrada: ca, comisionAplicada: com, polizasNp, sinFecha }
}

function leerEstadoObjetivo(v: unknown): EstadoObjetivo | null {
  const o = obj(v)
  if (!o) return null
  if (o.color === 'pendiente') {
    return { color: 'pendiente', motivo: cadena(o.motivo) ?? 'desconocido', detalle: cadena(o.detalle), medido: numOnull(o.medido) }
  }
  const colores = ['alcanzado', 'en_camino', 'por_debajo', 'no_llega'] as const
  const color = colores.find((c) => c === o.color)
  const medido = numOnull(o.medido), umbral = numOnull(o.umbral), diasRestantes = numOnull(o.diasRestantes)
  // Un color sin sus números no se pinta: se lee como objetivo ilegible (⚪), no como uno a cero.
  if (!color || medido === null || umbral === null || diasRestantes === null) return null
  return {
    color, medido, umbral, proyectado: numOnull(o.proyectado), siguiente: leerTramo(o.siguiente),
    falta: numOnull(o.falta), rappelEstimado: numOnull(o.rappelEstimado), diasRestantes,
  }
}

export function interpretarProductividad(status: number, json: unknown): RespuestaProductividad {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = obj(json) ?? {}
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status !== 200 || o.estado !== 'ok') return errorDe(status, o)
  const periodo = obj(o.periodo)
  const anio = numOnull(o.anio)
  if (!Array.isArray(o.produccion) || !Array.isArray(o.objetivos) || !periodo || anio === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  return {
    estado: 'ok', anio,
    periodo: { desde: String(periodo.desde), hasta: String(periodo.hasta) },
    hoy: cadena(o.hoy) ?? '',
    truncado: o.truncado === true,
    sinCompania: numOnull(o.sinCompania),
    produccion: o.produccion.map(leerProduccion).filter((x): x is Produccion => x !== null),
    objetivos: o.objetivos.map((x) => {
      const e = obj(x)
      const estado = leerEstadoObjetivo(e?.estado)
      if (!e || !estado) return null
      return { acuerdoId: String(e.acuerdoId), objetivoId: String(e.objetivoId), companiaCodigoDgs: String(e.companiaCodigoDgs), estado }
    }).filter((x): x is ObjetivoEvaluado => x !== null),
  }
}

// ─── Qué se pinta ────────────────────────────────────────────────────────────

/** Un % pactado. `null` → «—» (no consta). Un 0 explícito → «0 %». */
export function textoPct(v: number | null): string {
  return v === null ? '—' : `${v.toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`
}

/**
 * Una suma de producción. `null` (no se pudo leer) → «sin datos»; sin recibos →
 * «sin recibos» (no «0,00€»); con ilegibles → el importe leído y cuántos faltan.
 */
export function textoSuma(s: Suma | null): string {
  if (s === null) return 'sin datos'
  if (s.recibos === 0) return 'sin recibos'
  const base = `${eur(s.importe)} · ${s.recibos} recibo${s.recibos === 1 ? '' : 's'}`
  return s.ilegibles > 0 ? `${base} (${s.ilegibles} ilegible${s.ilegibles === 1 ? '' : 's'}: total incompleto)` : base
}

export const ETIQUETA_FUENTE: Record<string, string> = { apromes: 'APROMES', directo: 'Directo', otra_asociacion: 'Asociación' }

export function etiquetaFuente(a: Pick<Acuerdo, 'fuente' | 'fuenteNombre'>): string {
  if (a.fuente.valor === null) return `«${a.fuente.crudo}» (no reconocida)`
  if (a.fuente.valor === 'otra_asociacion' && a.fuenteNombre) return a.fuenteNombre
  return ETIQUETA_FUENTE[a.fuente.valor] ?? a.fuente.valor
}

export const ETIQUETA_ESTADO_CLAVE: Record<string, string> = {
  activa: 'activa', solicitada: 'solicitada', sin_clave: 'sin clave', baja: 'de baja',
}

export type Semaforo = { punto: string; texto: string; tono: 'neutral' | 'positivo' | 'negativo' | 'aviso' | 'info' }

const TEXTO_MOTIVO: Record<string, string> = {
  sin_clave: 'sin clave asignada',
  sin_cotejar: 'acuerdo sin cotejar',
  colectivo: 'depende de toda la asociación',
  base_no_calculable: 'base no medible con CIMA',
  valor_fuera_de_lista: 'objetivo con un valor no reconocido',
  siniestralidad: 'exige siniestralidad (CIMA no la da)',
  tramos_ilegibles: 'tramos ilegibles',
  sin_tramos: 'sin tramos estructurados',
  periodo_sin_empezar: 'periodo sin empezar',
  lectura_incompleta: 'lectura de recibos incompleta',
  recibos_sin_atribuir: 'recibos sin clave atribuible',
  importes_ilegibles: 'primas ilegibles',
  pronto_para_proyectar: 'menos de 30 días de periodo',
}

/** El semáforo de un objetivo. `pendiente` es SIEMPRE ⚪ con su motivo: jamás verde. */
export function semaforoObjetivo(e: EstadoObjetivo): Semaforo {
  switch (e.color) {
    case 'pendiente': return { punto: '⚪', texto: `Pendiente: ${TEXTO_MOTIVO[e.motivo] ?? e.motivo}`, tono: 'neutral' }
    case 'alcanzado': return { punto: '🟢', texto: 'Alcanzado', tono: 'positivo' }
    case 'en_camino': return { punto: '🟡', texto: 'En camino', tono: 'aviso' }
    case 'por_debajo': return { punto: '🟠', texto: 'Por debajo del ritmo', tono: 'aviso' }
    case 'no_llega': return { punto: '🔴', texto: 'No llega', tono: 'negativo' }
  }
}

/** Resumen de una compañía para la lista: acuerdos, cuántos sin cotejar, si hay clave. */
export function resumenCompania(codigo: string, r: RespuestaAcuerdos) {
  if (r.estado !== 'ok') return null
  const acuerdos = r.acuerdos.filter((a) => a.companiaCodigoDgs === codigo)
  const claves = r.claves.filter((c) => c.companiaCodigoDgs === codigo)
  return {
    acuerdos,
    claves,
    sinCotejar: acuerdos.filter((a) => a.revisadoAt === null).length,
    sinClave: acuerdos.filter((a) => a.claveId === null).length,
    lineas: acuerdos.reduce((s, a) => s + a.comisiones.length, 0),
  }
}

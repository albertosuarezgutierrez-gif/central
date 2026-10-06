/**
 * «Pendiente de tu firma» (ASegura OS, pieza 2-d-2): el lado del portal.
 *
 * El portal no escribe en la cartera: pide, manda el código y firma por el
 * puente estrecho de asegura (`/api/portal/anulacion`), que resuelve la ficha
 * por `portal_vinculo`, compone la carta y guarda la firma.
 *
 * Las respuestas se interpretan en funciones PURAS (probadas sin red). Lo que
 * no se puede permitir: que un 401 por un secreto mal puesto o un corte se
 * pinte como «firmada» — la persona creería que su póliza se va a anular y
 * nadie lo habría registrado.
 */
import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config.ts'

export type AnulacionPendiente = {
  id: string
  /** Póliza a la que se refiere (la bóveda no ofrece «solicitar baja» donde ya hay una en marcha). */
  polizaId: string | null
  numeroPoliza: string | null
  compania: string | null
  tipo: string
  fechaEfecto: string
  /** `null` = a la carta le falta un dato: no se puede firmar y se dice. */
  carta: string | null
  /** Huella de la carta que se enseña: vuelve al firmar para que no se firme otra distinta. */
  cartaHash: string | null
  /** Hasta cuándo vale el código ya mandado (ISO). Con él la tarjeta abre directamente el campo del código. */
  codigoCaducaEn: string | null
}

/** Una baja ya firmada: se enseña con su estado en vez de desaparecer al recargar. */
export type AnulacionFirmada = {
  id: string
  polizaId: string | null
  numeroPoliza: string | null
  compania: string | null
  tipo: string
  fechaEfecto: string
  estado: 'firmada' | 'comunicada' | 'confirmada'
  firmadaEl: string
  comunicadaEl: string | null
  confirmadaEl: string | null
  /** Consta archivada en su póliza. Ausente (asegura viejo) = false: no se promete. */
  justificante: boolean
}

/** Una baja que el cliente pidió y que revisamos: aún no se puede firmar (se libera a la hora `liberaSolaAt` o antes). */
export type AnulacionEnRevision = {
  id: string
  polizaId: string | null
  numeroPoliza: string | null
  compania: string | null
  /** ISO. */
  liberaSolaAt: string
}

export type LecturaPendientes = { anulaciones: AnulacionPendiente[]; consentimiento: string; firmadas: AnulacionFirmada[]; enRevision: AnulacionEnRevision[] }

export type ResultadoCodigo =
  | { estado: 'codigo_enviado'; email: string; minutos: number }
  | { estado: 'espera'; segundos: number }
  | { estado: 'no_disponible'; motivo: string }
  /** No se sabe si salió (corte, 5xx, puente sin configurar). */
  | { estado: 'error' }

export type ResultadoFirma =
  | { estado: 'firmada'; firmadaEl: string }
  | { estado: 'reintentar'; motivo: string }
  | { estado: 'no_disponible'; motivo: string }
  /** No se sabe si se firmó: que lo mire antes de volver a intentarlo. */
  | { estado: 'error' }

const FECHA = /^\d{4}-\d{2}-\d{2}$/

function obj(j: unknown): Record<string, unknown> {
  return (typeof j === 'object' && j !== null ? j : {}) as Record<string, unknown>
}

/** `null` = no se pudo saber (puente caído): NO es «no tienes nada pendiente». */
export function interpretarPendientes(status: number, j: unknown): LecturaPendientes | null {
  const o = obj(j)
  if (status === 409 && (o.estado === 'sin_ficha' || o.estado === 'varias_fichas')) return { anulaciones: [], consentimiento: '', firmadas: [], enRevision: [] }
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.anulaciones) || typeof o.consentimiento !== 'string') return null
  const anulaciones = o.anulaciones.flatMap((a): AnulacionPendiente[] => {
    const x = obj(a)
    if (typeof x.id !== 'string' || typeof x.tipo !== 'string' || typeof x.fechaEfecto !== 'string' || !FECHA.test(x.fechaEfecto)) return []
    return [{
      id: x.id,
      polizaId: typeof x.polizaId === 'string' ? x.polizaId : null,
      numeroPoliza: typeof x.numeroPoliza === 'string' ? x.numeroPoliza : null,
      compania: typeof x.compania === 'string' ? x.compania : null,
      tipo: x.tipo,
      fechaEfecto: x.fechaEfecto,
      carta: typeof x.carta === 'string' && x.carta.trim() !== '' ? x.carta : null,
      cartaHash: typeof x.cartaHash === 'string' && /^[0-9a-f]{64}$/.test(x.cartaHash) ? x.cartaHash : null,
      codigoCaducaEn: typeof x.codigoCaducaEn === 'string' && !Number.isNaN(Date.parse(x.codigoCaducaEn)) ? x.codigoCaducaEn : null,
    }]
  })
  // Un asegura anterior no manda `firmadas`: entonces no se enseña nada (no se afirma que no haya).
  const firmadas = (Array.isArray(o.firmadas) ? o.firmadas : []).flatMap((a): AnulacionFirmada[] => {
    const x = obj(a)
    const estado = x.estado
    if (typeof x.id !== 'string' || typeof x.tipo !== 'string' || typeof x.fechaEfecto !== 'string' || !FECHA.test(x.fechaEfecto)) return []
    if (typeof x.firmadaEl !== 'string' || !FECHA.test(x.firmadaEl)) return []
    if (estado !== 'firmada' && estado !== 'comunicada' && estado !== 'confirmada') return []
    const fecha = (v: unknown) => (typeof v === 'string' && FECHA.test(v) ? v : null)
    return [{
      id: x.id, tipo: x.tipo, fechaEfecto: x.fechaEfecto, estado, firmadaEl: x.firmadaEl,
      polizaId: typeof x.polizaId === 'string' ? x.polizaId : null,
      numeroPoliza: typeof x.numeroPoliza === 'string' ? x.numeroPoliza : null,
      compania: typeof x.compania === 'string' ? x.compania : null,
      comunicadaEl: fecha(x.comunicadaEl), confirmadaEl: fecha(x.confirmadaEl),
      justificante: x.justificante === true,
    }]
  })
  // Un asegura anterior no manda `enRevision`: entonces no se enseña nada (no se afirma que no haya).
  const enRevision = (Array.isArray(o.enRevision) ? o.enRevision : []).flatMap((a): AnulacionEnRevision[] => {
    const x = obj(a)
    if (typeof x.id !== 'string' || typeof x.liberaSolaAt !== 'string' || Number.isNaN(Date.parse(x.liberaSolaAt))) return []
    return [{
      id: x.id,
      polizaId: typeof x.polizaId === 'string' ? x.polizaId : null,
      numeroPoliza: typeof x.numeroPoliza === 'string' ? x.numeroPoliza : null,
      compania: typeof x.compania === 'string' ? x.compania : null,
      liberaSolaAt: x.liberaSolaAt,
    }]
  })
  return { anulaciones, consentimiento: o.consentimiento, firmadas, enRevision }
}

/** Lo que el cliente marca en «Solicitar baja». El servidor (asegura) valida TODO; aquí solo viaja. */
export type CuerpoSolicitudBaja = {
  polizaId: string
  motivo: 'venta' | 'precio' | 'otro'
  fechaVenta?: string
  motivoTexto?: string
  ofertaPrecioVista?: boolean
  competidor?: string
  precioOfrecido?: string
}

export type ResultadoSolicitudBaja =
  | {
      estado: 'ok'
      id: string
      liberada: boolean
      liberaSolaAt: string | null
      advertencia: string | null
      /** Para el aviso a Alberto (nunca se pinta tal cual al cliente). */
      poliza: { id: string; compania: string | null; numeroPoliza: string | null }
      motivo: string
      motivoTexto: string | null
    }
  /** Antes de la baja por precio tiene que haber visto la opción de mejorar el precio. */
  | { estado: 'ofrecer_presupuesto'; motivo: string }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'no_disponible'; motivo: string }
  /** No se sabe si llegó (corte, 5xx, puente sin configurar): que lo mire antes de repetir. */
  | { estado: 'error' }

export function interpretarSolicitud(status: number, j: unknown): ResultadoSolicitudBaja {
  const o = obj(j)
  const motivo = typeof o.motivo === 'string' && o.motivo.trim() ? o.motivo : null
  if (status === 201 && o.estado === 'creada' && typeof o.id === 'string') {
    const p = obj(o.poliza)
    return {
      estado: 'ok',
      id: o.id,
      liberada: o.liberada === true,
      liberaSolaAt: typeof o.liberaSolaAt === 'string' && !Number.isNaN(Date.parse(o.liberaSolaAt)) ? o.liberaSolaAt : null,
      advertencia: typeof o.advertencia === 'string' ? o.advertencia : null,
      poliza: {
        id: typeof p.id === 'string' ? p.id : '',
        compania: typeof p.compania === 'string' ? p.compania : null,
        numeroPoliza: typeof p.numeroPoliza === 'string' ? p.numeroPoliza : null,
      },
      motivo: typeof o.motivo === 'string' ? o.motivo : '',
      motivoTexto: typeof o.motivoTexto === 'string' ? o.motivoTexto : null,
    }
  }
  if (o.estado === 'ofrecer_presupuesto') return { estado: 'ofrecer_presupuesto', motivo: motivo ?? 'Antes de la baja, déjanos mejorarte el precio.' }
  if (o.estado === 'invalida' || o.estado === 'invalido') return { estado: 'invalido', motivo: motivo ?? 'Revisa lo que has marcado.' }
  if (o.estado === 'ya_abierta') return { estado: 'no_disponible', motivo: 'Esta póliza ya tiene una baja en marcha. Recarga la página.' }
  if (o.estado === 'no_vigente') return { estado: 'no_disponible', motivo: 'Esta póliza ya no está en vigor: no hay nada que dar de baja.' }
  if (o.estado === 'no_es_tuya' || o.estado === 'sin_ficha' || o.estado === 'varias_fichas') {
    return { estado: 'no_disponible', motivo: 'No encontramos esta póliza entre las tuyas. Escríbenos y lo miramos.' }
  }
  return { estado: 'error' }
}

const NO_ENCONTRADA = 'Esta anulación ya no está pendiente de tu firma. Recarga la página.'
const INCOMPLETA = 'A la carta le falta un dato de la póliza. Te llamamos para completarla.'

export function interpretarCodigo(status: number, j: unknown): ResultadoCodigo {
  const o = obj(j)
  if (status === 200 && o.estado === 'codigo_enviado' && typeof o.email === 'string' && typeof o.minutos === 'number') {
    return { estado: 'codigo_enviado', email: o.email, minutos: o.minutos }
  }
  if (o.estado === 'espera' && typeof o.segundos === 'number') return { estado: 'espera', segundos: o.segundos }
  if (o.estado === 'limite_codigos') {
    return { estado: 'no_disponible', motivo: 'Hoy ya te hemos mandado varios códigos. Inténtalo mañana o llámanos y la firmamos contigo.' }
  }
  if (o.estado === 'no_encontrada' || o.estado === 'sin_ficha' || o.estado === 'varias_fichas') return { estado: 'no_disponible', motivo: NO_ENCONTRADA }
  if (o.estado === 'carta_incompleta') return { estado: 'no_disponible', motivo: INCOMPLETA }
  if (o.estado === 'sin_email') {
    return { estado: 'no_disponible', motivo: 'No tenemos un correo tuyo al que mandarte el código. Llámanos y la firmamos contigo.' }
  }
  // `sin_correo_configurado`, `fallo_envio`, 401, corte: el código no ha salido, pero no por algo suyo.
  return { estado: 'error' }
}

export function interpretarFirma(status: number, j: unknown): ResultadoFirma {
  const o = obj(j)
  if (status === 200 && o.estado === 'firmada' && typeof o.firmadaEl === 'string' && FECHA.test(o.firmadaEl)) {
    return { estado: 'firmada', firmadaEl: o.firmadaEl }
  }
  if (o.estado === 'codigo_incorrecto') {
    const quedan = typeof o.quedan === 'number' ? o.quedan : null
    return {
      estado: 'reintentar',
      motivo: quedan === 0 ? 'Código incorrecto. Pide uno nuevo.' : `Código incorrecto.${quedan === null ? '' : ` Te quedan ${quedan} intento${quedan === 1 ? '' : 's'}.`}`,
    }
  }
  if (o.estado === 'nombre_no_coincide') return { estado: 'reintentar', motivo: 'Escribe tu nombre y apellidos tal como figuran en la póliza.' }
  if (o.estado === 'carta_cambiada') return { estado: 'no_disponible', motivo: 'La carta ha cambiado desde que la abriste. Recarga la página y léela de nuevo antes de firmar.' }
  if (o.estado === 'codigo_caducado') return { estado: 'reintentar', motivo: 'El código ha caducado. Pide uno nuevo.' }
  if (o.estado === 'sin_codigo' || o.estado === 'demasiados_intentos') return { estado: 'reintentar', motivo: 'Pide un código nuevo para firmar.' }
  if (o.estado === 'invalido') return { estado: 'reintentar', motivo: 'Revisa el código (6 cifras) y tu nombre.' }
  if (o.estado === 'no_encontrada' || o.estado === 'sin_ficha' || o.estado === 'varias_fichas') return { estado: 'no_disponible', motivo: NO_ENCONTRADA }
  if (o.estado === 'carta_incompleta') return { estado: 'no_disponible', motivo: INCOMPLETA }
  return { estado: 'error' }
}

function puente(): { base: string; secret: string } | null {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return null
  return { base: base.replace(/\/+$/, ''), secret }
}

async function llamar(ruta: string, init: RequestInit): Promise<{ status: number; json: unknown } | null> {
  const p = puente()
  if (!p) return null
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${p.base}${ruta}`, {
      ...init,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${p.secret}` },
      cache: 'no-store',
      signal: control.signal,
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch (e) {
    console.error(`[portal/anulacion] el puente no respondió (${ruta}):`, e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(reloj)
  }
}

export async function anulacionesPendientes(identidadId: string): Promise<LecturaPendientes | null> {
  const r = await llamar(`/api/portal/anulacion?identidadId=${encodeURIComponent(identidadId)}`, { method: 'GET' })
  return r ? interpretarPendientes(r.status, r.json) : null
}

export async function pedirCodigo(identidadId: string, anulacionId: string): Promise<ResultadoCodigo> {
  const r = await llamar('/api/portal/anulacion', { method: 'POST', body: JSON.stringify({ accion: 'codigo', identidadId, anulacionId }) })
  if (!r) return { estado: 'error' }
  const res = interpretarCodigo(r.status, r.json)
  if (res.estado === 'error') console.warn('[portal/anulacion] el código no salió:', r.status, obj(r.json).estado)
  return res
}

export async function firmar(
  identidadId: string,
  anulacionId: string,
  datos: { codigo: string; nombre: string; cartaHash: string; ip: string | null; userAgent: string | null },
): Promise<ResultadoFirma> {
  const r = await llamar('/api/portal/anulacion', {
    method: 'POST',
    body: JSON.stringify({ accion: 'firmar', identidadId, anulacionId, ...datos }),
  })
  if (!r) return { estado: 'error' }
  const res = interpretarFirma(r.status, r.json)
  if (res.estado === 'error') console.warn('[portal/anulacion] respuesta no esperada al firmar:', r.status, obj(r.json).estado)
  return res
}

export async function solicitar(identidadId: string, cuerpo: CuerpoSolicitudBaja): Promise<{ status: number; resultado: ResultadoSolicitudBaja }> {
  const r = await llamar('/api/portal/anulacion/solicitar', { method: 'POST', body: JSON.stringify({ ...cuerpo, identidadId }) })
  if (!r) return { status: 502, resultado: { estado: 'error' } }
  const resultado = interpretarSolicitud(r.status, r.json)
  if (resultado.estado === 'error') console.warn('[portal/anulacion] respuesta no esperada al solicitar baja:', r.status, obj(r.json).estado)
  return { status: r.status, resultado }
}

/**
 * «Aceptar opción» (ASegura OS): el cliente elige una opción de su presupuesto
 * y la FIRMA con un código a su correo.
 *
 * El portal no escribe en la cartera: pide, manda el código y firma por el
 * puente estrecho de asegura (`/api/portal/presupuesto`), que resuelve la ficha
 * por `portal_vinculo`, prepara el consentimiento y guarda la aceptación.
 *
 * Las respuestas se interpretan en funciones PURAS (probadas sin red). Lo que
 * no se puede permitir: que un 401 por un secreto mal puesto o un corte se
 * pinte como «aceptada» — la persona creería que su póliza se va a emitir y
 * nadie lo habría registrado.
 */
import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config.ts'

export type ResultadoCodigo =
  | { estado: 'codigo_enviado'; email: string; minutos: number }
  | { estado: 'espera'; segundos: number }
  | { estado: 'no_disponible'; motivo: string }
  /** No se sabe si salió (corte, 5xx, puente sin configurar). */
  | { estado: 'error' }

export type ResultadoFirma =
  /** `aviso`: el texto que compone asegura para Telegram (a Alberto). `null` si no vino. */
  | { estado: 'aceptado'; aceptadoEl: string; aviso: string | null }
  | { estado: 'reintentar'; motivo: string }
  | { estado: 'no_disponible'; motivo: string }
  /** No se sabe si se firmó: que lo mire antes de volver a intentarlo. */
  | { estado: 'error' }

const FECHA = /^\d{4}-\d{2}-\d{2}$/

function obj(j: unknown): Record<string, unknown> {
  return (typeof j === 'object' && j !== null ? j : {}) as Record<string, unknown>
}

const NO_ENCONTRADO = 'Este presupuesto ya no está disponible. Recarga la página.'
const NO_ADMITE = 'Esta opción no se puede aceptar. Escríbeme y te la preparo otra.'

export function interpretarCodigo(status: number, j: unknown): ResultadoCodigo {
  const o = obj(j)
  if (status === 200 && o.estado === 'codigo_enviado' && typeof o.email === 'string' && typeof o.minutos === 'number') {
    return { estado: 'codigo_enviado', email: o.email, minutos: o.minutos }
  }
  if (o.estado === 'espera' && typeof o.segundos === 'number') return { estado: 'espera', segundos: o.segundos }
  if (o.estado === 'limite_codigos') {
    return { estado: 'no_disponible', motivo: 'Hoy ya te hemos mandado varios códigos. Inténtalo mañana o llámanos y lo tramitamos contigo.' }
  }
  if (o.estado === 'no_encontrado' || o.estado === 'sin_ficha' || o.estado === 'varias_fichas') return { estado: 'no_disponible', motivo: NO_ENCONTRADO }
  if (o.estado === 'no_admite') {
    return { estado: 'no_disponible', motivo: typeof o.motivo === 'string' ? o.motivo : NO_ADMITE }
  }
  if (o.estado === 'sin_email') {
    return { estado: 'no_disponible', motivo: 'No tenemos un correo tuyo al que mandarte el código. Llámanos y lo tramitamos contigo.' }
  }
  // `sin_correo_configurado`, `fallo_envio`, 401, corte: el código no ha salido, pero no por algo suyo.
  return { estado: 'error' }
}

export function interpretarFirma(status: number, j: unknown): ResultadoFirma {
  const o = obj(j)
  if (status === 200 && o.estado === 'aceptado' && typeof o.aceptadoEl === 'string' && FECHA.test(o.aceptadoEl)) {
    return { estado: 'aceptado', aceptadoEl: o.aceptadoEl, aviso: typeof o.aviso === 'string' && o.aviso.trim() ? o.aviso : null }
  }
  if (o.estado === 'codigo_incorrecto') {
    const quedan = typeof o.quedan === 'number' ? o.quedan : null
    return {
      estado: 'reintentar',
      motivo: quedan === 0 ? 'Código incorrecto. Pide uno nuevo.' : `Código incorrecto.${quedan === null ? '' : ` Te quedan ${quedan} intento${quedan === 1 ? '' : 's'}.`}`,
    }
  }
  if (o.estado === 'nombre_no_coincide') return { estado: 'reintentar', motivo: 'Escribe tu nombre y apellidos tal como figuran en el documento.' }
  if (o.estado === 'documento_cambiado') return { estado: 'no_disponible', motivo: 'El documento ha cambiado desde que lo abriste. Recarga la página y léelo de nuevo antes de firmar.' }
  if (o.estado === 'codigo_caducado') return { estado: 'reintentar', motivo: 'El código ha caducado. Pide uno nuevo.' }
  if (o.estado === 'sin_codigo' || o.estado === 'demasiados_intentos') return { estado: 'reintentar', motivo: 'Pide un código nuevo para firmar.' }
  if (o.estado === 'invalido') return { estado: 'reintentar', motivo: 'Revisa el código (6 cifras) y tu nombre.' }
  if (o.estado === 'no_encontrado' || o.estado === 'sin_ficha' || o.estado === 'varias_fichas') return { estado: 'no_disponible', motivo: NO_ENCONTRADO }
  if (o.estado === 'no_admite') {
    return { estado: 'no_disponible', motivo: typeof o.motivo === 'string' ? o.motivo : NO_ADMITE }
  }
  if (o.estado === 'sin_precio') return { estado: 'no_disponible', motivo: 'La opción no tiene precio. Escríbeme para revisarla.' }
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
    console.error(`[portal/presupuesto] el puente no respondió (${ruta}):`, e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(reloj)
  }
}

export type PreparadoAceptacion = {
  estado: 'ok'
  consentimiento: string
  documento: string
  documentoHash: string
  anulacion: { compania: string; numeroPoliza: string; fechaEfecto: string; carta: string; advertencia: string | null } | null
  sinAnulacion: string | null
} | {
  estado: 'no_encontrado' | 'no_admite' | 'sin_precio' | 'sin_ficha' | 'varias_fichas' | 'error'
  motivo?: string
}

export function interpretarPreparar(status: number, j: unknown): PreparadoAceptacion | null {
  const o = obj(j)
  if (status === 200 && o.estado === 'ok') {
    if (typeof o.consentimiento !== 'string' || typeof o.documento !== 'string' || !o.documento.trim()
      || typeof o.documentoHash !== 'string' || !/^[0-9a-f]{64}$/.test(o.documentoHash)) return null
    let anulacion: Extract<PreparadoAceptacion, { estado: 'ok' }>['anulacion'] = null
    if (o.anulacion !== null && o.anulacion !== undefined) {
      const a = obj(o.anulacion)
      // Una carta a medias no se enseña para firmar: la huella la cubre y lo firmado tiene que ser lo leído.
      if (typeof a.compania !== 'string' || typeof a.numeroPoliza !== 'string' || typeof a.carta !== 'string' || !a.carta.trim()
        || typeof a.fechaEfecto !== 'string' || !FECHA.test(a.fechaEfecto)) return null
      anulacion = { compania: a.compania, numeroPoliza: a.numeroPoliza, fechaEfecto: a.fechaEfecto, carta: a.carta,
        advertencia: typeof a.advertencia === 'string' ? a.advertencia : null }
    }
    return { estado: 'ok', consentimiento: o.consentimiento, documento: o.documento, documentoHash: o.documentoHash, anulacion,
      sinAnulacion: typeof o.sinAnulacion === 'string' ? o.sinAnulacion : null }
  }
  if (o.estado === 'no_encontrado' || o.estado === 'sin_ficha' || o.estado === 'varias_fichas' || o.estado === 'no_admite' || o.estado === 'sin_precio') {
    return { estado: o.estado, motivo: typeof o.motivo === 'string' ? o.motivo : undefined }
  }
  // 401, 5xx, corte o forma rara: no se ha podido leer.
  return null
}

export async function prepararAceptacion(identidadId: string, presupuestoId: string, opcionId: string): Promise<PreparadoAceptacion | null> {
  const r = await llamar('/api/portal/presupuesto', { method: 'POST', body: JSON.stringify({ accion: 'preparar', identidadId, presupuestoId, opcionId }) })
  return r ? interpretarPreparar(r.status, r.json) : null
}

export async function pedirCodigoAceptacion(identidadId: string, presupuestoId: string, opcionId: string): Promise<ResultadoCodigo> {
  const r = await llamar('/api/portal/presupuesto', { method: 'POST', body: JSON.stringify({ accion: 'codigo', identidadId, presupuestoId, opcionId }) })
  if (!r) return { estado: 'error' }
  const res = interpretarCodigo(r.status, r.json)
  if (res.estado === 'error') console.warn('[portal/presupuesto] el código no salió:', r.status, obj(r.json).estado)
  return res
}

export async function firmarAceptacion(
  identidadId: string,
  presupuestoId: string,
  opcionId: string,
  datos: { codigo: string; nombre: string; documentoHash: string; ip: string | null; userAgent: string | null },
): Promise<ResultadoFirma> {
  const r = await llamar('/api/portal/presupuesto', {
    method: 'POST',
    body: JSON.stringify({ accion: 'firmar', identidadId, presupuestoId, opcionId, ...datos }),
  })
  if (!r) return { estado: 'error' }
  const res = interpretarFirma(r.status, r.json)
  if (res.estado === 'error') console.warn('[portal/presupuesto] respuesta no esperada al firmar:', r.status, obj(r.json).estado)
  return res
}

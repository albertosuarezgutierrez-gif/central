/**
 * El enlace «completa tus datos para el presupuesto» (24/09/2026), lado portal.
 * Por TOKEN y sin identidad (decisión de Alberto): la página no enseña nada del
 * cliente, solo pide. El portal no escribe en la cartera: lo manda por el puente.
 */
import type { CampoSolicitud, RamoSolicitud } from '@central/module-seguros'
import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config.ts'

export type SolicitudLeida =
  | { estado: 'ok'; ramo: RamoSolicitud; campos: CampoSolicitud[] }
  | { estado: 'muerta' }
  | { estado: 'completada' }
  | { estado: 'error' }

/** Lo que devuelve el puente. Una forma rara es `error` (no «muerta»: no se sabe). */
export function interpretarSolicitud(status: number, json: unknown): SolicitudLeida {
  const o = json !== null && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null
  if (status !== 200 || !o) return { estado: 'error' }
  if (o.estado === 'muerta') return { estado: 'muerta' }
  if (o.estado === 'completada') return { estado: 'completada' }
  if (o.estado === 'ok' && (o.ramo === 'moto' || o.ramo === 'auto') && Array.isArray(o.campos)) {
    const campos = o.campos.filter(
      (c): c is CampoSolicitud =>
        c !== null && typeof c === 'object' && typeof (c as CampoSolicitud).clave === 'string' && typeof (c as CampoSolicitud).etiqueta === 'string',
    )
    if (campos.length > 0) return { estado: 'ok', ramo: o.ramo, campos }
  }
  return { estado: 'error' }
}

function puente(): { base: string; secret: string } | null {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return null
  return { base: base.replace(/\/+$/, ''), secret }
}

export async function llamarPuenteSolicitud(init: { metodo: 'GET'; token: string } | { metodo: 'POST'; token: string; respuestas: unknown }): Promise<{ status: number; json: unknown } | null> {
  const p = puente()
  if (!p) return null
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const url = init.metodo === 'GET'
      ? `${p.base}/api/portal/solicitud-datos?token=${encodeURIComponent(init.token)}`
      : `${p.base}/api/portal/solicitud-datos`
    const res = await fetch(url, {
      method: init.metodo,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${p.secret}` },
      body: init.metodo === 'POST' ? JSON.stringify({ token: init.token, respuestas: init.respuestas }) : undefined,
      cache: 'no-store',
      signal: control.signal,
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch (e) {
    console.error('[portal/solicitud-datos] el puente no respondió:', e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(reloj)
  }
}

export async function leerSolicitud(token: string): Promise<SolicitudLeida> {
  const r = await llamarPuenteSolicitud({ metodo: 'GET', token })
  return r ? interpretarSolicitud(r.status, r.json) : { estado: 'error' }
}

// ─── Documentos que sube el cliente (24/09/2026) ─────────────────────────────

export type DocSubido =
  | { estado: 'ok'; etiqueta: string; valores: Record<string, string | boolean>; aviso: string | null }
  | { estado: 'fallo'; texto: string }

/** Lo que devuelve la subida. Solo se proponen valores de texto/sí-no: lo demás se ignora. */
export function interpretarDocSubido(status: number, json: unknown): DocSubido {
  const o = json !== null && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null
  if (status === 200 && o?.ok === true) {
    const valores: Record<string, string | boolean> = {}
    const v = o.valores && typeof o.valores === 'object' && !Array.isArray(o.valores) ? (o.valores as Record<string, unknown>) : {}
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === 'string' || typeof x === 'boolean') valores[k] = x
      else if (typeof x === 'number' && Number.isFinite(x)) valores[k] = String(x)
    }
    return {
      estado: 'ok',
      etiqueta: typeof o.etiqueta === 'string' ? o.etiqueta : 'Documento',
      valores,
      aviso: typeof o.aviso === 'string' ? o.aviso : null,
    }
  }
  const motivo = typeof o?.motivo === 'string' ? o.motivo : null
  if (status === 410) return { estado: 'fallo', texto: 'Este enlace ya no sirve (caducado o ya usado).' }
  if (status === 409) return { estado: 'fallo', texto: motivo ?? 'Ya has subido el máximo de documentos.' }
  if (status === 413 || status === 415 || status === 400) return { estado: 'fallo', texto: motivo ?? 'Ese fichero no vale: sube una foto o un PDF.' }
  if (status === 429) return { estado: 'fallo', texto: 'Demasiados intentos. Espera unos minutos.' }
  if (status === 403 && typeof o?.mensaje === 'string') return { estado: 'fallo', texto: o.mensaje }
  return { estado: 'fallo', texto: 'No se ha podido subir. Vuelve a probar en un momento.' }
}

/** Reenvía el fichero al puente de asegura (multipart). `null` = el puente no respondió. */
export async function subirDocPuente(token: string, fichero: File): Promise<{ status: number; json: unknown } | null> {
  const p = puente()
  if (!p) return null
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), 55_000)
  try {
    const form = new FormData()
    form.set('token', token)
    form.set('documento', fichero, fichero.name || 'documento')
    const res = await fetch(`${p.base}/api/portal/solicitud-datos/documento`, {
      method: 'POST',
      headers: { authorization: `Bearer ${p.secret}` },
      body: form,
      cache: 'no-store',
      signal: control.signal,
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch (e) {
    console.error('[portal/solicitud-datos] subida al puente falló:', e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(reloj)
  }
}

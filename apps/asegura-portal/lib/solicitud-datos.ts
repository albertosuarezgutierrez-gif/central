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

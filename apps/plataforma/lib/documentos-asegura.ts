// Documentos de la correduría, leídos y escritos por el puerto de asegura
// (`/api/operador/documentos`). La pantalla es esta (plataforma); los ficheros
// viven en `seguros.documentos` y los sirve asegura de uno en uno.
//
// Lo PURO (interpretar respuestas) está separado de la red y tiene test en
// test/regression-documentos-asegura.test.ts. Regla de siempre: `null` = no se
// pudo mirar, `[]` = se miró y no hay.

import {
  estadoDocumento,
  tipoDocumento,
  type DocumentoResumen,
  type TipoDocumento,
} from '@central/module-seguros'

export type Documentos =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }
  | { estado: 'ok'; documentos: DocumentoResumen[] }

export function leerDocumento(v: unknown): DocumentoResumen | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.creado !== 'string') return null
  const sub = o.subidoPor
  return {
    id: o.id,
    tipo: tipoDocumento(o.tipo),
    estado: estadoDocumento(o.estado),
    nombre: cadena(o.nombre),
    mime: cadena(o.mime),
    bytes: entero(o.bytes),
    sha256: cadena(o.sha256),
    notas: cadena(o.notas),
    subidoPor: sub === 'cliente' || sub === 'agente' ? sub : 'corredor',
    clienteId: cadena(o.clienteId),
    polizaId: cadena(o.polizaId),
    siniestroId: cadena(o.siniestroId),
    creado: o.creado,
    revisadoEn: cadena(o.revisadoEn),
  }
}

/** Lista del puerto → lista tipada. `null` si no es una lista (NO `[]`). */
export function leerDocumentos(v: unknown): DocumentoResumen[] | null {
  if (!Array.isArray(v)) return null
  return v.map(leerDocumento).filter((d): d is DocumentoResumen => d !== null)
}

export function interpretarDocumentos(status: number, json: unknown): Documentos {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (typeof json !== 'object' || json === null) return { estado: 'error', motivo: `HTTP ${status}` }
  const o = json as Record<string, unknown>
  if (o.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (o.estado !== 'ok') return { estado: 'error', motivo: cadena(o.motivo) ?? 'asegura_error' }
  const documentos = leerDocumentos(o.documentos)
  if (documentos === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
  return { estado: 'ok', documentos }
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}
function entero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null
}

// ─── Red ─────────────────────────────────────────────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

function cabeceras(): Record<string, string> | null {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  return secret ? { Authorization: `Bearer ${secret}` } : null
}

export type Destino = { clienteId?: string | null; polizaId?: string | null; siniestroId?: string | null }

function query(d: Destino): string {
  const q = new URLSearchParams()
  if (d.clienteId) q.set('clienteId', d.clienteId)
  if (d.polizaId) q.set('polizaId', d.polizaId)
  if (d.siniestroId) q.set('siniestroId', d.siniestroId)
  return q.toString()
}

export async function documentosAsegura(d: Destino): Promise<Documentos> {
  const h = cabeceras()
  if (!h) return { estado: 'sin_configurar' }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/documentos?${query(d)}`, {
      headers: h,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    return interpretarDocumentos(res.status, await res.json().catch(() => null))
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}

/** Reenvía el formulario (fichero + destino + tipo + notas) tal cual a asegura. */
export async function subirDocumentoAsegura(form: FormData): Promise<{ status: number; json: unknown }> {
  const h = cabeceras()
  if (!h) return { status: 503, json: { estado: 'sin_configurar' } }
  const res = await fetch(`${urlAsegura()}/api/operador/documentos`, {
    method: 'POST',
    headers: h,
    body: form,
    signal: AbortSignal.timeout(60_000),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

export async function pedirDocumentoAsegura(
  d: Destino & { tipo: TipoDocumento; notas?: string | null },
): Promise<{ status: number; json: unknown }> {
  const h = cabeceras()
  if (!h) return { status: 503, json: { estado: 'sin_configurar' } }
  const res = await fetch(`${urlAsegura()}/api/operador/documentos`, {
    method: 'POST',
    headers: { ...h, 'content-type': 'application/json' },
    body: JSON.stringify({ pedir: true, ...d }),
    signal: AbortSignal.timeout(15_000),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

export async function revisarDocumentoAsegura(id: string, por: string): Promise<{ status: number; json: unknown }> {
  const h = cabeceras()
  if (!h) return { status: 503, json: { estado: 'sin_configurar' } }
  const res = await fetch(`${urlAsegura()}/api/operador/documentos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...h, 'content-type': 'application/json' },
    body: JSON.stringify({ accion: 'revisar', por }),
    signal: AbortSignal.timeout(15_000),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

export async function borrarDocumentoAsegura(id: string): Promise<{ status: number; json: unknown }> {
  const h = cabeceras()
  if (!h) return { status: 503, json: { estado: 'sin_configurar' } }
  const res = await fetch(`${urlAsegura()}/api/operador/documentos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: h,
    signal: AbortSignal.timeout(15_000),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

/** El fichero, en streaming, tal cual lo sirve asegura. `null` si no hay secreto. */
export async function descargarDocumentoAsegura(id: string): Promise<Response | null> {
  const h = cabeceras()
  if (!h) return null
  return fetch(`${urlAsegura()}/api/operador/documentos/${encodeURIComponent(id)}`, {
    headers: h,
    cache: 'no-store',
    signal: AbortSignal.timeout(60_000),
  })
}

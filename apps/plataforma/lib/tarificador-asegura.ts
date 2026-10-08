// «Precio Allianz (bot)» — la RED (solo servidor, 06/10/2026). Reutiliza el puente de siempre hacia el
// puerto de operador de asegura: mismo `ASEGURA_URL` / `ASEGURA_OPERADOR_SECRET` y mismas cabeceras
// (`cabecerasPuerto`: Bearer + x-actor). El secreto NO sale de aquí: el navegador habla con las rutas
// `/api/correduria/tarificador/*` de plataforma, que exigen la sesión.
import { cabecerasPuerto } from './puerto-actor.ts'
import { COMPANIA_BOT } from './tarificador-asegura-reglas.ts'

type Reenvio = { status: number; json: unknown }

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export async function puerto(ruta: string, init: RequestInit, topeMs = 30_000): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/tarificador/${ruta}`, {
      ...init,
      headers: { ...(init.headers ?? {}), ...(await cabecerasPuerto(secret)) },
      cache: 'no-store',
      signal: AbortSignal.timeout(topeMs),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

/** Encola una cotización de COMUNIDAD en Allianz (solo precio; nunca emite). 202 `{trabajoId}`. */
export function encolarTarificacionComunidad(clienteId: string, oportunidadId: string | null, riesgo: Record<string, unknown>): Promise<Reenvio> {
  return puerto('encolar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clienteId, oportunidadId, compania: COMPANIA_BOT, ramo: 'comunidades', riesgo }),
  })
}

/** Riesgo del último trabajo del cliente (pre-relleno del modal). 200 `{ riesgo|null, trabajoId, creadoEn }`. */
export function leerUltimoRiesgoTarificador(clienteId: string): Promise<Reenvio> {
  const q = new URLSearchParams({ cliente_id: clienteId, compania: COMPANIA_BOT, ramo: 'comunidades' })
  return puerto(`ultimo-riesgo?${q}`, { method: 'GET' }, 15_000)
}

/** Panel de salud del bot, renovaciones de comunidades y alertas de cambio de tarifa (solo lectura). */
export function leerPanelTarificador(): Promise<Reenvio> {
  return puerto('panel', { method: 'GET' }, 30_000)
}

/** «Presupuestos de compañías» de una oportunidad: formulario guardado, pre-relleno y trabajos (solo lectura). */
export function leerPresupuestosOportunidad(oportunidadId: string): Promise<Reenvio> {
  return puerto(`oportunidad?${new URLSearchParams({ id: oportunidadId })}`, { method: 'GET' }, 15_000)
}

/**
 * Pide presupuesto a las compañías elegidas desde la oportunidad: asegura valida el formulario común con
 * cada capacidad (todo o nada), lo guarda en la oportunidad y encola un trabajo por compañía. Solo precio.
 */
export function pedirPresupuestosOportunidad(body: {
  oportunidadId: string; ramo: string; formulario: unknown; extras: Record<string, unknown>; companias: string[]
}): Promise<Reenvio> {
  return puerto('oportunidad', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, 50_000)
}

export function leerTrabajoTarificador(id: string): Promise<Reenvio> {
  return puerto(`trabajo/${encodeURIComponent(id)}`, { method: 'GET' }, 15_000)
}

/** El PDF de una oferta (streaming). `null` = sin secreto configurado. */
export async function descargarPdfTarificador(id: string, indice: number): Promise<Response | null> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return null
  return fetch(`${urlAsegura()}/api/operador/tarificador/trabajo/${encodeURIComponent(id)}/pdf/${indice}`, {
    headers: await cabecerasPuerto(secret),
    cache: 'no-store',
    signal: AbortSignal.timeout(50_000),
  })
}

/** Recomendación de una oportunidad (ranking, motivos, calidad) en JSON. Solo lectura; no envía nada. */
export function leerPropuestaOportunidad(oportunidadId: string): Promise<Reenvio> {
  return puerto(`oportunidad/${encodeURIComponent(oportunidadId)}/propuesta?formato=json`, { method: 'GET' }, 50_000)
}

/** La propuesta comercial en PDF (streaming). `null` = sin secreto configurado. Solo DESCARGA: nunca se envía. */
export async function descargarPropuestaOportunidad(oportunidadId: string): Promise<Response | null> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return null
  return fetch(`${urlAsegura()}/api/operador/tarificador/oportunidad/${encodeURIComponent(oportunidadId)}/propuesta`, {
    headers: await cabecerasPuerto(secret),
    cache: 'no-store',
    signal: AbortSignal.timeout(55_000),
  })
}

/** Bandeja «Necesita tu atención»: trabajos del bot que esperan a una persona (solo lectura). */
export function leerBandejaTarificador(limite: number, desde: number): Promise<Reenvio> {
  return puerto(`bandeja?${new URLSearchParams({ limite: String(limite), desde: String(desde) })}`, { method: 'GET' }, 15_000)
}

/** Reintentar (→ pendiente) o cancelar un trabajo de la bandeja. Solo precio: nunca emite. */
export function resolverTrabajoBandeja(id: string, accion: 'reintentar' | 'cancelar'): Promise<Reenvio> {
  return puerto(`bandeja/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accion }),
  }, 30_000)
}

/** Traza de un trabajo (pasos con duración y error) y versión del bot. */
export function leerTrazaTarificador(id: string): Promise<Reenvio> {
  return puerto(`trabajo/${encodeURIComponent(id)}/traza`, { method: 'GET' }, 15_000)
}

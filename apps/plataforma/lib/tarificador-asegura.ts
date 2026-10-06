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

async function puerto(ruta: string, init: RequestInit, topeMs = 30_000): Promise<Reenvio> {
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

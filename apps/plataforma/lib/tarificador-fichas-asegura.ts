// Fichas de producto del tarificador — la RED (solo servidor, 07/10/2026). Mismo puente que
// `tarificador-asegura.ts` (ASEGURA_URL / ASEGURA_OPERADOR_SECRET, `cabecerasPuerto`: Bearer + x-actor), en
// fichero aparte para no pisar a quien edita aquel. El secreto NO sale de aquí: el navegador habla con
// `/api/correduria/tarificador/{fichas,coberturas}`, que exigen la sesión de la correduría.
import { cabecerasPuerto } from './puerto-actor.ts'

export type Reenvio = { status: number; json: unknown }

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

async function puerto(ruta: string, init: RequestInit, topeMs: number): Promise<Reenvio> {
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

export function listarFichasTarificador(q: URLSearchParams): Promise<Reenvio> {
  return puerto(`fichas?${q}`, { method: 'GET' }, 20_000)
}

export function leerFichaTarificador(id: string): Promise<Reenvio> {
  return puerto(`fichas/${encodeURIComponent(id)}`, { method: 'GET' }, 20_000)
}

export function cambiarFichaTarificador(id: string, cuerpo: Record<string, unknown>): Promise<Reenvio> {
  return puerto(`fichas/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
  }, 20_000)
}

export function listarTarificacionesConPdf(limite: number): Promise<Reenvio> {
  return puerto(`coberturas?limite=${limite}`, { method: 'GET' }, 20_000)
}

/** «Extraer coberturas»: PDF + IA en asegura (hasta ~2 min). */
export function extraerCoberturasTarificador(tarificacionId: string): Promise<Reenvio> {
  return puerto('coberturas', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tarificacionId }),
  }, 130_000)
}

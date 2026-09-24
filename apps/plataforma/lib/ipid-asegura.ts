// Fichas IPID (documento de información del producto) en la pantalla de la correduría.
//
//   1. Lo PURO (lectura del puerto) lo importa el client component y lo prueba
//      `test/regression-ipid-asegura.test.ts`.
//   2. La RED, solo desde la ruta API. Esta app no toca `seguros`: reenvía al puerto de asegura.
import { cabecerasPuerto } from './puerto-actor.ts'

export type FichaIpid = {
  id: string
  compania: string
  producto: string
  nombreFichero: string
  sha256: string
  bytes: number
  subidoPor: string
  createdAt: string
}

export type LecturaIpid =
  | { estado: 'ok'; fichas: FichaIpid[] }
  | { estado: 'sin_configurar' }
  | { estado: 'no_desplegado' }
  | { estado: 'error'; motivo: string }

const txt = (v: unknown): v is string => typeof v === 'string' && v !== ''

function ficha(v: unknown): FichaIpid | null {
  const o = (v ?? {}) as Record<string, unknown>
  if (!txt(o.id) || !txt(o.compania) || !txt(o.producto) || !txt(o.nombreFichero) || !txt(o.sha256) || !txt(o.subidoPor) || !txt(o.createdAt)) return null
  if (typeof o.bytes !== 'number' || !Number.isFinite(o.bytes)) return null
  return { id: o.id, compania: o.compania, producto: o.producto, nombreFichero: o.nombreFichero, sha256: o.sha256, bytes: o.bytes, subidoPor: o.subidoPor, createdAt: o.createdAt }
}

/** Una ficha ilegible tumba la lista: una lista a medias diría que falta un IPID que sí está. */
export function interpretarIpid(status: number, json: unknown): LecturaIpid {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404) return { estado: 'no_desplegado' }
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.ipid)) return { estado: 'error', motivo: String(o.causa ?? o.motivo ?? `HTTP ${status}`) }
  const fichas = o.ipid.map(ficha)
  if (fichas.some((f) => f === null)) return { estado: 'error', motivo: 'respuesta_ilegible' }
  return { estado: 'ok', fichas: fichas as FichaIpid[] }
}

// ─── Red (solo desde la ruta API) ────────────────────────────────────────────

export type Reenvio = { status: number; json: unknown }

function base(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

async function llamar(path: string, init: RequestInit, esJson: boolean): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${base()}${path}`, {
      ...init,
      headers: { ...(await cabecerasPuerto(secret)), ...(esJson ? { 'content-type': 'application/json' } : {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

export function listarIpidAsegura(): Promise<Reenvio> {
  return llamar('/api/operador/ipid', { method: 'GET' }, false)
}

export function subirIpidAsegura(form: FormData): Promise<Reenvio> {
  return llamar('/api/operador/ipid', { method: 'POST', body: form }, false)
}

export function retirarIpidAsegura(id: string): Promise<Reenvio> {
  return llamar(`/api/operador/ipid?id=${encodeURIComponent(id)}`, { method: 'DELETE' }, false)
}

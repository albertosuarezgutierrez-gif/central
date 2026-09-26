// Ficha ↔ CIMA en la pantalla de la correduría (25/09/2026).
//
//   1. Lo PURO (lectura del puerto, contador) lo importa el client component y lo
//      prueba `lib/cima-sincro-asegura.test.ts`.
//   2. La RED, solo desde la ruta API y el cron. Esta app no toca `seguros`:
//      reenvía al puerto de asegura (`/api/operador/cima-sincro`).
import { CAMPOS_CIMA, type CampoCima } from '@central/module-seguros'
import { cabecerasPuerto } from './puerto-actor.ts'

/** `aviso`: por qué algo que iba solo pregunta (el teléfono ya está en otra ficha). */
export type DiferenciaCimaVista = { campo: CampoCima; accion: 'discrepa'; ficha: string | null; cima: string; aviso: string | null }
export type FichaConDiferencias = { clienteId: string; nombre: string; poliza: string | null; diferencias: DiferenciaCimaVista[] }

export type LecturaSincroCima =
  | { estado: 'ok'; fichas: number; sinDatosCima: number; rellenos: number; ilegibles: number; discrepancias: FichaConDiferencias[] }
  | { estado: 'sin_configurar' }
  | { estado: 'no_desplegado' }
  | { estado: 'error'; motivo: string }

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const txt = (v: unknown): v is string => typeof v === 'string'

function diferencia(v: unknown): DiferenciaCimaVista | null {
  const o = (v ?? {}) as Record<string, unknown>
  if (!(CAMPOS_CIMA as readonly unknown[]).includes(o.campo) || o.accion !== 'discrepa' || !txt(o.cima)) return null
  return { campo: o.campo as CampoCima, accion: 'discrepa', ficha: txt(o.ficha) ? o.ficha : null, cima: o.cima, aviso: txt(o.aviso) && o.aviso.trim() ? o.aviso : null }
}

function ficha(v: unknown): FichaConDiferencias | null {
  const o = (v ?? {}) as Record<string, unknown>
  if (!txt(o.clienteId) || !txt(o.nombre) || !Array.isArray(o.diferencias)) return null
  const ds = o.diferencias.map(diferencia)
  if (ds.some((d) => d === null)) return null
  return { clienteId: o.clienteId, nombre: o.nombre, poliza: txt(o.poliza) ? o.poliza : null, diferencias: ds as DiferenciaCimaVista[] }
}

/** Una fila que no se entiende tumba la lectura: una lista con una ficha de menos diría que ahí no hay nada. */
export function interpretarSincroCima(status: number, json: unknown): LecturaSincroCima {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404) return { estado: 'no_desplegado' }
  if (status !== 200 || o.estado !== 'ok') return { estado: 'error', motivo: String(o.causa ?? o.motivo ?? `HTTP ${status}`) }
  if (!num(o.fichas) || !num(o.sinDatosCima) || !num(o.rellenos) || !num(o.ilegibles) || !Array.isArray(o.discrepancias)) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  const fs = o.discrepancias.map(ficha)
  if (fs.some((f) => f === null)) return { estado: 'error', motivo: 'respuesta_ilegible' }
  return { estado: 'ok', fichas: o.fichas, sinDatosCima: o.sinDatosCima, rellenos: o.rellenos, ilegibles: o.ilegibles, discrepancias: fs as FichaConDiferencias[] }
}

/** Diferencias por decidir. `null` = no se pudo leer (nunca 0). */
export function contadorSincroCima(l: LecturaSincroCima): number | null {
  return l.estado === 'ok' ? l.discrepancias.reduce((n, f) => n + f.diferencias.length, 0) : null
}

// ─── Red (solo desde la ruta API y el cron) ──────────────────────────────────

export type Reenvio = { status: number; json: unknown }

async function llamar(init: RequestInit, timeoutMs: number): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  const base = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/api/operador/cima-sincro`, {
      ...init,
      headers: { ...(await cabecerasPuerto(secret)), ...(init.body ? { 'content-type': 'application/json' } : {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

export function sincroCimaAsegura(): Promise<Reenvio> {
  return llamar({ method: 'GET' }, 60_000)
}

export function accionSincroCimaAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar({ method: 'POST', body: JSON.stringify(body) }, 280_000)
}

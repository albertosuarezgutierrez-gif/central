// Aviso de VERIFICACIÓN HUMANA del tarificador (08/10/2026): plataforma lee de asegura los trabajos que acabaron
// `requiere_humano` por una verificación (SMS/OTP) y avisa a Alberto por Telegram UNA vez por trabajo.
//
// Dos partes, como el seguimiento de presupuestos: lo PURO (`interpretarVerificaciones`, `componerAvisoVerificacion`,
// con test) y la RED (solo desde la ruta del cron). Asegura decide qué toca avisar y guarda la marca idempotente
// (`POST …/avisos-verificacion`); aquí solo se manda y, SOLO si el Telegram salió, se marca.
//
// 🚨 Sin datos personales en el mensaje: compañía y ramo. Nunca cliente, dirección, riesgo ni mensaje del portal.
// 🚨 Un fallo del puerto NO es «no hay pendientes».
import { cabecerasPuerto } from './puerto-actor.ts'

export type VerificacionPendiente = { trabajoId: string; compania: string; ramo: string }

export type RespuestaVerificaciones =
  | { estado: 'ok'; pendientes: VerificacionPendiente[]; ilegibles: number }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; causa: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const cadena = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** PURO. La respuesta del puerto → pendientes, o un error CON causa. Una fila rara no desaparece: se cuenta. */
export function interpretarVerificaciones(status: number, json: unknown): RespuestaVerificaciones {
  if (status === 401 || status === 403) return { estado: 'error', causa: 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET)' }
  if (status === 404) return { estado: 'error', causa: 'asegura aún no tiene /api/operador/tarificador/avisos-verificacion desplegado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (o.estado === 'error') return { estado: 'error', causa: cadena(o.causa) ?? cadena(o.mensaje) ?? `HTTP ${status}` }
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.pendientes)) return { estado: 'error', causa: `respuesta ilegible (HTTP ${status})` }
  const pendientes: VerificacionPendiente[] = []
  let ilegibles = 0
  for (const f of o.pendientes) {
    const r = (typeof f === 'object' && f !== null ? f : {}) as Record<string, unknown>
    const trabajoId = cadena(r.trabajoId)
    const compania = cadena(r.compania)
    // Sin id válido no se puede marcar (y se repetiría cada pasada); sin compañía no se sabe a qué portal ir.
    if (trabajoId === null || !UUID.test(trabajoId) || compania === null) { ilegibles++; continue }
    pendientes.push({ trabajoId, compania, ramo: cadena(r.ramo) ?? '' })
  }
  return { estado: 'ok', pendientes, ilegibles }
}

const escapar = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const nombre = (c: string): string => (c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Un portal')

/** PURO. El Telegram (HTML) de UN trabajo parado: solo compañía y ramo. */
export function componerAvisoVerificacion(p: VerificacionPendiente): string {
  const ramo = p.ramo ? ` (${escapar(p.ramo)})` : ''
  return `🔐 ${escapar(nombre(p.compania))} pide verificación${ramo}: el bot se ha parado. Entra en su portal, valida y pulsa Reintentar en «Presupuestos de compañías».`
}

// ─── Red (solo desde la ruta del cron) ───────────────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

async function pedir(init: RequestInit): Promise<{ status: number; json: unknown } | null> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return null
  const res = await fetch(`${urlAsegura()}/api/operador/tarificador/avisos-verificacion`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(await cabecerasPuerto(secret)) },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

export async function leerVerificacionesAsegura(): Promise<RespuestaVerificaciones> {
  try {
    const r = await pedir({ method: 'GET' })
    if (r === null) return { estado: 'sin_configurar' }
    return interpretarVerificaciones(r.status, r.json)
  } catch (e) {
    return { estado: 'error', causa: `no se pudo llegar a asegura (${e instanceof Error ? e.message : String(e)})` }
  }
}

/** Marca los trabajos como avisados (idempotente al otro lado). `true` solo con `{estado:'ok'}`. */
export async function marcarVerificacionesAvisadas(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true
  try {
    const r = await pedir({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) })
    const o = (r && typeof r.json === 'object' && r.json !== null ? r.json : {}) as Record<string, unknown>
    return r !== null && r.status === 200 && o.estado === 'ok'
  } catch {
    return false
  }
}

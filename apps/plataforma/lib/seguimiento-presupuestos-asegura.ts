// Seguimiento de presupuestos enviados: avisar a Alberto por Telegram de los que el cliente no ha
// abierto o no ha elegido (28/09/2026).
//
// Esta app no toca la BD de la correduría: asegura decide QUÉ presupuestos toca avisar
// (`seguimientoPendiente` de `@central/module-seguros`) y lo sirve por el puerto
// `GET /api/operador/presupuesto/seguimiento`; tras avisar, se marca con
// `PATCH /api/operador/presupuesto {accion:'seguimiento_avisado'}` (idempotente).
//
// Dos partes, como el resto del puerto:
//   1. Lo PURO (`interpretarSeguimiento`, `componerAvisoSeguimiento`), con su test.
//   2. La RED, solo desde la ruta del cron.
//
// 🚨 Tres «no lo sé» que no se colapsan:
//   · `vistoAt` NULL es «no consta que lo abriera», NUNCA «no lo ha abierto» (el píxel/enlace puede no
//     haber llegado a contarlo). El aviso lo dice con esas palabras.
//   · Un fallo del puerto NO es «no hay pendientes»: el cron lo avisa una vez y no afirma nada.
//   · Una fila que no se entiende no desaparece en silencio: se cuenta en `ilegibles`.

import type { EtapaSeguimiento } from '@central/module-seguros'
import { cabecerasPuerto } from './puerto-actor.ts'

export type ActividadSeguimiento = {
  /** Etiquetas humanas de las garantías que marcó en el filtro. */
  garantias: string[]
  companiasComparadas: string[]
  ultimaAt: string
}

export type PresupuestoPendienteSeguimiento = {
  id: string
  clienteId: string | null
  /** `null` = la ficha no tiene nombre legible: se dice «el cliente», no se inventa. */
  tomador: string | null
  ramo: string | null
  etapa: EtapaSeguimiento
  enviadoAt: string
  vistoAt: string | null
  /** `null` = no consta actividad (no «no hizo nada»). */
  actividad: ActividadSeguimiento | null
}

export type RespuestaSeguimiento =
  | { estado: 'ok'; pendientes: PresupuestoPendienteSeguimiento[]; ilegibles: number }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; causa: string }

const ETAPAS: readonly EtapaSeguimiento[] = ['sin_abrir', 'sin_elegir']

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function listaCadenas(v: unknown): string[] {
  return Array.isArray(v) ? v.map(cadena).filter((x): x is string => x !== null) : []
}

function leerActividad(v: unknown): ActividadSeguimiento | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const ultimaAt = cadena(o.ultimaAt)
  if (ultimaAt === null) return null
  return { garantias: listaCadenas(o.garantias), companiasComparadas: listaCadenas(o.companiasComparadas), ultimaAt }
}

function leerPendiente(v: unknown): PresupuestoPendienteSeguimiento | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const id = cadena(o.id)
  const enviadoAt = cadena(o.enviadoAt)
  const etapa = o.etapa
  // Sin id no se puede marcar como avisado (y se repetiría cada pasada); sin etapa ni fecha no se sabe qué decir.
  if (id === null || enviadoAt === null || !ETAPAS.includes(etapa as EtapaSeguimiento)) return null
  return {
    id,
    clienteId: cadena(o.clienteId),
    tomador: cadena(o.tomador),
    ramo: cadena(o.ramo),
    etapa: etapa as EtapaSeguimiento,
    enviadoAt,
    vistoAt: cadena(o.vistoAt),
    actividad: leerActividad(o.actividad),
  }
}

/** PURO. La respuesta del puerto → pendientes, o un error CON causa. Nunca un «ok» vacío por un cuerpo raro. */
export function interpretarSeguimiento(status: number, json: unknown): RespuestaSeguimiento {
  if (status === 401 || status === 403) return { estado: 'error', causa: 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET)' }
  if (status === 404) return { estado: 'error', causa: 'asegura aún no tiene /api/operador/presupuesto/seguimiento desplegado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (o.estado === 'error') return { estado: 'error', causa: cadena(o.causa) ?? cadena(o.motivo) ?? `HTTP ${status}` }
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.pendientes)) {
    return { estado: 'error', causa: `respuesta ilegible (HTTP ${status})` }
  }
  const pendientes: PresupuestoPendienteSeguimiento[] = []
  let ilegibles = 0
  for (const fila of o.pendientes) {
    const p = leerPendiente(fila)
    if (p) pendientes.push(p)
    else ilegibles++
  }
  return { estado: 'ok', pendientes, ilegibles }
}

const ROTULO_RAMO: Record<string, string> = {
  auto: 'coche',
  moto: 'moto',
  hogar: 'hogar',
  decesos: 'decesos',
  salud: 'salud',
  vida: 'vida',
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function haceDias(desde: string, ahora: Date): string | null {
  const t = Date.parse(desde)
  if (!Number.isFinite(t)) return null
  const dias = Math.floor((ahora.getTime() - t) / 86_400_000)
  if (dias < 0) return null
  if (dias === 0) return 'hace menos de un día'
  return `hace ${dias} día${dias === 1 ? '' : 's'}`
}

/**
 * PURO. El Telegram (HTML) de UN presupuesto pendiente. Corto: quién, qué ramo, qué pasa y la ficha.
 * 🚨 «no consta que haya abierto», nunca «no lo ha abierto».
 */
export function componerAvisoSeguimiento(
  p: PresupuestoPendienteSeguimiento,
  opts: { ahora: Date; urlFicha: (clienteId: string) => string },
): string {
  const quien = escapar(p.tomador ?? 'El cliente')
  const ramo = escapar(p.ramo ? (ROTULO_RAMO[p.ramo] ?? p.ramo) : 'seguro')
  const lineas: string[] = []
  if (p.etapa === 'sin_abrir') {
    const cuando = haceDias(p.enviadoAt, opts.ahora)
    lineas.push(`📭 ${quien} no consta que haya abierto el presupuesto de ${ramo}${cuando ? ` (enviado ${cuando})` : ''}. ¿Le llamas?`)
  } else {
    lineas.push(`👀 ${quien} abrió el presupuesto de ${ramo} y no ha elegido.`)
    if (p.actividad && p.actividad.garantias.length > 0) lineas.push(`Miró: ${escapar(p.actividad.garantias.join(', '))}`)
    if (p.actividad && p.actividad.companiasComparadas.length > 0) lineas.push(`Comparó: ${escapar(p.actividad.companiasComparadas.join(', '))}`)
  }
  if (p.clienteId) lineas.push(`<a href="${escapar(opts.urlFicha(p.clienteId))}">Abrir su ficha</a>`)
  else lineas.push('(asegura no manda la ficha de este presupuesto)')
  return lineas.join('\n')
}

// ─── Red (solo desde la ruta del cron) ───────────────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

async function pedir(path: string, init: RequestInit): Promise<{ status: number; json: unknown } | null> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return null
  const res = await fetch(`${urlAsegura()}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(await cabecerasPuerto(secret)) },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

export async function leerSeguimientoPresupuestosAsegura(): Promise<RespuestaSeguimiento> {
  try {
    const r = await pedir('/api/operador/presupuesto/seguimiento', { method: 'GET' })
    if (r === null) return { estado: 'sin_configurar' }
    return interpretarSeguimiento(r.status, r.json)
  } catch (e) {
    // Un fallo de red NO es «no hay pendientes».
    return { estado: 'error', causa: `no se pudo llegar a asegura (${e instanceof Error ? e.message : String(e)})` }
  }
}

/** Marca la etapa como avisada. Idempotente al otro lado. `true` solo con `{estado:'ok'}`. */
export async function marcarSeguimientoAvisadoAsegura(p: { id: string; etapa: EtapaSeguimiento; actor: string }): Promise<boolean> {
  try {
    const r = await pedir('/api/operador/presupuesto', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: p.id, accion: 'seguimiento_avisado', etapa: p.etapa, actor: p.actor }),
    })
    const o = (r && typeof r.json === 'object' && r.json !== null ? r.json : {}) as Record<string, unknown>
    return r !== null && r.status === 200 && o.estado === 'ok'
  } catch {
    return false
  }
}

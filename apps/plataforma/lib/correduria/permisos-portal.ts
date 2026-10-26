// Permisos del portal (26/10/2026) para la campana de /correduria: cliente del puerto `GET /api/operador/portal-permisos`
// de asegura + intérprete PURO. Autorizaciones sin aceptar y peticiones de acceso sin contestar (PENDIENTES, cuentan) y
// las aceptadas/revocadas en los últimos 7 días (información, no cuentan).
//
// 🚨 Tres estados: `ok` (puede venir vacía de verdad), `sin_configurar` y `error`. Una fila ilegible tumba la lectura
// entera (si falta una, la lista no es la lista). Sin NIF/IBAN/dirección: asegura no los manda y aquí no se piden.
import { cabecerasPuerto } from '../puerto-actor.ts'

export type EventoPermiso = 'pendiente_aceptar' | 'aceptada' | 'revocada' | 'peticion_pendiente'
const EVENTOS: readonly EventoPermiso[] = ['pendiente_aceptar', 'aceptada', 'revocada', 'peticion_pendiente']

export type MovimientoPermiso = {
  id: string
  evento: EventoPermiso
  alcance: string
  fecha: string
  deClienteId: string | null
  de: string | null
  aClienteId: string | null
  a: string | null
  aInvitado: boolean
  revocadoPor: string | null
}

export type LecturaPermisosPortal =
  | { estado: 'ok'; pendientes: number; recientes: number; movimientos: MovimientoPermiso[]; truncado: boolean }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

const cadena = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export function leerMovimiento(v: unknown): MovimientoPermiso | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const id = cadena(o.id), alcance = cadena(o.alcance), fecha = cadena(o.fecha)
  const evento = EVENTOS.find((e) => e === o.evento)
  if (!id || !alcance || !fecha || !evento || Number.isNaN(Date.parse(fecha))) return null
  return {
    id, evento, alcance, fecha,
    deClienteId: cadena(o.deClienteId), de: cadena(o.de), aClienteId: cadena(o.aClienteId), a: cadena(o.a),
    aInvitado: o.aInvitado === true, revocadoPor: cadena(o.revocadoPor),
  }
}

export function interpretarPermisosPortal(status: number, json: unknown): LecturaPermisosPortal {
  const j = (json ?? null) as Record<string, unknown> | null
  if (status === 503 || j?.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (status === 404) return { estado: 'error', motivo: 'asegura aún no tiene /api/operador/portal-permisos desplegado' }
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'el secreto del puerto no vale' }
  if (status !== 200 || j?.estado !== 'ok' || !Array.isArray(j.movimientos)) {
    const causa = typeof j?.causa === 'string' ? ` (${j.causa})` : ''
    return { estado: 'error', motivo: `HTTP ${status}${causa}` }
  }
  const movimientos = j.movimientos.map(leerMovimiento)
  if (movimientos.some((m) => m === null)) return { estado: 'error', motivo: 'asegura devolvió un permiso incompleto' }
  const ok = movimientos as MovimientoPermiso[]
  const pendientes = ok.filter((m) => m.evento === 'pendiente_aceptar' || m.evento === 'peticion_pendiente').length
  return { estado: 'ok', pendientes, recientes: ok.length - pendientes, movimientos: ok, truncado: j.truncado === true }
}

const ROTULO_ALCANCE: Record<string, string> = { polizas: 'ver sus pólizas', partes: 'dar partes', documentos: 'ver documentos' }

/** La línea de un permiso, sin datos personales más allá de los nombres de las fichas. */
export function textoPermiso(m: MovimientoPermiso): string {
  const de = m.de ?? 'Un cliente sin ficha'
  const a = m.a ?? (m.aInvitado ? 'una persona invitada (sin ficha)' : 'otra persona sin ficha')
  const que = ROTULO_ALCANCE[m.alcance] ?? m.alcance
  switch (m.evento) {
    case 'pendiente_aceptar': return `${de} autorizó a ${a} a ${que}: sin aceptar todavía`
    case 'peticion_pendiente': return `${de} pide acceso a ${m.a ?? 'una ficha'} para ${que}: sin contestar`
    case 'aceptada': return `${a} aceptó el acceso de ${de} (${que})`
    case 'revocada': return `Acceso de ${a} a ${de} revocado${m.revocadoPor ? ` por ${m.revocadoPor === 'corredor' ? 'la correduría' : `el ${m.revocadoPor}`}` : ''}`
  }
}

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export async function permisosPortalAsegura(): Promise<LecturaPermisosPortal> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { estado: 'sin_configurar' }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/portal-permisos`, {
      headers: { ...(await cabecerasPuerto(secret)) },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return interpretarPermisosPortal(res.status, await res.json().catch(() => null))
  } catch {
    return { estado: 'error', motivo: 'no se pudo llegar a asegura' }
  }
}

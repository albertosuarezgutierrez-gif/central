// Las cuentas nuevas que piden los clientes desde el portal (29/09/2026): lector PURO del puerto de
// asegura y las llamadas (solo desde rutas API de plataforma). Alberto: «si cambia el IBAN, me avisa
// para yo cambiarla». La cola solo trae MÁSCARAS; el IBAN completo se pide aparte y queda auditado.

import { cabecerasPuerto } from './puerto-actor.ts'

export type SolicitudCuenta = {
  id: string
  clienteId: string
  cliente: string | null
  mascara: string
  /** La que tiene hoy la ficha. `null` = no tiene o no se ha podido leer. */
  mascaraActual: string | null
  estado: 'pendiente' | 'hecha' | 'descartada'
  pedidaEn: string
  /** Días que tenía el acceso al portal cuando la pidió. `null` = no consta (no es «antiguo»). */
  diasAcceso: number | null
  resueltaEn: string | null
  resueltaPor: string | null
}

export type RespuestaCambiosCuenta =
  | { estado: 'ok'; solicitudes: SolicitudCuenta[]; ilegibles: number }
  | { estado: 'error'; motivo: string }

const ESTADOS = ['pendiente', 'hecha', 'descartada'] as const

/**
 * PURO. Una fila rara se CUENTA (`ilegibles`), no se esconde; una respuesta que no es lista es un
 * error, nunca «no hay ninguna».
 */
export function interpretarCambiosCuenta(status: number, json: unknown): RespuestaCambiosCuenta {
  if (status === 503) return { estado: 'error', motivo: 'asegura no está configurada' }
  if (status !== 200 || typeof json !== 'object' || json === null) return { estado: 'error', motivo: `HTTP ${status}` }
  const lista = (json as Record<string, unknown>).solicitudes
  if (!Array.isArray(lista)) return { estado: 'error', motivo: 'respuesta sin lista' }
  const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
  let ilegibles = 0
  const solicitudes: SolicitudCuenta[] = []
  for (const x of lista) {
    const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>
    const id = txt(o.id), clienteId = txt(o.clienteId), mascara = txt(o.mascara), pedidaEn = txt(o.pedidaEn)
    const estado = ESTADOS.find((e) => e === o.estado)
    if (!id || !clienteId || !mascara || !pedidaEn || !estado) { ilegibles++; continue }
    solicitudes.push({
      id, clienteId, cliente: txt(o.cliente), mascara, mascaraActual: txt(o.mascaraActual), estado, pedidaEn,
      diasAcceso: typeof o.diasAcceso === 'number' && Number.isFinite(o.diasAcceso) ? o.diasAcceso : null,
      resueltaEn: txt(o.resueltaEn), resueltaPor: txt(o.resueltaPor),
    })
  }
  return { estado: 'ok', solicitudes, ilegibles }
}

/** Por debajo de esto, el acceso que pide el cambio es reciente y se avisa. */
export const DIAS_ACCESO_RECIENTE = 14

/**
 * PURO. El aviso de que el acceso que pide el cambio es nuevo (o no se sabe cuándo se creó): quien
 * roba una sesión puede meter su correo en la ficha y entrar con él, así que un acceso recién creado
 * pidiendo cambiar la cuenta se confirma con el cliente por teléfono antes de tocar nada.
 */
export function avisoAcceso(diasAcceso: number | null): string | null {
  if (diasAcceso === null) return 'No consta cuándo se creó el acceso que lo pide: confírmalo con el cliente por teléfono.'
  if (diasAcceso < DIAS_ACCESO_RECIENTE) {
    return `El acceso que lo pide se creó hace ${diasAcceso === 0 ? 'menos de un día' : `${diasAcceso} día${diasAcceso === 1 ? '' : 's'}`}: confírmalo con el cliente por teléfono antes de cambiarla.`
  }
  return null
}

/** Lo que cuenta para el badge: pendientes + las que no se han sabido leer (podrían serlo). */
export function contadorCambiosCuenta(r: RespuestaCambiosCuenta): number | null {
  return r.estado === 'ok' ? r.solicitudes.filter((s) => s.estado === 'pendiente').length + r.ilegibles : null
}

// ─── Red (solo desde las rutas API de plataforma) ────────────────────────────

export type Reenvio = { status: number; json: unknown }

async function llamar(path: string, init: RequestInit): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  const base = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...(await cabecerasPuerto(secret)), ...(init.body ? { 'content-type': 'application/json' } : {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

export function cambiosCuentaAsegura(): Promise<Reenvio> {
  return llamar('/api/operador/cambios-cuenta', { method: 'GET' })
}

export function resolverCambioCuentaAsegura(body: { id: string; estado: string; actor: string }): Promise<Reenvio> {
  return llamar('/api/operador/cambios-cuenta', { method: 'POST', body: JSON.stringify(body) })
}

export function ibanCambioCuentaAsegura(id: string): Promise<Reenvio> {
  return llamar('/api/operador/cambios-cuenta/iban', { method: 'POST', body: JSON.stringify({ id }) })
}

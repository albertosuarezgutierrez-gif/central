// Fusionar dos fichas de la misma persona (25/09/2026): la red hacia el puerto
// de asegura (`/api/operador/cliente/fusion`). Solo desde rutas API.
import { cabecerasPuerto } from './puerto-actor.ts'

export type Reenvio = { status: number; json: unknown }

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

async function llamar(path: string, init: RequestInit): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}${path}`, {
      ...init,
      headers: { ...(await cabecerasPuerto(secret)), ...(init.body ? { 'content-type': 'application/json' } : {}) },
      cache: 'no-store',
      // La fusión reapunta decenas de tablas en una transacción: más margen que una lectura.
      signal: AbortSignal.timeout(init.method === 'POST' ? 45_000 : 15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

/** Candidatas (sin `con`) o comparación de las dos fichas (con `con`). */
export function fusionAsegura(id: string, con?: string): Promise<Reenvio> {
  const q = `id=${encodeURIComponent(id)}${con ? `&con=${encodeURIComponent(con)}` : ''}`
  return llamar(`/api/operador/cliente/fusion?${q}`, { method: 'GET' })
}

export function fusionarAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/cliente/fusion', { method: 'POST', body: JSON.stringify(body) })
}

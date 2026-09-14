// Reenvío al puerto de asegura para anotar a mano la modalidad de una RC
// (09-12/09/2026). Mismo patrón que `cliente-edicion-asegura.ts::llamar`.

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export type Reenvio = { status: number; json: unknown }

async function llamar(path: string, init: RequestInit): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${secret}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

/** `PATCH /api/operador/poliza` — modalidad de RC. El `actor` lo pone la ruta (sesión). */
export function modalidadRcAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/poliza', { method: 'PATCH', body: JSON.stringify(body) })
}

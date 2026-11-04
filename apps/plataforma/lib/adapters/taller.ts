// Adaptador de la vertical taller (apps/taller). Solo ALTA: el puerto de taller no lista ni bloquea;
// se habla con `POST /api/operador/talleres` (Bearer TALLER_OPERADOR_SECRET). Sin fusionar BD.
// Requiere envs en plataforma: TALLER_URL + TALLER_OPERADOR_SECRET (PROPIO de taller; no reutilizar otros).
// El PIN temporal del dueño llega UNA vez en la respuesta: aquí se devuelve al operador y no se guarda en ningún sitio.

import type { VerticalAdapter, ClienteSaaS, NuevoCliente, AltaResultado } from './types'

const base = () => process.env.TALLER_URL?.replace(/\/$/, '')
const secret = () => process.env.TALLER_OPERADOR_SECRET

/** Cuerpo del puerto: sólo lo que taller entiende. Dirección vacía → no se manda. */
export function cuerpoAltaTaller(i: NuevoCliente): Record<string, unknown> {
  const d = i.direccion ?? {}
  const dir = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v !== ''))
  return {
    razonSocial: i.nombre.trim(),
    ...(i.nif?.trim() ? { nif: i.nif.trim() } : {}),
    duenoNombre: (i.responsableNombre ?? '').trim(),
    ...(Object.keys(dir).length ? { direccion: dir } : {}),
  }
}

export const tallerAdapter: VerticalAdapter = {
  vertical: 'taller',
  etiqueta: 'Taller de vehículos (taller)',
  puedeCrear: true,

  async crear(input): Promise<AltaResultado> {
    if (!input.nombre?.trim()) throw new Error('Razón social obligatoria')
    if (!input.responsableNombre?.trim()) throw new Error('Nombre del dueño obligatorio')
    const url = base(); const s = secret()
    if (!url || !s) throw new Error('taller sin conectar (define TALLER_URL + TALLER_OPERADOR_SECRET)')
    let res: Response
    try {
      res = await fetch(`${url}/api/operador/talleres`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpoAltaTaller(input)),
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      })
    } catch {
      throw new Error('taller no responde (red/timeout). No se sabe si se creó: revisa antes de repetir')
    }
    const j = await res.json().catch(() => ({} as Record<string, unknown>))
    if (!res.ok) throw new Error(String((j as { error?: unknown }).error || `No se pudo crear en taller (HTTP ${res.status})`))
    const { tallerId, pinTemporal } = j as { tallerId?: string; pinTemporal?: string }
    if (!tallerId || !pinTemporal) throw new Error('taller respondió sin id o sin PIN temporal')
    return { id: tallerId, pinTemporal }
  },

  // El puerto de taller no lista, no tiene ficha ni se bloquea desde aquí.
  async listar(): Promise<ClienteSaaS[]> { return [] },
  async ficha() { return null },
  async setActivo() { return false },
}

// Adaptador de la contabilidad (apps/contabilidad). Solo ALTA: el puerto no lista ni bloquea; se habla con
// `POST /api/operador/empresas` (Bearer CONTABILIDAD_OPERADOR_SECRET). Sin fusionar BD.
// Requiere envs en plataforma: CONTABILIDAD_URL + CONTABILIDAD_OPERADOR_SECRET (PROPIO de contabilidad; no reutilizar otros).
// El alta es idempotente por NIF: repetirla completa lo que falte y responde 200 con el mismo id (nunca crea otra empresa).
// No se envía nada a nadie: el dueño entra con su correo y un código (el envío de correo aún no está conectado en contabilidad).

import type { VerticalAdapter, ClienteSaaS, NuevoCliente, AltaResultado } from './types'

const base = () => process.env.CONTABILIDAD_URL?.replace(/\/$/, '')
const secret = () => process.env.CONTABILIDAD_OPERADOR_SECRET

/** Cuerpo del puerto: solo lo que contabilidad entiende. Vacíos → no se mandan (la forma se deduce del NIF; el sector, genérico). */
export function cuerpoAltaContabilidad(i: NuevoCliente): Record<string, unknown> {
  const color = i.color?.trim()
  const logo = i.logo?.trim()
  return {
    razonSocial: i.nombre.trim(),
    nif: (i.nif ?? '').trim(),
    dueno: { email: (i.email ?? '').trim().toLowerCase(), nombre: (i.responsableNombre ?? '').trim() },
    ...(color ? { colorPrimario: color.toLowerCase() } : {}),
    ...(logo && /^https:\/\//.test(logo) ? { logoUrl: logo } : {}),
  }
}

export const contabilidadAdapter: VerticalAdapter = {
  vertical: 'contabilidad',
  etiqueta: 'Contabilidad (contabilidad)',
  puedeCrear: true,

  async crear(input): Promise<AltaResultado> {
    if (!input.nombre?.trim()) throw new Error('Razón social obligatoria')
    if (!input.nif?.trim()) throw new Error('NIF obligatorio')
    if (!input.email?.trim()) throw new Error('Correo del dueño obligatorio')
    if (!input.responsableNombre?.trim()) throw new Error('Nombre del dueño obligatorio')
    const url = base(); const s = secret()
    if (!url || !s) throw new Error('contabilidad sin conectar (define CONTABILIDAD_URL + CONTABILIDAD_OPERADOR_SECRET)')
    let res: Response
    try {
      res = await fetch(`${url}/api/operador/empresas`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpoAltaContabilidad(input)),
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      })
    } catch {
      throw new Error('contabilidad no responde (red/timeout). No se sabe si se creó: repetir es seguro (idempotente por NIF)')
    }
    const j = await res.json().catch(() => ({} as Record<string, unknown>))
    if (!res.ok) {
      const errores = (j as { errores?: unknown }).errores
      throw new Error(Array.isArray(errores) && errores.length ? errores.join('. ') : String((j as { error?: unknown }).error || `No se pudo crear en contabilidad (HTTP ${res.status})`))
    }
    const { empresaId } = j as { empresaId?: string }
    if (!empresaId) throw new Error('contabilidad respondió sin id de empresa')
    return { id: empresaId }
  },

  // El puerto de contabilidad no lista, no tiene ficha ni se bloquea desde aquí.
  async listar(): Promise<ClienteSaaS[]> { return [] },
  async ficha() { return null },
  async setActivo() { return false },
}

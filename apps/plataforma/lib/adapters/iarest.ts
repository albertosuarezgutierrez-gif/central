// Adaptador de la vertical ia-rest (hostelería). ia-rest vive en una BD APARTE,
// así que NO se consulta su Postgres: se habla con su PUERTO por HTTP
// (`/api/operador/restaurantes`) con un secreto compartido. Sin fusionar BD.
// Requiere envs en plataforma: IAREST_URL + OPERADOR_SHARED_SECRET.

import type { VerticalAdapter, ClienteSaaS, Cliente360, Metrica } from './types'

interface RestaurantePort {
  id: string
  nombre: string
  ciudad: string | null
  plan: string | null
  plan_status: string | null
  activo: boolean
  created_at: string
  num_camareros: number
  num_mesas: number
  num_comandas: number
}

const base = () => process.env.IAREST_URL?.replace(/\/$/, '')
const secret = () => process.env.OPERADOR_SHARED_SECRET

function info(mensaje: string): ClienteSaaS {
  return { vertical: 'iarest', id: 'iarest-info', nombre: `ia-rest — ${mensaje}`, activo: false, puedeBloquear: false, metricas: [] }
}

async function port(path: string, init?: RequestInit): Promise<Response | null> {
  const url = base(); const s = secret()
  if (!url || !s) return null
  try {
    return await fetch(`${url}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${s}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
      cache: 'no-store',
    })
  } catch {
    return null
  }
}

function aCliente(r: RestaurantePort): ClienteSaaS {
  return {
    vertical: 'iarest',
    id: r.id,
    nombre: r.nombre,
    email: null,
    activo: r.activo,
    puedeBloquear: true,
    metricas: [
      { label: 'Ciudad', valor: r.ciudad || '—' },
      { label: 'Mesas', valor: String(r.num_mesas) },
      { label: 'Comandas', valor: String(r.num_comandas) },
    ],
  }
}

async function listarRaw(): Promise<RestaurantePort[]> {
  const res = await port('/api/operador/restaurantes')
  if (!res || !res.ok) throw new Error('puerto no disponible')
  const json = await res.json()
  return (json.restaurantes ?? []) as RestaurantePort[]
}

export const iarestAdapter: VerticalAdapter = {
  vertical: 'iarest',
  etiqueta: 'Hostelería (ia-rest)',

  async listar() {
    if (!base() || !secret()) return [info('configura IAREST_URL + OPERADOR_SHARED_SECRET')]
    try {
      return (await listarRaw()).map(aCliente)
    } catch {
      return [info('puerto no responde')]
    }
  },

  async ficha(id) {
    try {
      const r = (await listarRaw()).find(x => x.id === id)
      if (!r) return null
      const base = aCliente(r)
      const detalle: Metrica[] = [
        { label: 'Plan', valor: r.plan || '—' },
        { label: 'Estado plan', valor: r.plan_status || '—' },
        { label: 'Camareros', valor: String(r.num_camareros) },
        { label: 'Alta', valor: new Date(r.created_at).toLocaleDateString('es-ES') },
      ]
      const f: Cliente360 = { ...base, detalle }
      return f
    } catch {
      return null
    }
  },

  async setActivo(id, activo) {
    const res = await port('/api/operador/restaurantes', { method: 'PATCH', body: JSON.stringify({ id, activo }) })
    return !!res && res.ok
  },
}

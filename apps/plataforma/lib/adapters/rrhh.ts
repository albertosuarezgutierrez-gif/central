// Adaptador de la vertical rrhh (Portal del Empleado · iarrhh). rrhh posee su propio
// schema en la BD compartida, pero NO lo tocamos desde aquí: se habla con su PUERTO HTTP
// (`/api/operador/empresas`) con un secreto compartido. Sin fusionar BD. Patrón igual a ia-rest.
// Requiere envs en plataforma: RRHH_URL + RRHH_OPERADOR_SECRET (secreto PROPIO de iarrhh,
// distinto del OPERADOR_SHARED_SECRET que usa el puerto de ia-rest).

import type { VerticalAdapter, ClienteSaaS, Cliente360, Metrica } from './types'

interface EmpresaPort {
  id: string
  nombre: string
  marca_color: string | null
  creada_at: string
  num_empleados: number
  responsable_email: string | null
}

const base = () => process.env.RRHH_URL?.replace(/\/$/, '')
const secret = () => process.env.RRHH_OPERADOR_SECRET

function info(mensaje: string): ClienteSaaS {
  return { vertical: 'rrhh', id: 'rrhh-info', nombre: `iarrhh — ${mensaje}`, activo: false, puedeBloquear: false, metricas: [] }
}

async function port(path: string, init?: RequestInit): Promise<Response | null> {
  const url = base(); const s = secret()
  if (!url || !s) return null
  try {
    return await fetch(`${url}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${s}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    return null
  }
}

function aCliente(e: EmpresaPort): ClienteSaaS {
  return {
    vertical: 'rrhh',
    id: e.id,
    nombre: e.nombre,
    email: e.responsable_email,
    activo: true,
    puedeBloquear: false, // el modelo rrhh no tiene estado activo/bloqueado
    metricas: [
      { label: 'Empleados', valor: String(e.num_empleados) },
      { label: 'Responsable', valor: e.responsable_email || '—' },
    ],
  }
}

async function listarRaw(): Promise<EmpresaPort[]> {
  const res = await port('/api/operador/empresas')
  if (!res) throw new Error('sin conexión (red/timeout/WAF)')
  if (!res.ok) throw new Error(`HTTP ${res.status}`) // 401 = secreto · 500 = BD de rrhh
  const json = await res.json()
  return (json.empresas ?? []) as EmpresaPort[]
}

export const rrhhAdapter: VerticalAdapter = {
  vertical: 'rrhh',
  etiqueta: 'RR.HH. (iarrhh)',
  puedeCrear: true,

  async crear({ nombre, email, password, responsableNombre, color }) {
    if (!nombre) throw new Error('Nombre de empresa obligatorio')
    const res = await port('/api/operador/empresas', {
      method: 'POST',
      body: JSON.stringify({ empresa: nombre, color, responsable_nombre: responsableNombre, responsable_email: email, password }),
    })
    if (!res) throw new Error('iarrhh sin conectar (define RRHH_URL + RRHH_OPERADOR_SECRET)')
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'No se pudo crear en iarrhh') }
    const { id } = await res.json()
    return { id }
  },

  async listar() {
    if (!base() || !secret()) return [info('configura RRHH_URL + RRHH_OPERADOR_SECRET')]
    try {
      return (await listarRaw()).map(aCliente)
    } catch (e: any) {
      return [info(`puerto no responde (${e?.message || 'error'})`)]
    }
  },

  async ficha(id) {
    try {
      const e = (await listarRaw()).find(x => x.id === id)
      if (!e) return null
      const detalle: Metrica[] = [
        { label: 'Empleados', valor: String(e.num_empleados) },
        { label: 'Responsable', valor: e.responsable_email || '—' },
        { label: 'Alta', valor: new Date(e.creada_at).toLocaleDateString('es-ES') },
      ]
      const f: Cliente360 = { ...aCliente(e), detalle }
      return f
    } catch {
      return null
    }
  },

  async setActivo() {
    return false // no soportado: las empresas rrhh no tienen estado bloqueable
  },
}

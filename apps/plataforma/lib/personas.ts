// Consolidación "la persona a través de verticales" (Fase 3, SOLO LECTURA).
//
// Junta a la misma persona física aunque tenga roles en distintas verticales: limpiadora en
// ialimp (`public.limpiadoras`, leída por prisma directo) y empleada en rrhh (leída por el PUERTO
// HTTP operador, sin tocar su BD). Agrupa por `persona_id` y, para las que aún no están enlazadas,
// PROPONE coincidencias por DNI/email con `@central/core-identity` (matching puro). No escribe nada.
import { prisma } from './db'
import { coincidenciaPersona, type Persona } from '@central/core-identity'

export type RolVertical = {
  vertical: 'ialimp' | 'rrhh'
  rol: 'limpiadora' | 'empleado'
  ref: string                 // id en su vertical
  nombre: string
  email: string | null
  dni: string | null
  empresa: string | null
  persona_id: string | null
}

export type PersonaConsolidada = {
  persona_id: string | null
  nombre: string
  roles: RolVertical[]
  multivertical: boolean      // está en >1 vertical (misma persona, varios roles)
}

export type Sugerencia = {
  confianza: 'probable' | 'posible'   // probable = mismo DNI · posible = mismo email
  motivo: string
  a: RolVertical
  b: RolVertical
}

/** Limpiadoras de ialimp (BD compartida, prisma directo). */
async function limpiadoras(): Promise<RolVertical[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT l.id::text AS ref, l.persona_id::text AS persona_id, l.nombre, l.email, l.dni,
           e.marca_nombre, e.nombre AS empresa_nombre
    FROM limpiadoras l LEFT JOIN empresas e ON e.id = l.empresa_id
    WHERE l.activa = true`
  return rows.map(r => ({
    vertical: 'ialimp', rol: 'limpiadora', ref: r.ref, nombre: r.nombre,
    email: r.email ?? null, dni: r.dni ?? null,
    empresa: r.marca_nombre || r.empresa_nombre || null, persona_id: r.persona_id ?? null,
  }))
}

/** Empleados de rrhh vía su puerto operador (HTTP, read-only). Devuelve [] si no hay conexión. */
async function empleadosRrhh(): Promise<RolVertical[]> {
  const url = process.env.RRHH_URL?.replace(/\/$/, '')
  const secret = process.env.RRHH_OPERADOR_SECRET
  if (!url || !secret) return []
  try {
    const res = await fetch(`${url}/api/operador/personas`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store', signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const json = await res.json()
    return ((json.personas ?? []) as any[]).map(r => ({
      vertical: 'rrhh' as const, rol: 'empleado' as const, ref: r.empleado_id, nombre: r.nombre,
      email: r.email ?? null, dni: r.dni ?? null, empresa: r.empresa_nombre ?? null,
      persona_id: r.persona_id ?? null,
    }))
  } catch {
    return []
  }
}

const persona = (r: RolVertical): Persona => ({ id: r.persona_id, nombre: r.nombre, email: r.email, dni: r.dni })

/**
 * Devuelve las personas consolidadas (agrupadas por persona_id) y las sugerencias de enlace
 * (parejas ialimp↔rrhh no enlazadas que parecen la misma persona por DNI/email).
 */
export async function consolidarPersonas(): Promise<{
  personas: PersonaConsolidada[]
  sugerencias: Sugerencia[]
  rrhhDisponible: boolean
}> {
  const [limp, emp] = await Promise.all([limpiadoras(), empleadosRrhh()])
  const rrhhDisponible = emp.length > 0 || !!process.env.RRHH_URL
  const todos = [...limp, ...emp]

  // Agrupar por persona_id (las que lo tienen); las que no, van como persona suelta.
  const porPersona = new Map<string, RolVertical[]>()
  const sueltos: RolVertical[] = []
  for (const r of todos) {
    if (r.persona_id) {
      const arr = porPersona.get(r.persona_id) ?? []
      arr.push(r); porPersona.set(r.persona_id, arr)
    } else sueltos.push(r)
  }

  const personas: PersonaConsolidada[] = []
  for (const [pid, roles] of porPersona) {
    const verticales = new Set(roles.map(x => x.vertical))
    personas.push({ persona_id: pid, nombre: roles[0].nombre, roles, multivertical: verticales.size > 1 })
  }
  for (const r of sueltos) personas.push({ persona_id: null, nombre: r.nombre, roles: [r], multivertical: false })
  // Multivertical primero (lo interesante), luego por nombre.
  personas.sort((a, b) => Number(b.multivertical) - Number(a.multivertical) || a.nombre.localeCompare(b.nombre))

  // Sugerencias: pareja ialimp×rrhh NO ya enlazadas (distinto/sin persona_id) que coinciden por DNI/email.
  const sugerencias: Sugerencia[] = []
  for (const l of limp) for (const e of emp) {
    if (l.persona_id && e.persona_id && l.persona_id === e.persona_id) continue // ya son la misma
    const c = coincidenciaPersona(persona(l), persona(e))
    if (c === 'probable' || c === 'posible') {
      sugerencias.push({ confianza: c, motivo: c === 'probable' ? 'mismo DNI' : 'mismo email', a: l, b: e })
    }
  }
  return { personas, sugerencias, rrhhDisponible }
}

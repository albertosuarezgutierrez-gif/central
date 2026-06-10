// Adaptador de la vertical ialimp (limpieza). Los tenants son las filas de
// `empresas` en la BD COMPARTIDA → lectura directa por SQL (mismo patrón que
// lib/financiero.ts). Bloquear = empresas.activa (ya bloquea el login de ialimp).

import { prisma } from '../db'
import type { VerticalAdapter, ClienteSaaS, Cliente360, Metrica } from './types'

interface Row {
  id: string
  nombre: string
  email: string | null
  activa: boolean
  plan: string | null
  created_at: Date
  limpiadoras: bigint
  clientes: bigint
  propiedades: bigint
  sesiones_mes: bigint
}

async function filas(empresaId?: string): Promise<Row[]> {
  if (empresaId) {
    return prisma.$queryRaw<Row[]>`
      SELECT e.id, e.nombre, e.email, e.activa, e.plan, e.created_at,
        COUNT(DISTINCT l.id) FILTER (WHERE l.activa = true) AS limpiadoras,
        COUNT(DISTINCT c.id)                                AS clientes,
        COUNT(DISTINCT p.id) FILTER (WHERE p.activa = true) AS propiedades,
        COUNT(DISTINCT cs.id) FILTER (WHERE cs.session_date >= date_trunc('month', CURRENT_DATE)) AS sesiones_mes
      FROM empresas e
      LEFT JOIN limpiadoras l      ON l.empresa_id = e.id
      LEFT JOIN clientes c         ON c.empresa_id = e.id
      LEFT JOIN propiedades p      ON p.empresa_id = e.id
      LEFT JOIN cleaning_sessions cs ON cs.empresa_id = e.id
      WHERE e.id = ${empresaId}::uuid
      GROUP BY e.id
    `
  }
  return prisma.$queryRaw<Row[]>`
    SELECT e.id, e.nombre, e.email, e.activa, e.plan, e.created_at,
      COUNT(DISTINCT l.id) FILTER (WHERE l.activa = true) AS limpiadoras,
      COUNT(DISTINCT c.id)                                AS clientes,
      COUNT(DISTINCT p.id) FILTER (WHERE p.activa = true) AS propiedades,
      COUNT(DISTINCT cs.id) FILTER (WHERE cs.session_date >= date_trunc('month', CURRENT_DATE)) AS sesiones_mes
    FROM empresas e
    LEFT JOIN limpiadoras l      ON l.empresa_id = e.id
    LEFT JOIN clientes c         ON c.empresa_id = e.id
    LEFT JOIN propiedades p      ON p.empresa_id = e.id
    LEFT JOIN cleaning_sessions cs ON cs.empresa_id = e.id
    GROUP BY e.id
    ORDER BY e.created_at DESC
  `
}

function metricas(r: Row): Metrica[] {
  return [
    { label: 'Limpiadoras', valor: String(Number(r.limpiadoras)) },
    { label: 'Clientes', valor: String(Number(r.clientes)) },
    { label: 'Sesiones/mes', valor: String(Number(r.sesiones_mes)) },
  ]
}

function aCliente(r: Row): ClienteSaaS {
  return {
    vertical: 'ialimp',
    id: r.id,
    nombre: r.nombre,
    email: r.email,
    activo: r.activa,
    puedeBloquear: true,
    metricas: metricas(r),
  }
}

export const ialimpAdapter: VerticalAdapter = {
  vertical: 'ialimp',
  etiqueta: 'Limpieza (ialimp)',

  async listar() {
    try {
      return (await filas()).map(aCliente)
    } catch {
      return []
    }
  },

  async ficha(id) {
    const rows = await filas(id)
    if (!rows.length) return null
    const r = rows[0]
    const base = aCliente(r)
    const detalle: Metrica[] = [
      { label: 'Plan', valor: r.plan || 'starter' },
      { label: 'Propiedades', valor: String(Number(r.propiedades)) },
      { label: 'Alta', valor: new Date(r.created_at).toLocaleDateString('es-ES') },
      { label: 'Email', valor: r.email || '—' },
    ]
    const f: Cliente360 = { ...base, detalle }
    return f
  },

  async setActivo(id, activo) {
    try {
      await prisma.$executeRaw`UPDATE empresas SET activa = ${activo} WHERE id = ${id}::uuid`
      return true
    } catch {
      return false
    }
  },
}

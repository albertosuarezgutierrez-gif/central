// Adaptador de la vertical ialimp (limpieza). Los tenants son las filas de
// `empresas` en la BD COMPARTIDA → lectura directa por SQL (mismo patrón que
// lib/financiero.ts). Bloquear = empresas.activa (ya bloquea el login de ialimp).

import { prisma } from '../db'
import { hashPassword } from '../auth'
import type { VerticalAdapter, ClienteSaaS, Cliente360, Metrica, NuevoCliente } from './types'

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

// Métricas por subconsulta (cada una es un COUNT indexado). NO usar LEFT JOIN +
// COUNT(DISTINCT): cruza clientes×propiedades×sesiones×limpiadoras (millones de
// filas) y dispara el statement-timeout → el panel mostraba 0 clientes.
async function filas(empresaId?: string): Promise<Row[]> {
  if (empresaId) {
    return prisma.$queryRaw<Row[]>`
      SELECT e.id, e.nombre, e.email, e.activa, e.plan, e.created_at,
        (SELECT COUNT(*) FROM limpiadoras l WHERE l.empresa_id = e.id AND l.activa = true) AS limpiadoras,
        (SELECT COUNT(*) FROM clientes c WHERE c.empresa_id = e.id) AS clientes,
        (SELECT COUNT(*) FROM propiedades p WHERE p.empresa_id = e.id AND p.activa = true) AS propiedades,
        (SELECT COUNT(*) FROM cleaning_sessions cs WHERE cs.empresa_id = e.id AND cs.session_date >= date_trunc('month', CURRENT_DATE)) AS sesiones_mes
      FROM empresas e
      WHERE e.id = ${empresaId}::uuid
    `
  }
  return prisma.$queryRaw<Row[]>`
    SELECT e.id, e.nombre, e.email, e.activa, e.plan, e.created_at,
      (SELECT COUNT(*) FROM limpiadoras l WHERE l.empresa_id = e.id AND l.activa = true) AS limpiadoras,
      (SELECT COUNT(*) FROM clientes c WHERE c.empresa_id = e.id) AS clientes,
      (SELECT COUNT(*) FROM propiedades p WHERE p.empresa_id = e.id AND p.activa = true) AS propiedades,
      (SELECT COUNT(*) FROM cleaning_sessions cs WHERE cs.empresa_id = e.id AND cs.session_date >= date_trunc('month', CURRENT_DATE)) AS sesiones_mes
    FROM empresas e
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
  puedeCrear: true,

  async crear({ nombre, email, password }: NuevoCliente) {
    if (!nombre || !email || !password) throw new Error('Nombre, email y contraseña obligatorios')
    const dup = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM empresas WHERE lower(email) = lower(${email}) LIMIT 1`
    if (dup.length) throw new Error('Ya existe una empresa con ese email')
    const hash = await hashPassword(password)
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO empresas (nombre, email, password_hash, plan)
      VALUES (${nombre}, ${email.toLowerCase()}, ${hash}, 'starter')
      RETURNING id
    `
    return { id: rows[0].id }
  },

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

  // Directorio del negocio (empresaId = refExt): usuarios de la empresa + limpiadoras.
  async listarDirectorio(empresaId) {
    try {
      const [usuarios, limpis] = await Promise.all([
        prisma.$queryRaw<Array<{ id: string; nombre: string | null; email: string | null; rol: string | null }>>`
          SELECT id, nombre, email, rol FROM usuarios_empresa
          WHERE empresa_id = ${empresaId}::uuid AND activo = true ORDER BY nombre`,
        prisma.$queryRaw<Array<{ id: string; nombre: string }>>`
          SELECT id, nombre FROM limpiadoras
          WHERE empresa_id = ${empresaId}::uuid AND activa = true ORDER BY nombre`,
      ])
      return [
        ...usuarios.map(u => ({ refPersona: `usuario:${u.id}`, nombre: u.nombre || u.email || 'Usuario', rol: u.rol ?? null, email: u.email ?? null })),
        ...limpis.map(l => ({ refPersona: `limpiadora:${l.id}`, nombre: l.nombre, rol: 'limpiadora', email: null })),
      ]
    } catch {
      return []
    }
  },
}

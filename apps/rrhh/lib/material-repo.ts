// Material del empleado: acceso a BD (rrhh.material_empleado, migración 0028) + URLs firmadas.
// 🚨 Toda consulta filtra por el empresa_id de la SESIÓN (y por el empleado_id de la sesión en las
// del portal /e). El rol rrhh_app tiene BYPASSRLS: el aislamiento es este WHERE, no la RLS.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { urlFirmada } from '@/lib/storage'
import { esPathMaterialDe, type AltaMaterial, type EstadoMaterial, type FiltrosMaterial } from '@/lib/material'

export type Material = {
  id: string; empleado_id: string; tipo: string; nombre: string; nota: string | null
  estado: string; estado_nota: string | null; revisado_at: string | null; creado_at: string
  url: string | null
}
export type MaterialAdmin = Material & { empleado: string; revisado_por_nombre: string | null }

type Fila = Omit<Material, 'url'> & { empresa_id: string; foto_path: string }

/** Firma la foto SOLO si el path de la fila cuelga de su empresa/empleado (defensa en profundidad). */
async function conUrl<T extends Fila>(f: T): Promise<Omit<T, 'foto_path' | 'empresa_id'> & { url: string | null }> {
  const { foto_path, empresa_id, ...resto } = f
  let url: string | null = null
  if (esPathMaterialDe(empresa_id, f.empleado_id, foto_path)) {
    url = await urlFirmada(foto_path).catch(() => null)
  } else {
    console.error('material: path fuera de su empresa/empleado, no se firma', f.id)
  }
  return { ...resto, url }
}

const plano = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

export async function crearMaterial(empresaId: string, empleadoId: string, d: AltaMaterial, path: string): Promise<Material> {
  const rows = await prisma.$queryRaw<Fila[]>(Prisma.sql`
    INSERT INTO rrhh.material_empleado (empresa_id, empleado_id, tipo, nombre, nota, foto_path)
    VALUES (${empresaId}::uuid, ${empleadoId}::uuid, ${d.tipo}, ${d.nombre}, ${d.nota}, ${path})
    RETURNING id, empresa_id, empleado_id, tipo, nombre, nota, foto_path, estado, estado_nota, revisado_at, creado_at`)
  return conUrl(plano(rows[0]))
}

/** Lista del propio empleado (sin borrados), lo último primero. */
export async function listarMaterialEmpleado(empresaId: string, empleadoId: string): Promise<Material[]> {
  const rows = await prisma.$queryRaw<Fila[]>(Prisma.sql`
    SELECT id, empresa_id, empleado_id, tipo, nombre, nota, foto_path, estado, estado_nota, revisado_at, creado_at
    FROM rrhh.material_empleado
    WHERE empresa_id = ${empresaId}::uuid AND empleado_id = ${empleadoId}::uuid AND borrado_at IS NULL
    ORDER BY creado_at DESC
    LIMIT 200`)
  return Promise.all(plano(rows).map(conUrl))
}

/**
 * Borrado lógico por el empleado: solo lo SUYO y solo si sigue `pendiente` (la condición va en el
 * UPDATE, así no hay carrera con una revisión simultánea). Devuelve si borró algo.
 * La foto se conserva en Storage (el registro sigue existiendo como histórico).
 */
export async function borrarMaterialEmpleado(empresaId: string, empleadoId: string, id: string): Promise<boolean> {
  const n = await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.material_empleado SET borrado_at = now()
    WHERE id = ${id}::uuid AND empresa_id = ${empresaId}::uuid AND empleado_id = ${empleadoId}::uuid
      AND estado = 'pendiente' AND borrado_at IS NULL`)
  return n > 0
}

/** Panel: material de la empresa de la sesión, filtrable y paginado (50 + «Ver más»). */
export async function listarMaterialAdmin(empresaId: string, f: FiltrosMaterial):
  Promise<{ filas: MaterialAdmin[]; total: number; hay_mas: boolean }> {
  const cond = [
    Prisma.sql`m.empresa_id = ${empresaId}::uuid`,
    Prisma.sql`m.borrado_at IS NULL`,
  ]
  if (f.empleado_id) cond.push(Prisma.sql`m.empleado_id = ${f.empleado_id}::uuid`)
  if (f.tipo) cond.push(Prisma.sql`m.tipo = ${f.tipo}`)
  if (f.estado) cond.push(Prisma.sql`m.estado = ${f.estado}`)
  const where = Prisma.join(cond, ' AND ')
  const [rows, cnt] = await Promise.all([
    prisma.$queryRaw<(Fila & { empleado: string; revisado_por_nombre: string | null })[]>(Prisma.sql`
      SELECT m.id, m.empresa_id, m.empleado_id, m.tipo, m.nombre, m.nota, m.foto_path, m.estado, m.estado_nota,
             m.revisado_at, m.creado_at,
             TRIM(CONCAT_WS(' ', e.nombre, e.apellidos)) AS empleado,
             u.nombre AS revisado_por_nombre
      FROM rrhh.material_empleado m
      JOIN rrhh.empleados e ON e.id = m.empleado_id AND e.empresa_id = m.empresa_id
      LEFT JOIN rrhh.usuarios_rrhh u ON u.id = m.revisado_por
      WHERE ${where}
      ORDER BY m.creado_at DESC, m.id
      LIMIT ${f.limit} OFFSET ${f.offset}`),
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT count(*) AS n FROM rrhh.material_empleado m WHERE ${where}`),
  ])
  const total = Number(cnt[0]?.n ?? 0)
  const filas = await Promise.all(plano(rows).map(conUrl))
  return { filas, total, hay_mas: f.offset + filas.length < total }
}

/** RRHH pone el estado. Solo filas vivas de SU empresa. Devuelve la fila actualizada o null. */
export async function cambiarEstadoMaterial(
  empresaId: string, usuarioId: string, id: string, estado: EstadoMaterial, nota: string | null,
): Promise<{ id: string; estado: string; estado_nota: string | null; revisado_at: string } | null> {
  const rows = await prisma.$queryRaw<{ id: string; estado: string; estado_nota: string | null; revisado_at: string }[]>(Prisma.sql`
    UPDATE rrhh.material_empleado
    SET estado = ${estado}, estado_nota = ${nota}, revisado_por = ${usuarioId}::uuid, revisado_at = now()
    WHERE id = ${id}::uuid AND empresa_id = ${empresaId}::uuid AND borrado_at IS NULL
    RETURNING id, estado, estado_nota, revisado_at`)
  return rows[0] ? plano(rows[0]) : null
}

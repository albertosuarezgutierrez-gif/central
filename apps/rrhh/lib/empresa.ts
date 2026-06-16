import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export type EmpresaConvenio = { nombre: string; convenio_codigo: string | null; convenio_nombre: string | null }

/** Datos de la empresa (incluido el convenio colectivo). */
export async function getEmpresa(empresaId: string): Promise<EmpresaConvenio | null> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT nombre, convenio_codigo, convenio_nombre FROM rrhh.empresas WHERE id = ${empresaId}::uuid LIMIT 1`)
  return rows[0] ?? null
}

/** Actualiza el convenio colectivo de la empresa (código + nombre). Vacíos → null. */
export async function actualizarConvenio(empresaId: string, codigo: string | null, nombre: string | null) {
  const c = (codigo ?? '').trim() || null
  const n = (nombre ?? '').trim() || null
  await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.empresas SET convenio_codigo = ${c}, convenio_nombre = ${n} WHERE id = ${empresaId}::uuid`)
  return { convenio_codigo: c, convenio_nombre: n }
}

/** Texto legible del convenio para mostrar/estampar (o null si no hay). */
export function textoConvenio(e: { convenio_codigo: string | null; convenio_nombre: string | null }): string | null {
  if (!e.convenio_codigo && !e.convenio_nombre) return null
  if (e.convenio_nombre && e.convenio_codigo) return `${e.convenio_nombre} (cód. ${e.convenio_codigo})`
  return e.convenio_nombre || `cód. ${e.convenio_codigo}`
}

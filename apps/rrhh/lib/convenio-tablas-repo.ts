// Adaptador Prisma de `rrhh.convenio_tablas_salariales` (migración 0033). TODA sentencia filtra por `empresa_id` de la
// sesión (rrhh_app tiene BYPASSRLS: el aislamiento es del código). Las reglas viven en `convenio-tablas.ts` (puro).
import { prisma } from './prisma'
import { Prisma } from '@prisma/client'
import type { FilaTablaConvenio, PagasConvenio } from './convenio-tablas'

type FilaBd = {
  id: string; convenio: string; anio: number; categoria: string
  salario_base_cent: bigint | number; plus_convenio_cent: bigint | number | null; pagas: number | null
}

function mapear(r: FilaBd): FilaTablaConvenio & { id: string } {
  return {
    id: r.id,
    convenio: r.convenio,
    anio: Number(r.anio),
    categoria: r.categoria,
    salarioBaseCent: Number(r.salario_base_cent),
    plusConvenioCent: r.plus_convenio_cent == null ? null : Number(r.plus_convenio_cent),
    pagas: r.pagas == null ? null : (Number(r.pagas) as PagasConvenio),
  }
}

export async function listarTablasConvenio(empresaId: string): Promise<(FilaTablaConvenio & { id: string })[]> {
  const rows = await prisma.$queryRaw<FilaBd[]>(Prisma.sql`
    SELECT id::text AS id, convenio, anio, categoria, salario_base_cent, plus_convenio_cent, pagas
    FROM rrhh.convenio_tablas_salariales
    WHERE empresa_id = ${empresaId}::uuid
    ORDER BY anio DESC, convenio ASC, categoria ASC
    LIMIT 500`)
  return rows.map(mapear)
}

/** Alta o corrección de una fila (misma empresa + convenio + año + categoría = la misma fila). */
export async function guardarFilaConvenio(empresaId: string, f: FilaTablaConvenio, por: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO rrhh.convenio_tablas_salariales
      (empresa_id, convenio, anio, categoria, salario_base_cent, plus_convenio_cent, pagas, creada_por)
    VALUES (${empresaId}::uuid, ${f.convenio}, ${f.anio}, ${f.categoria}, ${BigInt(f.salarioBaseCent)},
            ${f.plusConvenioCent == null ? null : BigInt(f.plusConvenioCent)}, ${f.pagas}, ${por})
    ON CONFLICT (empresa_id, convenio, anio, lower(btrim(categoria))) DO UPDATE SET
      categoria = EXCLUDED.categoria,
      salario_base_cent = EXCLUDED.salario_base_cent,
      plus_convenio_cent = EXCLUDED.plus_convenio_cent,
      pagas = EXCLUDED.pagas,
      actualizada_at = now()`)
}

export async function borrarFilaConvenio(empresaId: string, id: string): Promise<number> {
  return prisma.$executeRaw(Prisma.sql`
    DELETE FROM rrhh.convenio_tablas_salariales WHERE id = ${id}::uuid AND empresa_id = ${empresaId}::uuid`)
}

/** Convenio de la empresa (Ajustes → convenio): código REGCON o, si no, el nombre. null = no se sabe. */
export async function convenioDeEmpresa(empresaId: string): Promise<string | null> {
  const r = await prisma.$queryRaw<{ convenio_codigo: string | null; convenio_nombre: string | null }[]>(Prisma.sql`
    SELECT convenio_codigo, convenio_nombre FROM rrhh.empresas WHERE id = ${empresaId}::uuid LIMIT 1`)
  return r[0]?.convenio_codigo?.trim() || r[0]?.convenio_nombre?.trim() || null
}

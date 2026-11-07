import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { estadoDeFila, type CambioModulo, type EstadoModulo, type FilaModulo, type Modulo } from './modulos-empresa-reglas'

/** Estado del módulo para la empresa de la SESIÓN. Un error de lectura (p. ej. 0031 sin aplicar) = «no se sabe», nunca «apagado». */
export async function leerModulo(empresaId: string, modulo: Modulo): Promise<EstadoModulo> {
  try {
    const filas = await prisma.$queryRaw<FilaModulo[]>(Prisma.sql`
      SELECT activo, modo, activado_por, activado_at FROM rrhh.empresa_modulos
      WHERE empresa_id = ${empresaId}::uuid AND modulo = ${modulo} LIMIT 1`)
    return estadoDeFila(filas[0])
  } catch (e) {
    return { estado: 'desconocido', motivo: e instanceof Error ? e.message.slice(0, 200) : 'error al leer' }
  }
}

/** Empresas cuyo cron de nóminas debe CALCULAR: módulo activo y modo 'calculo'. Lanza si no se puede leer (el cron no hace nada). */
export async function empresasConNominasEnCalculo(): Promise<string[]> {
  const filas = await prisma.$queryRaw<{ empresa_id: string }[]>(Prisma.sql`
    SELECT m.empresa_id::text AS empresa_id FROM rrhh.empresa_modulos m
    JOIN rrhh.empresas e ON e.id = m.empresa_id
    WHERE m.modulo = 'nominas' AND m.activo = true AND m.modo = 'calculo'
    ORDER BY e.creada_at ASC`)
  return filas.map(f => f.empresa_id)
}

/** Solo el OPERADOR (ruta /api/operador/empresas/modulos). Devuelve false si la empresa no existe. */
export async function guardarModulo(c: CambioModulo): Promise<boolean> {
  const existe = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM rrhh.empresas WHERE id = ${c.empresaId}::uuid LIMIT 1`)
  if (!existe.length) return false
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO rrhh.empresa_modulos (empresa_id, modulo, activo, modo, activado_por, activado_at)
    VALUES (${c.empresaId}::uuid, ${c.modulo}, ${c.activo}, ${c.modo}, ${c.activadoPor}, now())
    ON CONFLICT (empresa_id, modulo) DO UPDATE
      SET activo = EXCLUDED.activo, modo = EXCLUDED.modo, activado_por = EXCLUDED.activado_por, activado_at = now()
    WHERE rrhh.empresa_modulos.empresa_id = ${c.empresaId}::uuid`)
  if (c.modulo === 'contabilidad_nominas') {
    // Columna de la migración 0033; solo se toca para este módulo (el de nóminas sigue funcionando sin ella).
    await prisma.$executeRaw(Prisma.sql`
      UPDATE rrhh.empresa_modulos SET contabilidad_empresa_id = ${c.contabilidadEmpresaId}::uuid
      WHERE empresa_id = ${c.empresaId}::uuid AND modulo = 'contabilidad_nominas'`)
  }
  return true
}

/**
 * N3: ¿a qué empresa de contabilidad se envían los hechos de nómina de ESTA empresa? `null` = módulo apagado o sin empresa vinculada
 * (no se encola nada). Un error de lectura LANZA: confirmar una nómina no debe seguir «como si estuviera apagado» si no se sabe.
 */
export async function contabilidadDeNominas(empresaId: string): Promise<string | null> {
  // 1.ª consulta sin columnas de la 0033: con el módulo apagado (lo normal) confirmar no depende de la migración.
  const act = await prisma.$queryRaw<{ activo: boolean }[]>(Prisma.sql`
    SELECT activo FROM rrhh.empresa_modulos WHERE empresa_id = ${empresaId}::uuid AND modulo = 'contabilidad_nominas' LIMIT 1`)
  if (!act[0]?.activo) return null
  const filas = await prisma.$queryRaw<{ cid: string | null }[]>(Prisma.sql`
    SELECT contabilidad_empresa_id::text AS cid FROM rrhh.empresa_modulos
    WHERE empresa_id = ${empresaId}::uuid AND modulo = 'contabilidad_nominas' AND activo = true LIMIT 1`)
  return filas[0]?.cid ?? null
}

// Lecturas del Inicio del responsable (`/admin`). Solo SELECT sobre tablas que ya existen (sin migración), siempre con el
// `empresa_id` de la SESIÓN. Cada bloque falla por separado a `null` («no se sabe»), nunca a 0.
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import type { DatosInicio } from '@/lib/inicio-admin-reglas'

async function seguro<T>(etiqueta: string, f: () => Promise<T>): Promise<T | null> {
  try { return await f() } catch (e) { console.error(`[inicio-admin] ${etiqueta}`, e instanceof Error ? e.message : e); return null }
}

export async function datosInicio(empresaId: string, tieneFichaje: boolean): Promise<DatosInicio> {
  const [solicitudes, firmas, avisosFallidos, correosFallidos, fichajesAbiertos] = await Promise.all([
    seguro('solicitudes', async () => {
      const [cnt, recientes] = await Promise.all([
        prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT count(*)::int AS n FROM rrhh.solicitudes WHERE empresa_id = ${empresaId}::uuid AND estado = 'solicitada'`),
        prisma.$queryRaw<{ id: string; empleado: string; tipo: string }[]>(Prisma.sql`
          SELECT s.id::text AS id, TRIM(CONCAT(e.nombre, ' ', COALESCE(e.apellidos, ''))) AS empleado, s.tipo
          FROM rrhh.solicitudes s JOIN rrhh.empleados e ON e.id = s.empleado_id AND e.empresa_id = s.empresa_id
          WHERE s.empresa_id = ${empresaId}::uuid AND s.estado = 'solicitada' ORDER BY s.creada_at ASC LIMIT 3`),
      ])
      return { total: cnt[0]?.n ?? 0, recientes }
    }),
    seguro('firmas', async () => {
      const r = await prisma.$queryRaw<{ pendientes: number; espera_empresa: number; sin_abrir: number; dias: number | null }[]>(Prisma.sql`
        SELECT count(*) FILTER (WHERE estado_firma = 'pendiente')::int AS pendientes,
               count(*) FILTER (WHERE estado_firma = 'pendiente_empresa')::int AS espera_empresa,
               count(*) FILTER (WHERE estado_firma = 'pendiente' AND visto_empleado_at IS NULL)::int AS sin_abrir,
               (extract(day FROM now() - min(COALESCE(firma_solicitada_at, creada_at))))::int AS dias
        FROM rrhh.documentos WHERE empresa_id = ${empresaId}::uuid AND estado_firma IN ('pendiente', 'pendiente_empresa')`)
      const x = r[0]
      return { pendientes: x?.pendientes ?? 0, esperandoEmpresa: x?.espera_empresa ?? 0, sinAbrir: x?.sin_abrir ?? 0, masAntiguaDias: x?.dias ?? null }
    }),
    seguro('avisos', async () => (await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT count(*)::int AS n FROM rrhh.avisos WHERE empresa_id = ${empresaId}::uuid AND email_estado = 'error' AND creado_at >= now() - interval '7 days'`))[0]?.n ?? 0),
    seguro('correos', async () => (await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT count(*)::int AS n FROM rrhh.avisos_admin WHERE empresa_id = ${empresaId}::uuid AND visto_at IS NULL AND creado_at >= now() - interval '7 days'`))[0]?.n ?? 0),
    tieneFichaje
      ? seguro('fichajes', async () => (await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
          SELECT count(*)::int AS n FROM rrhh.fichajes WHERE empresa_id = ${empresaId}::uuid AND salida_at IS NULL AND entrada_at >= now() - interval '24 hours'`))[0]?.n ?? 0)
      : Promise.resolve(undefined),
  ])
  return { solicitudes, firmas, avisosFallidos, correosFallidos, fichajesAbiertos }
}

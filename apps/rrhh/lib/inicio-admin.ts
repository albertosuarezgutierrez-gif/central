// Lecturas del Inicio del responsable (`/admin`). Solo SELECT sobre tablas que ya existen (sin migración), siempre con el
// `empresa_id` de la SESIÓN. Cada bloque falla por separado a `null` («no se sabe»), nunca a 0.
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import type { DatosInicio } from '@/lib/inicio-admin-reglas'
import { DIAS_VENCIMIENTO, contratosQueVencen, hoyMadrid, lineaVencimiento } from '@/lib/vencimientos'
import { leerSinObligacion, listarObligaciones } from '@/lib/seguro-convenio-repo'

async function seguro<T>(etiqueta: string, f: () => Promise<T>): Promise<T | null> {
  try { return await f() } catch (e) { console.error(`[inicio-admin] ${etiqueta}`, e instanceof Error ? e.message : e); return null }
}

export async function datosInicio(empresaId: string, tieneFichaje: boolean): Promise<DatosInicio> {
  const hoy = hoyMadrid()
  const [solicitudes, firmas, avisosFallidos, correosFallidos, fichajesAbiertos, contratosVencen, seguroConvenio] = await Promise.all([
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
    // Contratos que vencen en ≤ 30 días: SOLO para el responsable (nunca un aviso al empleado; ver lib/vencimientos.ts).
    // Columnas de 0033: sin migración la consulta falla y la tarjeta dice «no se ha podido comprobar», no «ninguno».
    seguro('contratos', async () => {
      const [filas, sinFecha] = await Promise.all([
        prisma.$queryRaw<{ id: string; empleado_id: string; empleado: string; fecha_fin: string }[]>(Prisma.sql`
          SELECT c.id::text AS id, c.empleado_id::text AS empleado_id,
                 TRIM(CONCAT(e.nombre, ' ', COALESCE(e.apellidos, ''))) AS empleado, c.fecha_fin::text AS fecha_fin
          FROM rrhh.contratos_laborales c
          JOIN rrhh.empleados e ON e.id = c.empleado_id AND e.empresa_id = c.empresa_id
          WHERE c.empresa_id = ${empresaId}::uuid AND c.activo AND e.estado = 'activo' AND c.fecha_fin IS NOT NULL
            AND c.fecha_fin BETWEEN ${hoy}::date AND (${hoy}::date + ${DIAS_VENCIMIENTO}::int)
          ORDER BY c.fecha_fin LIMIT 50`),
        prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
          SELECT count(*)::int AS n FROM rrhh.contratos_laborales c
          WHERE c.empresa_id = ${empresaId}::uuid AND c.activo AND c.fecha_fin IS NULL AND c.duracion IS DISTINCT FROM 'indefinido'`),
      ])
      const vencen = contratosQueVencen(filas.map(f => ({ contratoId: f.id, empleadoId: f.empleado_id, empleado: f.empleado, fechaFin: f.fecha_fin })), hoy)
      return { lineas: vencen.map(lineaVencimiento), total: vencen.length, sinFecha: sinFecha[0]?.n ?? 0 }
    }),
    // Seguro obligatorio por convenio (migración 0036): sin las tablas, null → «no se ha podido comprobar», nunca «no obliga».
    seguro('seguro-convenio', async () => {
      const [obligaciones, sinObligacionAt] = await Promise.all([listarObligaciones(empresaId), leerSinObligacion(empresaId)])
      return { obligaciones, sinObligacionAt, hoy }
    }),
  ])
  return { solicitudes, firmas, avisosFallidos, correosFallidos, fichajesAbiertos, contratosVencen, seguroConvenio }
}

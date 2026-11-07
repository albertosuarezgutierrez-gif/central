// Lectura (Prisma) de las nóminas que alimentan el certificado de retenciones del portal /e. Movido aquí desde el emisor directo
// `lib/hechos-contabilidad.ts` (retirado el 07/11/2026 al unificar el envío en el outbox `rrhh.hechos_nominas`). SQL con empresa_id.
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

/** Nómina + empleado tal como la necesita `nominaAHecho` (con perceptor). */
export type FilaNominaCertificado = {
  id: string
  empleado_id: string
  periodo: string
  datos_calculo: unknown
  empleado_nombre: string | null
  empleado_apellidos: string | null
  empleado_dni: string | null
  empleado_provincia: string | null
}

export type DatosCertificado = {
  empresa: { nombre: string; nif: string | null }
  empleado: { nombre: string; dni: string | null }
  nominas: FilaNominaCertificado[]
}

/**
 * Nóminas CONFIRMADAS del año de UN empleado de UNA empresa (ambos de la sesión del empleado, nunca de la petición).
 * null = el empleado no existe en esa empresa.
 */
export async function leerDatosCertificado(empresaId: string, empleadoId: string, anio: number): Promise<DatosCertificado | null> {
  const emp = await prisma.$queryRaw<{ empresa_nombre: string; empresa_nif: string | null; nombre: string | null; apellidos: string | null; dni: string | null }[]>(Prisma.sql`
    SELECT em.nombre AS empresa_nombre, em.nif AS empresa_nif, e.nombre, e.apellidos, e.dni
    FROM rrhh.empleados e JOIN rrhh.empresas em ON em.id = e.empresa_id
    WHERE e.id = ${empleadoId}::uuid AND e.empresa_id = ${empresaId}::uuid LIMIT 1`)
  if (!emp[0]) return null
  const delAnio = `${anio}-%`
  const nominas = await prisma.$queryRaw<FilaNominaCertificado[]>(Prisma.sql`
    SELECT n.id::text AS id, n.empleado_id::text AS empleado_id, n.periodo, n.datos_calculo,
           e.nombre AS empleado_nombre, e.apellidos AS empleado_apellidos, e.dni AS empleado_dni, e.provincia AS empleado_provincia
    FROM rrhh.nominas n
    JOIN rrhh.empleados e ON e.id = n.empleado_id AND e.empresa_id = n.empresa_id
    WHERE n.empresa_id = ${empresaId}::uuid AND n.empleado_id = ${empleadoId}::uuid AND n.estado = 'confirmada'
      AND n.periodo LIKE ${delAnio}
    ORDER BY n.periodo`)
  const e = emp[0]
  return {
    empresa: { nombre: e.empresa_nombre, nif: e.empresa_nif },
    empleado: { nombre: [e.nombre, e.apellidos].map((x) => (x ?? '').trim()).filter(Boolean).join(' '), dni: e.dni },
    nominas,
  }
}

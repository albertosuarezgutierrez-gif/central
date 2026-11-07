import { redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import UiPage from '@/components/ui/Page'
import FiniquitoClient, { type EmpleadoFiniquito } from './FiniquitoClient'

export default async function Page() {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }

  // Solo para PRERRELLENAR (todo se puede corregir a mano). NULL = no se sabe: el campo queda vacío, no con un valor inventado.
  const empleados = await prisma.$queryRaw<EmpleadoFiniquito[]>(Prisma.sql`
    SELECT e.id::text AS id, TRIM(CONCAT(e.nombre, ' ', COALESCE(e.apellidos, ''))) AS nombre,
           COALESCE(c.fecha_inicio, e.fecha_alta)::text AS fecha_inicio, e.fecha_baja::text AS fecha_baja, e.motivo_baja,
           c.salario_base::float8 AS salario_base
    FROM rrhh.empleados e
    LEFT JOIN rrhh.contratos_laborales c ON c.empleado_id = e.id AND c.empresa_id = e.empresa_id AND c.activo
    WHERE e.empresa_id = ${empresa_id}::uuid
    ORDER BY e.nombre ASC
    LIMIT 500`)

  return (
    <UiPage
      titulo="Calcular finiquito"
      subtitulo="Cálculo orientativo: no da de baja ni comunica nada. Revísalo antes de entregarlo."
      volver={{ href: '/admin/nominas', texto: 'Nóminas' }}
      ancho="formulario"
    >
      <FiniquitoClient empleados={empleados} />
    </UiPage>
  )
}

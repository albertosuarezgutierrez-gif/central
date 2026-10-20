import { redirect, notFound } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { contratoActivoDeEmpleado } from '@/lib/contratos'
import ContratoForm from './ContratoForm'
import UiPage from '@/components/ui/Page'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }

  const { id } = await params
  const empRows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, nombre FROM rrhh.empleados WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1`)
  if (!empRows[0]) notFound()

  const contrato = await contratoActivoDeEmpleado(empresa_id, id)
  const contratoSerial = contrato ? JSON.parse(JSON.stringify(contrato)) : null

  return (
    <UiPage titulo="Contrato laboral" volver={{ href: `/admin/empleados/${id}`, texto: empRows[0].nombre }} ancho="formulario">
      <ContratoForm empleadoId={id} inicial={contratoSerial} />
    </UiPage>
  )
}

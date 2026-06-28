import { redirect, notFound } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { contratoActivoDeEmpleado } from '@/lib/contratos'
import ContratoForm from './ContratoForm'
import AdminShell from '@/components/AdminShell'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }

  const { id } = await params
  const emp = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, nombre FROM rrhh.empleados WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1`)
  if (!emp[0]) notFound()

  const contrato = await contratoActivoDeEmpleado(empresa_id, id)

  const contratoSerial = contrato ? JSON.parse(JSON.stringify(contrato)) : null

  return (
    <AdminShell activo="empleados">
      <a href={`/admin/empleados/${id}`} className="text-ink-3 text-sm no-underline hover:underline">← {emp[0].nombre}</a>
      <h1 className="text-2xl mt-1">Contrato laboral</h1>
      <ContratoForm empleadoId={id} inicial={contratoSerial} />
    </AdminShell>
  )
}

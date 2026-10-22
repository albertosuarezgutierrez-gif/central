import { redirect, notFound } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { ACTOR_GESTOR } from '@/lib/carpetas'
import { listarExpediente } from '@/lib/documental'
import ExpedienteClient from './ExpedienteClient'
import Card from '@/components/ui/Card'
import MaterialAdminLista from '@/components/MaterialAdminLista'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  const { id } = await params
  const empRows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, nombre, apellidos, email, puesto, dni, nss, telefono, estado,
             domicilio, localidad, provincia, fecha_nacimiento, estado_civil,
             tipo_contrato, centro_trabajo, cuenta_cotizacion, categoria,
             grupo_cotizacion, tipo_jornada, coche, matricula, fecha_alta,
             fecha_reconocimiento_medico, notas
      FROM rrhh.empleados WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1`)
  if (!empRows[0]) notFound()
  const { carpetas, documentos } = { carpetas: (await import('@/lib/carpetas')).CARPETAS, documentos: await listarExpediente(empresa_id, id, ACTOR_GESTOR) }
  return (
    <>
      <ExpedienteClient empleado={JSON.parse(JSON.stringify(empRows[0]))} carpetas={carpetas} inicial={JSON.parse(JSON.stringify(documentos))} />
      {/* El empleado ya está comprobado como de ESTA empresa (consulta de arriba); la API vuelve a filtrar por la sesión. */}
      <Card as="section" className="my-3 min-w-0">
        <h2 className="mb-2 text-base">Material</h2>
        <MaterialAdminLista empleadoId={id} />
      </Card>
    </>
  )
}

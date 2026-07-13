import { redirect, notFound } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { ACTOR_GESTOR } from '@/lib/carpetas'
import { listarExpediente } from '@/lib/documental'
import { listarPlantillas } from '@/lib/plantillas'
import { getBranding } from '@/lib/empresa'
import ExpedienteClient from './ExpedienteClient'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  const { id } = await params
  const [empRows, branding] = await Promise.all([
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, nombre, apellidos, email, puesto, dni, nss, telefono, estado,
             domicilio, localidad, provincia, fecha_nacimiento, estado_civil,
             tipo_contrato, centro_trabajo, cuenta_cotizacion, categoria,
             grupo_cotizacion, tipo_jornada, fecha_alta, acceso_token,
             fecha_reconocimiento_medico
      FROM rrhh.empleados WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1`),
    getBranding(empresa_id),
  ])
  if (!empRows[0]) notFound()
  const { carpetas, documentos } = { carpetas: (await import('@/lib/carpetas')).CARPETAS, documentos: await listarExpediente(empresa_id, id, ACTOR_GESTOR) }
  return <ExpedienteClient empleado={JSON.parse(JSON.stringify(empRows[0]))} carpetas={carpetas} inicial={JSON.parse(JSON.stringify(documentos))} plantillas={listarPlantillas()} logoUrl={branding.logo_url} nombreEmpresa={branding.nombre} colorPrimario={branding.color_primario} tieneFichaje={branding.tiene_fichaje} />
}

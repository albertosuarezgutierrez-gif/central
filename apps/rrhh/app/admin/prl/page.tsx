import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { getBranding } from '@/lib/empresa'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import AdminShell from '@/components/AdminShell'
import PrlPanel from './PrlPanel'

export const metadata = { title: 'PRL — Prevención de Riesgos Laborales' }

export default async function Page() {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }

  const [branding, empleados] = await Promise.all([
    getBranding(empresa_id),
    prisma.$queryRaw<{ id: string; nombre: string; apellidos: string | null; dni: string | null; puesto: string | null; centro_trabajo: string | null }[]>(
      Prisma.sql`SELECT id, nombre, apellidos, dni, puesto, centro_trabajo
                 FROM rrhh.empleados WHERE empresa_id = ${empresa_id}::uuid AND estado = 'activo'
                 ORDER BY COALESCE(apellidos, nombre), nombre`
    ),
  ])

  return (
    <AdminShell activo="prl" logoUrl={branding.logo_url} nombreEmpresa={branding.nombre} colorPrimario={branding.color_primario} tieneFichaje={branding.tiene_fichaje}>
      <h1 className="mb-1 text-xl font-semibold">Prevención de Riesgos Laborales</h1>
      <p className="text-ink-3 mb-6 text-sm">Genera documentos PRL personalizados para cada empleado. La empresa los firma primero y el empleado los recibe en su portal para firmar.</p>
      <PrlPanel empleados={empleados} />
    </AdminShell>
  )
}

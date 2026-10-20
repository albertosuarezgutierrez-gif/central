import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import UiPage from '@/components/ui/Page'
import PrlPanel from './PrlPanel'

export const metadata = { title: 'PRL — Prevención de Riesgos Laborales' }

export default async function Page() {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }

  const empleados = await prisma.$queryRaw<{ id: string; nombre: string; apellidos: string | null; dni: string | null; puesto: string | null; centro_trabajo: string | null }[]>(
      Prisma.sql`SELECT id, nombre, apellidos, dni, puesto, centro_trabajo
                 FROM rrhh.empleados WHERE empresa_id = ${empresa_id}::uuid AND estado = 'activo'
                 ORDER BY COALESCE(apellidos, nombre), nombre`
    )

  return (
    <UiPage
      titulo="Prevención de Riesgos Laborales"
      subtitulo="Genera documentos PRL personalizados para cada empleado. La empresa los firma primero y el empleado los recibe en su portal para firmar."
    >
      <PrlPanel empleados={empleados} />
    </UiPage>
  )
}

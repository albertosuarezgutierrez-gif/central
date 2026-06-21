import { redirect } from 'next/navigation'
import { getEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import PmsNuevoClient from './PmsNuevoClient'

export default async function PmsNuevoPage({
  searchParams
}: {
  searchParams: Promise<{ cliente_id?: string }>
}) {
  const empresa_id = await getEmpresaId()
  if (!empresa_id) redirect('/login')

  const { cliente_id } = await searchParams

  // Cargar clientes activos de la empresa
  const clientes = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, nombre, tipo FROM clientes
    WHERE empresa_id = ${empresa_id}::uuid AND activo = true
    ORDER BY nombre ASC
  `)

  // Si viene con cliente_id preseleccionado, verificar que pertenece a la empresa
  let clientePresel = null
  if (cliente_id) {
    const found = clientes.find((c: any) => c.id === cliente_id)
    if (found) clientePresel = found
  }

  return (
    <PmsNuevoClient
      clientes={clientes}
      clientePreseleccionado={clientePresel}
    />
  )
}

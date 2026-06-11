import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { listarCategorias } from '@/lib/comunicacion'
import ComunicacionClient from './ComunicacionClient'

export const dynamic = 'force-dynamic'

// Hub de comunicación del dueño (F0.5). Carga sus negocios (para elegir destinatario)
// y sus categorías; el resto es interacción por API en el cliente.
export default async function ComunicacionPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sociedades = await prisma.sociedad.findMany({
    where: { cuentaId: session.id },
    include: { negocios: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })
  const negocios = sociedades.flatMap(s =>
    s.negocios
      .filter(n => n.app && n.refExt)
      .map(n => ({ id: n.id, nombre: n.nombre, app: n.app as string, refExt: n.refExt as string, sector: n.sector })),
  )
  const categorias = await listarCategorias(session.id)

  return <ComunicacionClient operador={session.nombre} negocios={negocios} categorias={categorias} />
}

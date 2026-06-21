import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import ConfigClient from './ConfigClient'

export const dynamic = 'force-dynamic'

// Configuración de comunicación del dueño (F0.6): categorías y grupos.
export default async function ConfigPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sociedades = await prisma.sociedad.findMany({
    where: { cuentaId: session.id },
    include: { negocios: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })
  const negocios = sociedades.flatMap(s =>
    s.negocios.map(n => ({ id: n.id, nombre: n.nombre, app: n.app, refExt: n.refExt })),
  )

  return <ConfigClient negocios={negocios} />
}

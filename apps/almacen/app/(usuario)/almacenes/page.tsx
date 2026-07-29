import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import AlmacenesClient from './almacenes-client'

export const dynamic = 'force-dynamic'

export default async function AlmacenesPage() {
  const s = await getSession()
  if (!s) redirect('/login')
  const espacios = await prisma.almacenEspacio.findMany({
    where: { cuentaId: s.id, activo: true },
    orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
    select: { id: true, nombre: true, tipo: true, direccion: true, personaContacto: true, telefono: true },
  })
  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Almacenes</h1>
          <div className="sub">Central y haciendas — stock por almacén</div>
        </div>
        <span className="count-pill">{espacios.length}</span>
      </div>
      <AlmacenesClient espacios={espacios} />
    </main>
  )
}

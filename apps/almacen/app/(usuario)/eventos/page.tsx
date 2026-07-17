import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import EventosClient, { type EventoRow } from './eventos-client'

export const dynamic = 'force-dynamic'

export default async function EventosPage() {
  const s = await getSession()
  if (!s) redirect('/login')
  const raw = await prisma.almacenEvento.findMany({
    where: { cuentaId: s.id },
    orderBy: [{ fechaInicio: 'desc' }],
    take: 300,
  })
  const eventos: EventoRow[] = raw.map((e) => ({
    id: e.id, tipo: e.tipo, titulo: e.titulo, clienteNombre: e.clienteNombre, lugar: e.lugar,
    fechaInicio: e.fechaInicio.toISOString(), fechaFin: e.fechaFin.toISOString(), estado: e.estado,
  }))
  const activos = eventos.filter((e) => e.estado === 'confirmado' || e.estado === 'entregado').length

  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Eventos y alquileres</h1>
          <div className="sub">Reserva de material por evento — con prioridad sobre el resto</div>
        </div>
        {activos > 0 && <span className="count-pill">{activos} activo{activos === 1 ? '' : 's'}</span>}
      </div>
      <EventosClient eventos={eventos} />
    </main>
  )
}

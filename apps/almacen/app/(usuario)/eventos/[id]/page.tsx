import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import EventoDetalle, { type Linea } from './evento-detalle'
import Comentarios from '../../comentarios'

export const dynamic = 'force-dynamic'

const fmt = (d: Date) => d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })

export default async function EventoPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession()
  if (!s) redirect('/login')
  const { id } = await params

  const evento = await prisma.almacenEvento.findFirst({ where: { id, cuentaId: s.id } })
  if (!evento) notFound()

  const [lineas, materiales, espacios] = await Promise.all([
    prisma.$queryRaw<Linea[]>(Prisma.sql`
      SELECT el.id, m.nombre AS "materialNombre", e.nombre AS "espacioNombre",
             el.cantidad, el.entregada, el.devuelta, el.danada
      FROM almacen_evento_lineas el
      JOIN almacen_materiales m ON m.id = el.material_id
      JOIN almacen_espacios e ON e.id = el.espacio_id
      WHERE el.evento_id = ${id}::uuid AND el.cuenta_id = ${s.id}::uuid
      ORDER BY el.created_at ASC
    `),
    prisma.almacenMaterial.findMany({ where: { cuentaId: s.id, activo: true }, orderBy: [{ nombre: 'asc' }], select: { id: true, nombre: true } }),
    prisma.almacenEspacio.findMany({ where: { cuentaId: s.id, activo: true }, orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }], select: { id: true, nombre: true } }),
  ])

  return (
    <main>
      <div className="page-head">
        <div>
          <div className="crumb"><Link href="/eventos">Eventos</Link> ›</div>
          <h1>{evento.titulo}</h1>
          <div className="sub">
            {evento.tipo} · {fmt(evento.fechaInicio)}–{fmt(evento.fechaFin)}
            {evento.clienteNombre ? ` · ${evento.clienteNombre}` : ''}{evento.lugar ? ` · ${evento.lugar}` : ''}
          </div>
        </div>
      </div>

      <EventoDetalle
        evento={{ id: evento.id, tipo: evento.tipo, titulo: evento.titulo, estado: evento.estado }}
        lineas={lineas}
        materiales={materiales}
        espacios={espacios}
      />

      <Comentarios entidadTipo="evento" entidadId={evento.id} />
    </main>
  )
}

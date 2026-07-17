import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import EditarFicha from './editar-ficha'
import Comentarios from '../../comentarios'

export const dynamic = 'force-dynamic'

type StockRow = { material_id: string; nombre: string; categoria: string; disponible: number; en_transito: number }

export default async function AlmacenDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession()
  if (!s) redirect('/login')
  const { id } = await params

  const espacio = await prisma.almacenEspacio.findFirst({
    where: { id, cuentaId: s.id, activo: true },
    select: { id: true, nombre: true, tipo: true, direccion: true, personaContacto: true, telefono: true, email: true, notas: true },
  })
  if (!espacio) notFound()

  const stock = await prisma.$queryRaw<StockRow[]>(Prisma.sql`
    SELECT s.material_id, m.nombre, m.categoria, s.disponible, s.en_transito
    FROM almacen_stock s
    JOIN almacen_materiales m ON m.id = s.material_id
    WHERE s.espacio_id = ${id}::uuid AND s.cuenta_id = ${s.id}::uuid
      AND (s.disponible > 0 OR s.en_transito > 0)
    ORDER BY m.nombre ASC
  `)
  const unidades = stock.reduce((a, r) => a + r.disponible, 0)
  const enTransito = stock.reduce((a, r) => a + r.en_transito, 0)

  return (
    <main>
      <div className="page-head">
        <div>
          <div className="crumb"><Link href="/almacenes">Almacenes</Link> ›</div>
          <h1>{espacio.nombre}</h1>
          <div className="sub">{unidades} uds disponibles{enTransito > 0 ? ` · ${enTransito} en tránsito` : ''}</div>
        </div>
      </div>

      <EditarFicha espacio={espacio} />

      <div className="card">
        <div className="card-title">Stock en este almacén</div>
        {stock.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>Sin material en este almacén todavía.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Familia</th>
                  <th className="num">Disponible</th>
                  <th className="num">En tránsito</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((r) => (
                  <tr key={r.material_id}>
                    <td className="cell-strong"><Link href={`/materiales/${r.material_id}`} style={{ color: 'inherit' }}>{r.nombre}</Link></td>
                    <td className="muted">{r.categoria}</td>
                    <td className="num">{r.disponible}</td>
                    <td className="num">{r.en_transito || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Comentarios entidadTipo="espacio" entidadId={espacio.id} />
    </main>
  )
}

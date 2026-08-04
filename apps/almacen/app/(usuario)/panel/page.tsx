import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

type EspacioRow = { id: string; nombre: string; tipo: string; unidades: number }

export default async function PanelPage() {
  const s = await getSession()
  if (!s) redirect('/login')

  const [unidadesPorEspacio, bajoMinimo, pendientes] = await Promise.all([
    prisma.$queryRaw<EspacioRow[]>(Prisma.sql`
      SELECT e.id, e.nombre, e.tipo,
             COALESCE(SUM(s.disponible), 0)::int AS unidades
      FROM almacen_espacios e
      LEFT JOIN almacen_stock s ON s.espacio_id = e.id
      WHERE e.cuenta_id = ${s.id}::uuid AND e.activo
      GROUP BY e.id, e.nombre, e.tipo
      ORDER BY e.tipo = 'central' DESC, e.nombre ASC
    `),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT count(*)::int AS n FROM almacen_materiales
      WHERE cuenta_id = ${s.id}::uuid AND activo
        AND stock_minimo IS NOT NULL AND cantidad_disponible < stock_minimo
    `),
    prisma.almacenTransferencia.count({ where: { cuentaId: s.id, estado: 'pendiente' } }),
  ])

  const nBajoMinimo = Number(bajoMinimo[0]?.n ?? 0)

  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Panel</h1>
          <div className="sub">Control de almacén — visión general</div>
        </div>
      </div>

      <div className="kpi-grid">
        <Link href="/transferencias" className="kpi kpi-link">
          <div className="kpi-label">Traspasos pendientes</div>
          <div className="kpi-value">{pendientes}</div>
          <div className="kpi-sub">por confirmar recepción</div>
        </Link>
        <Link href="/materiales" className="kpi kpi-link">
          <div className="kpi-label">Bajo mínimo</div>
          <div className="kpi-value">{nBajoMinimo}</div>
          <div className="kpi-sub">materiales a reponer</div>
        </Link>
      </div>

      <div className="card">
        <div className="card-title">Stock por almacén</div>
        {unidadesPorEspacio.length === 0 ? (
          <div className="empty">
            <span className="emoji">🏬</span>
            <div className="title">Aún no hay almacenes</div>
            <div>Crea el primero en <Link href="/almacenes" style={{ color: 'var(--accent-ink)' }}>Almacenes</Link>.</div>
          </div>
        ) : (
          <ul className="rows">
            {unidadesPorEspacio.map((e) => (
              <li key={e.id} className="row">
                <Link href={`/almacenes/${e.id}`} className="row-name" style={{ color: 'inherit' }}>{e.nombre}</Link>
                {e.tipo === 'central' && <span className="badge ok">central</span>}
                <span className="cell-strong" style={{ marginLeft: 'auto' }}>{e.unidades} uds</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}

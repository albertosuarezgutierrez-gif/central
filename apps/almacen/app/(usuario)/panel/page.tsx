import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { eur } from '@/lib/format'

export const dynamic = 'force-dynamic'

type ValorEspacio = { id: string; nombre: string; tipo: string; valor: number; unidades: number }

export default async function PanelPage() {
  const s = await getSession()
  if (!s) redirect('/login')

  const [valorPorEspacio, bajoMinimo, pendientes] = await Promise.all([
    prisma.$queryRaw<ValorEspacio[]>(Prisma.sql`
      SELECT e.id, e.nombre, e.tipo,
             COALESCE(SUM(s.disponible * m.coste_reposicion), 0)::float8 AS valor,
             COALESCE(SUM(s.disponible), 0)::int AS unidades
      FROM almacen_espacios e
      LEFT JOIN almacen_stock s ON s.espacio_id = e.id
      LEFT JOIN almacen_materiales m ON m.id = s.material_id AND m.activo
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

  const valorTotal = valorPorEspacio.reduce((a, e) => a + Number(e.valor), 0)
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
        <div className="kpi">
          <div className="kpi-label">Valor del inventario</div>
          <div className="kpi-value">{eur(valorTotal)}</div>
          <div className="kpi-sub">{valorPorEspacio.length} almacén{valorPorEspacio.length === 1 ? '' : 'es'}</div>
        </div>
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
        <div className="card-title">Valor por almacén</div>
        {valorPorEspacio.length === 0 ? (
          <div className="empty">
            <span className="emoji">🏬</span>
            <div className="title">Aún no hay almacenes</div>
            <div>Crea el primero en <Link href="/almacenes" style={{ color: 'var(--accent-ink)' }}>Almacenes</Link>.</div>
          </div>
        ) : (
          <ul className="rows">
            {valorPorEspacio.map((e) => (
              <li key={e.id} className="row">
                <Link href={`/almacenes/${e.id}`} className="row-name" style={{ color: 'inherit' }}>{e.nombre}</Link>
                {e.tipo === 'central' && <span className="badge ok">central</span>}
                <span className="muted" style={{ marginLeft: 'auto' }}>{e.unidades} uds</span>
                <span className="cell-strong" style={{ minWidth: 96, textAlign: 'right' }}>{eur(Number(e.valor))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}

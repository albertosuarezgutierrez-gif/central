import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { ayudasVigentes, diasRestantes } from '@/lib/ayudas'

export const dynamic = 'force-dynamic'

type EspacioRow = { id: string; nombre: string; tipo: string; unidades: number }

export default async function PanelPage() {
  const s = await getSession()
  if (!s) redirect('/login')

  const [unidadesPorEspacio, bajoMinimo, pendientes, ayudas] = await Promise.all([
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
    ayudasVigentes(s.id),
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

      {ayudas.map((a) => {
        const dias = diasRestantes(a.plazo_fin)
        const plazo = dias == null ? 'plazo por confirmar' : dias === 0 ? '¡el plazo acaba hoy!' : `quedan ${dias} días`
        return (
          <div key={a.id} className="card" style={{ marginBottom: 14, borderLeft: '4px solid var(--brand)', background: 'var(--brand-soft)' }}>
            <div className="card-title">💶 Ayuda con plazo abierto</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>
              <strong>{a.titulo}</strong>
              {a.organismo && <> · {a.organismo}</>}
              {a.cuantia_texto && <> · <strong>{a.cuantia_texto}</strong></>}
              {' · '}
              <span className={dias != null && dias <= 15 ? 'badge danger' : 'badge warn'}>{plazo}</span>
            </div>
            {a.encaje && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{a.encaje}</div>}
            {a.url && (
              <div style={{ marginTop: 6 }}>
                <a href={a.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-ink)' }}>Ver la convocatoria</a>
              </div>
            )}
          </div>
        )
      })}

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

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getDashboard } from '@/lib/alquiler-repo'
import { eur } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const d = await getDashboard(session.id)
  const ingresosTotales = d.resumen.ingresosTerceros + d.resumen.totalInterno

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
      <div className="card">
        <div className="muted">Alquileres activos</div>
        <div className="kpi">{d.resumen.activos}</div>
        <div className="muted">reservados + entregados</div>
      </div>
      <div className="card">
        <div className="muted">Ingresos a terceros</div>
        <div className="kpi">{eur(d.resumen.ingresosTerceros)}</div>
        <div className="muted">externo facturable</div>
      </div>
      <div className="card" style={{ borderColor: 'var(--accent)' }}>
        <div className="muted">🔗 Intercompany</div>
        <div className="kpi">{eur(d.intercompany)}</div>
        <div className="muted">interno (se elimina en el consolidado)</div>
      </div>
      <div className="card">
        <div className="muted">Fianzas retenidas</div>
        <div className="kpi">{eur(d.resumen.fianzasRetenidas)}</div>
        <div className="muted">material entregado</div>
      </div>

      {/* Disponibilidad de material */}
      <div className="card" style={{ gridColumn: '1 / 3' }}>
        <h3 style={{ marginTop: 0 }}>Disponibilidad de material (hoy)</h3>
        <p className="muted" style={{ marginTop: -6 }}>
          {d.stock.materiales} materiales · {d.stock.unidadesTotales} unidades ·{' '}
          {d.stock.unidadesComprometidas} en uso · {d.stock.unidadesDisponibles} libres
        </p>
        {d.materiales.length === 0 ? (
          <p className="muted">Aún no hay catálogo. Carga tus materiales para ver disponibilidad.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th>Stock</th>
                <th>En uso hoy</th>
                <th>Disponible</th>
              </tr>
            </thead>
            <tbody>
              {d.materiales.map((m) => (
                <tr key={m.id}>
                  <td>{m.nombre}</td>
                  <td>{m.stockTotal}</td>
                  <td>{m.comprometidoHoy}</td>
                  <td>
                    <span className={`badge ${m.disponibleHoy > 0 ? 'ok' : 'warn'}`}>{m.disponibleHoy}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Alquileres recientes */}
      <div className="card" style={{ gridColumn: '3 / 5' }}>
        <h3 style={{ marginTop: 0 }}>Alquileres recientes</h3>
        {d.alquileresConTotal.length === 0 ? (
          <p className="muted">Sin alquileres todavía.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {d.alquileresConTotal.slice(0, 8).map(({ alquiler: a, total }) => (
                <tr key={a.id}>
                  <td>{a.clienteNombre || (a.aTerceros ? 'Tercero' : 'Interno')}</td>
                  <td>{a.aTerceros ? 'terceros' : 'interno'}</td>
                  <td>{a.estado}</td>
                  <td>{eur(total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ gridColumn: '1 / 5' }}>
        <span className="muted">
          Ingreso total del negocio de alquiler: <strong>{eur(ingresosTotales)}</strong> · de los cuales{' '}
          <strong>{eur(d.intercompany)}</strong> son internos del holding (se eliminan en el consolidado
          de plataforma; no son ingreso real del grupo).
        </span>
      </div>
    </div>
  )
}

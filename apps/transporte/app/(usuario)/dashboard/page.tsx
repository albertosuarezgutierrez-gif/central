import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getDashboard } from '@/lib/transporte-repo'
import { eur } from '@/lib/format'

export const dynamic = 'force-dynamic'

const badgeDoc: Record<string, string> = { por_caducar: 'warn', caducado: 'danger', vigente: 'ok' }

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const d = await getDashboard(session.id)
  const ingresosTotales = d.resumen.ingresosTerceros + d.resumen.totalInterno

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
      {/* KPIs */}
      <div className="card">
        <div className="muted">Vehículos</div>
        <div className="kpi">{d.vehiculos.length}</div>
        <div className="muted">{d.vehiculos.filter((v) => v.esPropio).length} propios</div>
      </div>
      <div className="card">
        <div className="muted">Servicios activos</div>
        <div className="kpi">{d.resumen.activos}</div>
        <div className="muted">{d.servicios.length} en total</div>
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

      {/* Semáforo documental */}
      <div className="card" style={{ gridColumn: '1 / 3' }}>
        <h3 style={{ marginTop: 0 }}>Semáforo documental (ITV / seguro / permisos)</h3>
        {/* Un vehículo sin documentos REGISTRADOS no genera alerta, así que
            antes salía «Todo en regla ✅»: el camión con la ITV sin dar de alta
            —el más peligroso— era precisamente el que se veía verde. */}
        {d.sinDocumentar.length > 0 && (
          <p style={{ color: 'var(--warn, #d97706)', fontWeight: 600, margin: '0 0 8px' }}>
            🟠 {d.sinDocumentar.length} vehículo(s) sin ITV o seguro registrados en el sistema —{' '}
            no es que estén en regla, es que no consta el documento:{' '}
            {d.sinDocumentar.map((v) => `${v.matricula} (falta ${v.faltan.join(' y ')})`).join(', ')}.
          </p>
        )}
        {d.alertas.length === 0 ? (
          <p className="muted">
            {d.sinDocumentar.length > 0
              ? 'Sin caducidades próximas entre los documentos que SÍ constan.'
              : 'Sin caducidades próximas. Todo en regla. ✅'}
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Documento</th>
                <th>Caduca</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {d.alertas.map((a) => (
                <tr key={a.documentoId}>
                  <td>{a.tipo}</td>
                  <td>{a.fechaCaducidad}</td>
                  <td>
                    <span className={`badge ${badgeDoc[a.estado] ?? 'warn'}`}>
                      {a.estado === 'caducado'
                        ? `caducado (${-a.diasParaCaducar}d)`
                        : `${a.diasParaCaducar}d`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Rentabilidad por vehículo */}
      <div className="card" style={{ gridColumn: '3 / 5' }}>
        <h3 style={{ marginTop: 0 }}>Rentabilidad por vehículo</h3>
        {d.rentabilidad.length === 0 ? (
          <p className="muted">Aún no hay vehículos. Añade tu flota para ver márgenes.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Vehículo</th>
                <th>Portes</th>
                <th>Ingresos</th>
                <th>Margen</th>
              </tr>
            </thead>
            <tbody>
              {d.rentabilidad.map(({ vehiculo, rent }) => (
                <tr key={vehiculo.id}>
                  <td>{vehiculo.nombre}</td>
                  <td>{rent.nPortes}</td>
                  <td>{eur(rent.ingresos)}</td>
                  <td className={rent.margen >= 0 ? 'badge ok' : 'badge danger'}>
                    {eur(rent.margen)} ({rent.margenPct}%)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Resumen de grupo */}
      <div className="card" style={{ gridColumn: '1 / 5' }}>
        <span className="muted">
          Ingreso total del negocio de transporte: <strong>{eur(ingresosTotales)}</strong> ·
          de los cuales <strong>{eur(d.intercompany)}</strong> son internos del holding (no son
          ingreso real del grupo: se eliminan en el consolidado de plataforma).
        </span>
      </div>
    </div>
  )
}

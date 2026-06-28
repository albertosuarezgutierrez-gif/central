import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { margenesDeServicios, listVehiculos, listPortesDeServicios, type PorteView } from '@/lib/transporte-repo'
import { eur } from '@/lib/format'
import { NuevoServicio, EditServicio, EditarPortes, DeleteButton } from '../_forms'

export const dynamic = 'force-dynamic'

const badgeEstado: Record<string, string> = {
  presupuestado: 'warn',
  planificado: 'warn',
  en_curso: 'warn',
  entregado: 'ok',
  facturado: 'ok',
  cancelado: 'danger',
}

export default async function ServiciosPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const [filas, vehiculos, portes] = await Promise.all([
    margenesDeServicios(session.id),
    listVehiculos(session.id),
    listPortesDeServicios(session.id),
  ])
  const vehOpts = vehiculos.map((v) => ({ id: v.id, nombre: v.nombre }))
  const portesPorServicio: Record<string, PorteView[]> = {}
  for (const p of portes) {
    if (p.servicioId) (portesPorServicio[p.servicioId] ??= []).push(p)
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Servicios de transporte</h2>
      <NuevoServicio />
      {filas.length === 0 ? (
        <p className="muted">
          No hay servicios todavía. Un servicio puede ser <strong>a terceros</strong> (ingreso real)
          o <strong>interno</strong> entre sociedades del holding (se elimina en el consolidado).
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Cliente / ruta</th>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Importe</th>
              <th>Coste</th>
              <th>Margen</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ servicio: s, margen: m }) => (
              <tr key={s.id}>
                <td>
                  {s.clienteNombre || 'Sin cliente'}
                  {s.origen || s.destino ? (
                    <div className="muted">
                      {s.origen || '?'} → {s.destino || '?'}
                    </div>
                  ) : null}
                </td>
                <td>{s.fecha}</td>
                <td>
                  {s.aTerceros ? (
                    <span className="badge ok">terceros</span>
                  ) : (
                    <span className="badge" style={{ background: 'rgba(79,140,255,0.15)', color: 'var(--accent)' }}>
                      interno
                    </span>
                  )}
                </td>
                <td>
                  <span className={`badge ${badgeEstado[s.estado] ?? 'warn'}`}>{s.estado}</span>
                </td>
                <td>{eur(m.ingreso)}</td>
                <td>{eur(m.coste)}</td>
                <td className={m.margen >= 0 ? 'badge ok' : 'badge danger'}>
                  {eur(m.margen)} ({m.margenPct}%)
                </td>
                <td>
                  <EditarPortes servicioId={s.id} portes={portesPorServicio[s.id] ?? []} vehiculos={vehOpts} />
                  <EditServicio s={s} />
                  <DeleteButton endpoint="/api/servicios" id={s.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

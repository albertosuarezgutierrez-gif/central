import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { listVehiculos, listDocumentos } from '@/lib/transporte-repo'
import { alertasDocumentos } from '@central/module-flota'
import { eur2 } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function FlotaPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const [vehiculos, documentos] = await Promise.all([
    listVehiculos(session.id),
    listDocumentos(session.id),
  ])
  const hoyISO = new Date().toISOString().slice(0, 10)

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Flota</h2>
      {vehiculos.length === 0 ? (
        <p className="muted">
          No hay vehículos todavía. Aplica la migración{' '}
          <code>prisma/sql/2026-06-26_transporte_schema.sql</code> y carga tu flota.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Vehículo</th>
              <th>Matrícula</th>
              <th>Tipo</th>
              <th>Capacidad</th>
              <th>Modelo</th>
              <th>Tarifa</th>
              <th>Documental</th>
            </tr>
          </thead>
          <tbody>
            {vehiculos.map((v) => {
              const alertas = alertasDocumentos(
                documentos.filter((d) => d.vehiculoId === v.id),
                hoyISO,
              )
              const peor = alertas.find((a) => a.estado === 'caducado') ?? alertas[0]
              return (
                <tr key={v.id}>
                  <td>{v.nombre}</td>
                  <td>{v.matricula || '—'}</td>
                  <td>{v.tipo}</td>
                  <td>
                    {v.capacidadKg ? `${v.capacidadKg} kg` : ''}
                    {v.capacidadM3 ? ` · ${v.capacidadM3} m³` : ''}
                    {!v.capacidadKg && !v.capacidadM3 ? '—' : ''}
                  </td>
                  <td>{v.esPropio ? 'Propio' : `Subcontrata${v.proveedorTransporte ? ` · ${v.proveedorTransporte}` : ''}`}</td>
                  <td>
                    {v.tarifaKm ? `${eur2(v.tarifaKm)}/km` : ''}
                    {v.tarifaFija ? ` + ${eur2(v.tarifaFija)}` : ''}
                    {!v.tarifaKm && !v.tarifaFija ? '—' : ''}
                  </td>
                  <td>
                    {!peor ? (
                      <span className="badge ok">en regla</span>
                    ) : (
                      <span className={`badge ${peor.estado === 'caducado' ? 'danger' : 'warn'}`}>
                        {peor.tipo} {peor.estado === 'caducado' ? 'caducado' : `${peor.diasParaCaducar}d`}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

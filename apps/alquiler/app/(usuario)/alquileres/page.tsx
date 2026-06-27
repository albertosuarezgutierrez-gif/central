import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { listAlquileres } from '@/lib/alquiler-repo'
import { totalAlquiler, diasAlquiler } from '@central/module-alquiler'
import { eur } from '@/lib/format'

export const dynamic = 'force-dynamic'

const badgeEstado: Record<string, string> = {
  reservado: 'warn',
  entregado: 'ok',
  devuelto: 'ok',
  cancelado: 'danger',
}

export default async function AlquileresPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const alquileres = await listAlquileres(session.id)

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Alquileres</h2>
      {alquileres.length === 0 ? (
        <p className="muted">
          No hay alquileres todavía. Un alquiler puede ser <strong>a terceros</strong> (ingreso real) o
          <strong> interno</strong> entre sociedades del holding (se elimina en el consolidado).
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Fechas</th>
              <th>Días</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Líneas</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {alquileres.map((a) => (
              <tr key={a.id}>
                <td>{a.clienteNombre || (a.aTerceros ? 'Tercero' : 'Interno')}</td>
                <td>
                  {a.fechaInicio} → {a.fechaFin}
                </td>
                <td>{diasAlquiler(a.fechaInicio, a.fechaFin)}</td>
                <td>
                  {a.aTerceros ? (
                    <span className="badge ok">terceros</span>
                  ) : (
                    <span className="badge" style={{ background: 'rgba(79,140,255,0.15)', color: 'var(--accent)' }}>
                      interno
                    </span>
                  )}
                </td>
                <td>
                  <span className={`badge ${badgeEstado[a.estado] ?? 'warn'}`}>{a.estado}</span>
                </td>
                <td>{a.lineas.length}</td>
                <td>{eur(totalAlquiler(a))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { listMateriales } from '@/lib/alquiler-repo'
import { eur2 } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function MaterialesPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const materiales = await listMateriales(session.id)

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Catálogo de material</h2>
      {materiales.length === 0 ? (
        <p className="muted">
          No hay materiales todavía. Aplica la migración{' '}
          <code>prisma/sql/2026-06-27_alquiler_schema.sql</code> y carga tu catálogo.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Material</th>
              <th>Categoría</th>
              <th>Stock</th>
              <th>Tarifa/día</th>
              <th>Fianza/ud</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {materiales.map((m) => (
              <tr key={m.id}>
                <td>{m.nombre}</td>
                <td>{m.categoria || '—'}</td>
                <td>{m.stockTotal}</td>
                <td>{m.tarifaDia ? eur2(m.tarifaDia) : '—'}</td>
                <td>{m.fianzaUnit ? eur2(m.fianzaUnit) : '—'}</td>
                <td>
                  <span className={`badge ${m.activo ? 'ok' : 'warn'}`}>{m.activo ? 'activo' : 'baja'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

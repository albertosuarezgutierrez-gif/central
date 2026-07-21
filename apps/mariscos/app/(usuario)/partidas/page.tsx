import Link from 'next/link'
import { getSession } from '@/lib/session'
import { listarPartidas } from '@/lib/mariscos-repo'
import { eur, kg, fecha } from '@/lib/format'
import { NuevaPartidaForm } from '../_forms'

export const dynamic = 'force-dynamic'

export default async function PartidasPage() {
  const session = await getSession()
  if (!session) return null
  const partidas = await listarPartidas(session.id)

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Partidas recibidas</h1>
      </div>

      <NuevaPartidaForm />

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Lote origen</th>
                <th>Calibre</th>
                <th>Barco / marea</th>
                <th>Recepción</th>
                <th>Caducidad</th>
                <th>En cámara</th>
                <th>€/kg</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {partidas.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted" style={{ padding: 20, whiteSpace: 'normal' }}>
                    Aún no hay partidas. Pulsa «Recepcionar partida» para dar de alta la primera.
                  </td>
                </tr>
              )}
              {partidas.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/partidas/${p.id}`} style={{ fontWeight: 600, color: 'var(--brand)' }}>
                      {p.producto}
                    </Link>
                  </td>
                  <td><span className="badge">{p.loteOrigen}</span></td>
                  <td>{p.calibre || '—'}</td>
                  <td className="muted">{[p.barco, p.marea].filter(Boolean).join(' · ') || '—'}</td>
                  <td>{fecha(p.fechaRecepcion)}</td>
                  <td>{fecha(p.fechaCaducidad)}</td>
                  <td>
                    <span className={'badge ' + (p.restanteKg > 0 ? 'ok' : 'danger')}>
                      {kg(p.restanteKg)}
                    </span>
                  </td>
                  <td>{p.precioVentaKg != null ? eur(p.precioVentaKg) : '—'}</td>
                  <td>
                    <Link href={`/partidas/${p.id}`} className="ghost" style={{ padding: '4px 10px' }}>
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

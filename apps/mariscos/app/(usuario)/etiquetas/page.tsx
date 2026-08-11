import { getSession } from '@/lib/session'
import { listarEnvasados } from '@/lib/mariscos-repo'
import { canalLlevaLote, CANAL_NOMBRE } from '@central/module-pesca'
import { eur, kg, fecha } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function EtiquetasPage() {
  const session = await getSession()
  if (!session) return null
  const envasados = await listarEnvasados(session.id)

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1>Etiquetas recientes</h1>
      <p className="muted" style={{ marginTop: -8 }}>Reimprime cualquier etiqueta de un envase ya hecho.</p>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Canal</th>
                <th>Lote</th>
                <th>Peso</th>
                <th>Importe</th>
                <th>Cliente</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {envasados.length === 0 && (
                <tr><td colSpan={8} className="muted" style={{ padding: 20, whiteSpace: 'normal' }}>Aún no se ha envasado nada.</td></tr>
              )}
              {envasados.map((e) => (
                <tr key={e.id}>
                  <td>{fecha(e.fechaEnvasado)}</td>
                  <td style={{ fontWeight: 600 }}>{e.producto}</td>
                  <td>{CANAL_NOMBRE[e.canal]}</td>
                  <td>{canalLlevaLote(e.canal) ? <span className="badge">✔ sí</span> : <span className="muted">no</span>}</td>
                  <td>{kg(e.pesoKg)}</td>
                  <td><b>{eur(e.pesoKg * e.precioKg)}</b></td>
                  <td className="muted">{e.cliente || '—'}</td>
                  <td>
                    <a href={`/etiqueta/${e.id}`} target="_blank" className="ghost" style={{ padding: '4px 10px' }}>
                      Imprimir
                    </a>
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

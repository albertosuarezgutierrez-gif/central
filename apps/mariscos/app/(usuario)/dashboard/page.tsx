import Link from 'next/link'
import { getSession } from '@/lib/session'
import { dashboard } from '@/lib/mariscos-repo'
import { eur, kg } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) return null
  const d = await dashboard(session.id)

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Resumen</h1>
        <Link href="/partidas" className="primary" style={{ padding: '10px 16px', borderRadius: 8 }}>
          + Recepcionar partida
        </Link>
      </div>

      <div className="kpis">
        <div className="card">
          <div className="muted">Partidas en cámara</div>
          <div className="kpi">{d.partidasEnCamara}</div>
        </div>
        <div className="card">
          <div className="muted">Kg en stock</div>
          <div className="kpi">{kg(d.kgEnStock)}</div>
        </div>
        <div className="card">
          <div className="muted">Valor de stock (venta)</div>
          <div className="kpi">{eur(d.valorStock)}</div>
        </div>
        <div className="card">
          <div className="muted">Envasados hoy</div>
          <div className="kpi">{d.envasadosHoy}</div>
        </div>
      </div>

      <div className="card">
        <h2>¿Cómo funciona?</h2>
        <ol className="muted" style={{ lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
          <li><b>Recepciona</b> cada partida con los datos del albarán (marea, barco, captura, caducidad, lote).</li>
          <li>Cuando envasas para vender, el sistema <b>conserva el lote de origen</b> — nunca lo cambia.</li>
          <li>Imprime la <b>etiqueta</b>: con nº de lote para catering/hotel, sin él para mostrador.</li>
        </ol>
      </div>
    </div>
  )
}

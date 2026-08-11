import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getPartida } from '@/lib/mariscos-repo'
import { canalLlevaLote, CANAL_NOMBRE } from '@central/module-pesca'
import { eur, kg, fecha } from '@/lib/format'
import { EnvasarForm } from '../../_forms'

export const dynamic = 'force-dynamic'

function Dato({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
      <div>{value || '—'}</div>
    </div>
  )
}

export default async function PartidaDetalle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session) return null
  const data = await getPartida(session.id, id)
  if (!data) notFound()
  const { partida: p, envasados, restanteKg, envasadoKg } = data

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{p.producto} <span className="badge">{p.loteOrigen}</span></h1>
        <Link href="/partidas" className="ghost">← Partidas</Link>
      </div>

      {/* Datos del albarán (la trazabilidad de origen) */}
      <div className="card">
        <h2>Datos de la partida (albarán)</h2>
        <div className="form-grid">
          <Dato label="Nombre científico" value={p.nombreCientifico} />
          <Dato label="Calibre" value={p.calibre} />
          <Dato label="Proveedor" value={p.proveedor} />
          <Dato label="Nº albarán" value={p.albaran} />
          <Dato label="Marea" value={p.marea} />
          <Dato label="Barco" value={p.barco} />
          <Dato label="Zona de captura" value={p.zonaCaptura} />
          <Dato label="Arte de pesca" value={p.artePesca} />
          <Dato label="Captura" value={fecha(p.fechaCaptura)} />
          <Dato label="Recepción" value={fecha(p.fechaRecepcion)} />
          <Dato label="Caducidad" value={fecha(p.fechaCaducidad)} />
          <Dato label="Precio venta" value={p.precioVentaKg != null ? eur(p.precioVentaKg) + '/kg' : '—'} />
        </div>
      </div>

      {/* Stock */}
      <div className="kpis">
        <div className="card"><div className="muted">Recibido</div><div className="kpi">{kg(p.pesoRecibidoKg)}</div></div>
        <div className="card"><div className="muted">Envasado</div><div className="kpi">{kg(envasadoKg)}</div></div>
        <div className="card"><div className="muted">En cámara</div><div className="kpi">{kg(restanteKg)}</div></div>
      </div>

      {/* Envasar */}
      <div className="card">
        <h2>Envasar para venta</h2>
        <p className="muted" style={{ marginTop: -4 }}>
          El envase conserva el lote <b>{p.loteOrigen}</b>. La etiqueta llevará el lote solo en catering/hotel.
        </p>
        <EnvasarForm partidaId={p.id} precioVentaKg={p.precioVentaKg ?? null} restanteKg={restanteKg} />
      </div>

      {/* Envasados de esta partida */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '14px 16px 0' }}><h2>Envasados ({envasados.length})</h2></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Canal</th>
                <th>Lote en etiqueta</th>
                <th>Peso</th>
                <th>€/kg</th>
                <th>Importe</th>
                <th>Cliente</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {envasados.length === 0 && (
                <tr><td colSpan={8} className="muted" style={{ padding: 16, whiteSpace: 'normal' }}>Sin envasados todavía.</td></tr>
              )}
              {envasados.map((e) => (
                <tr key={e.id}>
                  <td>{fecha(e.fechaEnvasado)}</td>
                  <td>{CANAL_NOMBRE[e.canal]}</td>
                  <td>
                    {canalLlevaLote(e.canal)
                      ? <span className="badge">{p.loteOrigen}</span>
                      : <span className="muted">— (mostrador)</span>}
                  </td>
                  <td>{kg(e.pesoKg)}</td>
                  <td>{eur(e.precioKg)}</td>
                  <td><b>{eur(e.pesoKg * e.precioKg)}</b></td>
                  <td className="muted">{e.cliente || '—'}</td>
                  <td>
                    <a href={`/etiqueta/${e.id}`} target="_blank" className="ghost" style={{ padding: '4px 10px' }}>
                      Etiqueta
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

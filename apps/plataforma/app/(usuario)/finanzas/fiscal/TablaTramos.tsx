// 6. Cuota por tramo: hoy | cierre | con palancas (si hay), y «cada 1.000€ más cuesta X€». Presentacional.
import { TablaScroll } from '@/components/ui'
import type { TablaTramosDatos } from '@/lib/fiscal-panel'
import { eur } from '@/lib/dinero'
import { dinero, pct, subBloque, tarjeta, td, th, tituloBloque } from './estilosPanel'

export default function TablaTramos({ datos, columnas, etiquetaSel }: { datos: TablaTramosDatos; columnas: string[]; etiquetaSel: string }) {
  const { filas, totales } = datos
  return (
    <section style={tarjeta} aria-labelledby="t-tramos">
      <h2 id="t-tramos" style={tituloBloque}>Cuota por tramo <span style={{ fontWeight: 500, color: 'var(--muted)' }}>({etiquetaSel})</span></h2>
      <p style={subBloque}>Tipo combinado estatal + Andalucía sobre la base liquidable. La cuota íntegra es la suma de tramos menos la cuota del mínimo personal y familiar.</p>
      {filas.length === 0 ? (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>Sin dato: no hay base liquidable para repartir en tramos.</div>
      ) : (
        <TablaScroll>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480, marginTop: 8 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th scope="col" style={{ ...th, textAlign: 'left' }}>Tramo</th>
                {columnas.map(c => <th scope="col" key={c} style={th}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {filas.map(f => (
                <tr key={f.desde} style={{ borderBottom: '1px solid var(--border)' }}>
                  <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 500 }}>
                    {eur(f.desde)} – {f.hasta == null ? 'en adelante' : eur(f.hasta)} <span style={{ color: f.tipo > 0.4 ? 'var(--negative)' : 'var(--muted)', fontWeight: 700 }}>· {pct(f.tipo)}</span>
                  </th>
                  {f.celdas.map((c, i) => <td key={i} style={{ ...td, color: c == null ? 'var(--muted)' : undefined }}>{c == null ? 'sin dato' : c.base > 0 ? eur(c.cuota) : '—'}</td>)}
                </tr>
              ))}
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 500, color: 'var(--muted)' }}>Menos cuota del mínimo personal y familiar</th>
                {totales.map((t, i) => <td key={i} style={{ ...td, color: 'var(--muted)' }}>{t == null ? 'sin dato' : `−${eur(t.minimoCuota)}`}</td>)}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 700 }}>Cuota íntegra</th>
                {totales.map((t, i) => <td key={i} style={{ ...td, fontWeight: 700 }}>{dinero(t?.cuotaIntegra)}</td>)}
              </tr>
              <tr>
                <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 500 }}>Cada 1.000€ más de base cuesta</th>
                {totales.map((t, i) => <td key={i} style={td}>{dinero(t?.cada1000)}</td>)}
              </tr>
            </tbody>
          </table>
        </TablaScroll>
      )}
    </section>
  )
}

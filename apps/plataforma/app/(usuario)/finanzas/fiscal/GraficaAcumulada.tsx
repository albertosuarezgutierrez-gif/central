'use client'
// 3. ¿Cómo llego a diciembre? Base liquidable (conjunta) acumulada: real sólido, nov-dic discontinuo, banda, umbral.
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { eur } from '@/lib/dinero'
import { UMBRAL, type PuntoSerie } from '@/lib/fiscal-panel'
import { dinero, soloLector, subBloque, tarjeta, tituloBloque } from './estilosPanel'

export default function GraficaAcumulada({ serie }: { serie: PuntoSerie[] }) {
  const hayAlgo = serie.some(p => p.real != null || p.proy != null)
  return (
    <section style={tarjeta} aria-labelledby="t-grafica">
      <h2 id="t-grafica" style={tituloBloque}>¿Cómo llego a diciembre?</h2>
      <p style={subBloque}>Base liquidable conjunta acumulada. Línea continua = real · discontinua = estimado · banda = rango de escenarios.</p>
      {!hayAlgo ? (
        <div style={{ marginTop: 12, padding: 12, border: '1px dashed var(--muted)', borderRadius: 8, fontSize: 12, color: 'var(--muted)' }}>Sin dato: la serie mensual no se pudo calcular.</div>
      ) : (
        <div style={{ width: '100%', height: 240, marginTop: 8 }} role="img" aria-label="Gráfica de la base liquidable acumulada mes a mes frente al umbral de 60.000 euros; los mismos valores están en la tabla siguiente." aria-describedby="tabla-serie">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={serie} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} width={44} tickCount={4} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: unknown, n: string) => [Array.isArray(v) ? `${eur(Number(v[0]))} – ${eur(Number(v[1]))}` : eur(Number(v)), n === 'real' ? 'Real' : n === 'proy' ? 'Estimado' : 'Rango']} />
              <Area dataKey="banda" name="banda" stroke="none" fill="var(--primary)" fillOpacity={0.15} isAnimationActive={false} />
              <ReferenceLine y={UMBRAL} stroke="var(--negative)" strokeWidth={2} label={{ value: 'Umbral 60.000€', position: 'insideTopLeft', fontSize: 11, fill: 'var(--negative)' }} />
              <Line dataKey="proy" name="proy" type="monotone" stroke="var(--primary)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls={false} />
              <Line dataKey="real" name="real" type="monotone" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <table id="tabla-serie" style={soloLector}>
        <caption>Base liquidable acumulada por mes</caption>
        <thead><tr><th>Mes</th><th>Real</th><th>Estimado</th><th>Rango</th></tr></thead>
        <tbody>
          {serie.map(p => (
            <tr key={p.mes}>
              <td>{p.etiqueta}</td><td>{dinero(p.real)}</td><td>{p.real == null ? dinero(p.proy, true) : '—'}</td>
              <td>{p.banda ? `${dinero(p.banda[0])} a ${dinero(p.banda[1])}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

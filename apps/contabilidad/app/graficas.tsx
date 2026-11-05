'use client'
// Gráficas (recharts) del panel, la evolución y la rentabilidad. Reciben datos ya calculados y serializables (céntimos enteros;
// `null` = sin datos → hueco en la serie, nunca 0). Colores SIEMPRE por variable CSS (acento de la empresa y semáforo de marca).
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatearCentimos } from '@central/module-contabilidad'

const C = {
  marca: 'var(--brand)', ok: 'var(--ok)', mal: 'var(--danger)', aviso: 'var(--warn)', asegura: 'var(--asegura)', tenue: 'var(--muted)', rejilla: 'var(--border)',
}
const TARTA = [
  'var(--brand)', 'var(--asegura)', 'color-mix(in oklab, var(--brand) 60%, white)', 'var(--warn)', 'color-mix(in oklab, var(--asegura) 55%, white)',
  'var(--ok)', 'color-mix(in oklab, var(--brand) 35%, white)', 'var(--muted)',
]

/** Solo para los ejes (la cifra exacta va en el tooltip): «12,5 k€». */
function corto(c: number): string {
  const e = c / 100
  return Math.abs(e) >= 1000 ? `${(e / 1000).toFixed(1).replace('.', ',')} k€` : `${Math.round(e)}€`
}
const eur = (v: unknown) => (typeof v === 'number' ? formatearCentimos(v) : 'Sin datos')
const marco = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' }
const sinNull = (v: number | null): number | undefined => (v === null ? undefined : v)

function Contenedor({ titulo, etiqueta, children, alto = 260 }: { titulo: string; etiqueta: string; children: React.ReactNode; alto?: number }) {
  return (
    <figure className="grafica" aria-label={etiqueta}>
      <figcaption>{titulo}</figcaption>
      <div style={{ width: '100%', height: alto }}>{children}</div>
    </figure>
  )
}

export function GraficaVentasGastos({ datos }: { datos: { etiqueta: string; ventas: number | null; gastos: number | null; ventasAnioAnterior: number | null }[] }) {
  const d = datos.map((x) => ({ ...x, ventas: sinNull(x.ventas), gastos: sinNull(x.gastos), ventasAnioAnterior: sinNull(x.ventasAnioAnterior) }))
  return (
    <Contenedor titulo="Ventas y gastos" etiqueta="Barras de ventas y gastos por periodo, con la línea de ventas del año anterior">
      <ResponsiveContainer>
        <ComposedChart data={d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={C.rejilla} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="etiqueta" tick={{ fontSize: 12, fill: C.tenue }} />
          <YAxis tickFormatter={corto} tick={{ fontSize: 12, fill: C.tenue }} width={58} />
          <Tooltip formatter={eur} contentStyle={marco} />
          <Legend />
          <Bar dataKey="ventas" name="Ventas" fill={C.marca} radius={[4, 4, 0, 0]} />
          <Bar dataKey="gastos" name="Gastos" fill={C.aviso} radius={[4, 4, 0, 0]} />
          <Line dataKey="ventasAnioAnterior" name="Ventas año anterior" stroke={C.asegura} strokeDasharray="5 4" dot={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Contenedor>
  )
}

export function GraficaResultado({ datos }: { datos: { etiqueta: string; resultado: number | null; resultadoAcumulado: number | null }[] }) {
  const d = datos.map((x) => ({ ...x, resultado: sinNull(x.resultado), resultadoAcumulado: sinNull(x.resultadoAcumulado) }))
  return (
    <Contenedor titulo="Resultado acumulado" etiqueta="Línea del resultado acumulado y del resultado de cada periodo">
      <ResponsiveContainer>
        <LineChart data={d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={C.rejilla} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="etiqueta" tick={{ fontSize: 12, fill: C.tenue }} />
          <YAxis tickFormatter={corto} tick={{ fontSize: 12, fill: C.tenue }} width={58} />
          <Tooltip formatter={eur} contentStyle={marco} />
          <Legend />
          <Line dataKey="resultadoAcumulado" name="Acumulado" stroke={C.marca} strokeWidth={3} dot={{ r: 3 }} />
          <Line dataKey="resultado" name="Del periodo" stroke={C.tenue} strokeDasharray="4 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </Contenedor>
  )
}

export function GraficaTesoreria({ datos }: { datos: { etiqueta: string; real?: number; prevision?: number }[] }) {
  return (
    <Contenedor titulo="Tesorería: real y previsión a 90 días" etiqueta="Área del saldo de caja real y de la previsión a 90 días">
      <ResponsiveContainer>
        <AreaChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={C.rejilla} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="etiqueta" tick={{ fontSize: 12, fill: C.tenue }} interval="preserveStartEnd" />
          <YAxis tickFormatter={corto} tick={{ fontSize: 12, fill: C.tenue }} width={58} />
          <Tooltip formatter={eur} contentStyle={marco} />
          <Legend />
          <Area dataKey="real" name="Saldo real" stroke={C.marca} fill={C.marca} fillOpacity={0.25} connectNulls />
          <Area dataKey="prevision" name="Previsión" stroke={C.asegura} strokeDasharray="6 4" fill={C.asegura} fillOpacity={0.1} connectNulls />
        </AreaChart>
      </ResponsiveContainer>
    </Contenedor>
  )
}

export function TartaGastos({ datos }: { datos: { nombre: string; importe: number; pct: number }[] }) {
  return (
    <figure className="grafica" aria-label="Tarta de gastos por categoría">
      <figcaption>Gastos por categoría</figcaption>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={datos} dataKey="importe" nameKey="nombre" innerRadius="45%" outerRadius="85%" paddingAngle={1} stroke="var(--panel)">
              {datos.map((_, i) => <Cell key={i} fill={TARTA[i % TARTA.length]} />)}
            </Pie>
            <Tooltip formatter={eur} contentStyle={marco} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="leyenda">
        {datos.map((x, i) => (
          <li key={x.nombre}><span className="punto" style={{ background: TARTA[i % TARTA.length] }} aria-hidden="true" />{x.nombre}<span className="leyenda-v">{formatearCentimos(x.importe)} · {String(x.pct).replace('.', ',')} %</span></li>
        ))}
      </ul>
    </figure>
  )
}

export function BarrasHorizontales({ titulo, etiqueta, datos, semaforo = false }: { titulo: string; etiqueta: string; datos: { nombre: string; valor: number }[]; semaforo?: boolean }) {
  return (
    <Contenedor titulo={titulo} etiqueta={etiqueta} alto={Math.max(160, 44 * datos.length + 40)}>
      <ResponsiveContainer>
        <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={C.rejilla} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickFormatter={corto} tick={{ fontSize: 12, fill: C.tenue }} />
          <YAxis type="category" dataKey="nombre" width={96} tick={{ fontSize: 12, fill: C.tenue }} />
          <Tooltip formatter={eur} contentStyle={marco} />
          <Bar dataKey="valor" name="Importe" radius={[0, 4, 4, 0]}>
            {datos.map((x, i) => <Cell key={i} fill={semaforo ? (x.valor >= 0 ? C.ok : C.mal) : C.marca} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Contenedor>
  )
}

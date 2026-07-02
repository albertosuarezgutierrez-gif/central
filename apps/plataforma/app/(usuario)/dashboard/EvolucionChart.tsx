'use client'

// Evolución mensual ingresos vs gastos con estética Tremor (sustituye a las barras CSS
// server-side del dashboard). Recharts + CSS vars; sin dependencias nuevas.
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { CardHeader, LegendDot, Stat, cardStyle, EMERALD } from './ui'

const ROSE_BAR = '#f43f5e'
const EMERALD_BAR = '#10b981'

type Mes = { mes: string; ingresos: number; gastos: number }

const fmtEur = (n: number) =>
  n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

const mesCorto = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-ES', { month: 'short', timeZone: 'UTC' })
}

function TooltipCard({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const ingresos = payload.find(p => p.name === 'Ingresos')?.value ?? 0
  const gastos = payload.find(p => p.name === 'Gastos')?.value ?? 0
  const neto = ingresos - gastos
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
      boxShadow: '0 4px 12px rgba(0,0,0,.1)', padding: '10px 12px', fontSize: 13,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, textTransform: 'capitalize' }}>{label ? mesCorto(label) : ''}</div>
      {payload.map(p => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: p.color, display: 'inline-block' }} />
          <span style={{ color: 'var(--muted)', flex: 1, paddingRight: 12 }}>{p.name}</span>
          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtEur(p.value)}</span>
        </div>
      ))}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ color: 'var(--muted)' }}>Neto</span>
        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: neto >= 0 ? EMERALD : '#dc2626' }}>{fmtEur(neto)}</span>
      </div>
    </div>
  )
}

export default function EvolucionChart({ data }: { data: Mes[] }) {
  const totalIngresos = data.reduce((s, d) => s + d.ingresos, 0)
  const totalGastos = data.reduce((s, d) => s + d.gastos, 0)
  const neto = totalIngresos - totalGastos
  return (
    <section style={{ ...cardStyle, marginBottom: 28 }}>
      <CardHeader
        title="📊 Evolución mensual"
        sub="Ingresos vs gastos del banco, por mes"
        action={
          <div style={{ display: 'flex', gap: 14 }}>
            <LegendDot color={EMERALD_BAR} label="Ingresos" />
            <LegendDot color={ROSE_BAR} label="Gastos" />
          </div>
        }
      />
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
        <Stat label="Ingresos (periodo)" value={fmtEur(totalIngresos)} />
        <Stat label="Gastos (periodo)" value={fmtEur(totalGastos)} />
        <Stat label="Neto" value={fmtEur(neto)} color={neto >= 0 ? EMERALD : '#dc2626'} />
      </div>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barGap={3}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="mes" tickFormatter={mesCorto} tickLine={false} axisLine={false}
              tick={{ fontSize: 12, fill: '#64748b' }} dy={6} />
            <YAxis tickFormatter={(v: number) => fmtEur(v)} tickLine={false} axisLine={false}
              tick={{ fontSize: 12, fill: '#64748b' }} width={64} />
            <Tooltip content={<TooltipCard />} cursor={{ fill: 'rgba(100,116,139,.06)' }} />
            <Bar dataKey="ingresos" name="Ingresos" fill={EMERALD_BAR} radius={[4, 4, 0, 0]} maxBarSize={18} />
            <Bar dataKey="gastos" name="Gastos" fill={ROSE_BAR} radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

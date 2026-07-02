'use client'

// Prueba de diseño "Tremor-look" (02/07/2026): KPI cards con delta + gráfica de área con
// degradado, adaptadas de tremor.so a las CSS vars de plataforma (la app no usa Tailwind,
// que es lo que Tremor requiere tal cual). Motor de gráficas: el Recharts que ya usamos.
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { MesCobros } from '@/lib/banca'
import { CardHeader, Stat, LegendDot, cardStyle } from './ui'

const COLOR_DUPLEX = '#4f46e5' // var(--primary)
const COLOR_PISOS = '#06b6d4'

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
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
      boxShadow: '0 4px 12px rgba(0,0,0,.1)', padding: '10px 12px', fontSize: 13,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, textTransform: 'capitalize' }}>{label ? mesCorto(label) : ''}</div>
      {payload.map(p => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: p.color, display: 'inline-block' }} />
          <span style={{ color: 'var(--muted)', flex: 1 }}>{p.name}</span>
          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtEur(p.value)}</span>
        </div>
      ))}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ color: 'var(--muted)' }}>Total</span>
        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtEur(total)}</span>
      </div>
    </div>
  )
}

export default function CobrosPisosChart({ serie }: { serie: MesCobros[] }) {
  const totales = serie.map(m => m.duplex + m.pisos)
  const esteMes = totales[totales.length - 1] ?? 0
  const mesAnterior = totales[totales.length - 2] ?? 0
  const total6m = totales.reduce((s, n) => s + n, 0)
  const delta = mesAnterior > 0 ? ((esteMes - mesAnterior) / mesAnterior) * 100 : null

  return (
    <div style={{ ...cardStyle, marginBottom: '28px' }}>
      <CardHeader
        title="🏠 Cobros de pisos · últimos 6 meses"
        sub="Abonos conciliados con banco (Dúplex = BBVA · Pisos = Kutxa agrupados)"
        action={
          <div style={{ display: 'flex', gap: 14 }}>
            <LegendDot color={COLOR_DUPLEX} label="Dúplex" />
            <LegendDot color={COLOR_PISOS} label="Pisos Kutxa" />
          </div>
        }
      />

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
        <Stat label="Cobrado este mes" value={fmtEur(esteMes)} delta={delta} sub="vs mes anterior" />
        <Stat label="Mes anterior" value={fmtEur(mesAnterior)} />
        <Stat label="Total 6 meses" value={fmtEur(total6m)} />
      </div>

      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={serie} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="gradDuplex" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_DUPLEX} stopOpacity={0.25} />
                <stop offset="100%" stopColor={COLOR_DUPLEX} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradPisos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_PISOS} stopOpacity={0.25} />
                <stop offset="100%" stopColor={COLOR_PISOS} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="mes" tickFormatter={mesCorto} tickLine={false} axisLine={false}
              tick={{ fontSize: 12, fill: '#64748b' }} dy={6} />
            <YAxis tickFormatter={(v: number) => fmtEur(v)} tickLine={false} axisLine={false}
              tick={{ fontSize: 12, fill: '#64748b' }} width={64} />
            <Tooltip content={<TooltipCard />} />
            <Area type="monotone" dataKey="pisos" name="Pisos Kutxa" stackId="1"
              stroke={COLOR_PISOS} strokeWidth={2} fill="url(#gradPisos)" />
            <Area type="monotone" dataKey="duplex" name="Dúplex" stackId="1"
              stroke={COLOR_DUPLEX} strokeWidth={2} fill="url(#gradDuplex)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

import { fmtEur } from '@/lib/banca'
import type { MesResumen } from '@/lib/propiedades'

const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const fmtK = (n: number) => Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`

/**
 * Gráfico resumen de Ingresos vs Gastos por mes (barras CSS, sin dependencias).
 * Respeta la separación de cuentas: cada instancia es UNA unidad contable.
 */
export default function BarrasMensuales({ titulo, badge, serie }: { titulo: string; badge?: string; serie: MesResumen[] }) {
  const max = Math.max(1, ...serie.map(m => Math.max(m.ingresos, m.gastos)))
  const totalIng = serie.reduce((s, m) => s + m.ingresos, 0)
  const totalGas = serie.reduce((s, m) => s + m.gastos, 0)
  const neto = totalIng - totalGas

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', boxShadow: 'var(--shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>📊 {titulo}</span>
          {badge && <span style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--bg)', padding: '2px 8px', borderRadius: '20px' }}>{badge}</span>}
        </div>
        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--positive)' }}>● Ingresos {fmtEur(totalIng)}</span>
          <span style={{ color: 'var(--negative)' }}>● Gastos {fmtEur(totalGas)}</span>
          <span style={{ fontWeight: 700, color: neto >= 0 ? 'var(--positive)' : 'var(--negative)' }}>Neto {fmtEur(neto)}</span>
        </div>
      </div>

      {/* Doce columnas mensuales cuyo min-content (mes + importe) suma ~513 px: por debajo de eso
          el flex NO se encoge, así que sin scroll propio la gráfica arrastraba la página entera en
          móvil. Medido el 02/09/2026: en 320 px el contenedor pasaba de 534 a 513 con
          `minmax(0,1fr)` en el grid de arriba, o sea seguía rompiendo. El scroll va aquí, que es
          donde está el contenido que de verdad no cabe. */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '140px', minWidth: 480 }}>
        {serie.map(m => {
          const net = m.ingresos - m.gastos
          return (
            <div key={m.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '2px', width: '100%' }}>
                <div title={`Ingresos ${fmtEur(m.ingresos)}`} style={{ width: '45%', height: `${(m.ingresos / max) * 100}%`, minHeight: m.ingresos > 0 ? '2px' : '0', background: 'var(--positive)', borderRadius: '3px 3px 0 0' }} />
                <div title={`Gastos ${fmtEur(m.gastos)}`} style={{ width: '45%', height: `${(m.gastos / max) * 100}%`, minHeight: m.gastos > 0 ? '2px' : '0', background: 'var(--negative)', borderRadius: '3px 3px 0 0' }} />
              </div>
              <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{MESES_CORTO[m.mes - 1]}</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: net >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{net !== 0 ? fmtK(net) : '·'}</span>
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}

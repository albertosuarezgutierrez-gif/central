'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { ResumenFinanciero, MovResumen } from '@/lib/finanzas'

type Props = {
  initialData: ResumenFinanciero | null
  year: number
  quarter: number
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
function fmtS(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
function pct(a: number, b: number) {
  if (!b) return null
  const d = ((a - b) / Math.abs(b)) * 100
  return d
}

const TIPO_LABEL: Record<string, string> = {
  nomina: 'Nómina', proveedor: 'Proveedor', impuestos: 'Impuestos',
  suministros: 'Suministros', alquiler: 'Alquiler', comision_bancaria: 'Comisión banco',
  cobro_cliente: 'Cobro cliente', transferencia: 'Transferencia', tarjeta: 'Tarjeta',
  prestamo: 'Préstamo', seguro: 'Seguro', otros: 'Otros',
}

function MovTable({ movs }: { movs: MovResumen[] }) {
  if (!movs.length) return <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '8px 0 0' }}>Sin movimientos en este periodo.</p>
  return (
    <div style={{ marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
      {movs.map(m => (
        <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '4px 0', fontSize: '12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{m.fecha?.slice(5) ?? '—'}</div>
          <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{m.concepto}</div>
          <div style={{ fontWeight: 600, color: m.importe >= 0 ? 'var(--primary)' : '#e53e3e', whiteSpace: 'nowrap' }}>
            {m.importe >= 0 ? '+' : ''}{fmt(m.importe)}
          </div>
        </div>
      ))}
    </div>
  )
}

function MiniChart({ porMes, color = 'var(--primary)' }: { porMes: { mes: string; ingresos: number; gastos: number }[]; color?: string }) {
  if (!porMes.length) return null
  const max = Math.max(...porMes.map(m => Math.max(m.ingresos, m.gastos)), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '40px', marginTop: '10px' }}>
      {porMes.map(m => (
        <div key={m.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '36px', gap: '2px' }}>
            <div style={{ width: '100%', height: `${(m.gastos / max) * 36}px`, background: '#fc8181', borderRadius: '2px 2px 0 0', minHeight: m.gastos > 0 ? '2px' : 0 }} />
            <div style={{ width: '100%', height: `${(m.ingresos / max) * 36}px`, background: color, borderRadius: '2px 2px 0 0', minHeight: m.ingresos > 0 ? '2px' : 0 }} />
          </div>
          <div style={{ fontSize: '9px', color: 'var(--muted)' }}>{m.mes.slice(5)}</div>
        </div>
      ))}
    </div>
  )
}

function FilaResultado({ label, ingreso, gasto }: { label: string; ingreso: number; gasto: number }) {
  const res = ingreso - gasto
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px', fontSize: '12px', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ color: 'var(--primary)', textAlign: 'right' }}>{fmt(ingreso)}</span>
      <span style={{ color: '#e53e3e', textAlign: 'right' }}>{fmt(gasto)}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', color: res >= 0 ? 'var(--primary)' : '#e53e3e' }}>{fmt(res)}</span>
    </div>
  )
}

function TramoBar({ tramosIRPF, base }: { tramosIRPF: ResumenFinanciero['fiscal']['tramosIRPF']; base: number }) {
  const MAX = 80000
  const COLORES = ['#68d391', '#4fd1c5', '#63b3ed', '#f6ad55', '#fc8181', '#feb2b2']
  return (
    <div className="finanzas-tramo-bar">
      <div style={{ position: 'relative', height: '20px', borderRadius: '6px', overflow: 'hidden', display: 'flex', marginTop: '10px' }}>
        {tramosIRPF.map((t, i) => {
          const desde = t.desde
          const hasta = Math.min(t.hasta ?? MAX, MAX)
          const width = Math.max(0, ((hasta - desde) / MAX) * 100)
          return (
            <div key={i} title={`${(t.tipo * 100).toFixed(0)}%: ${fmt(desde)} – ${t.hasta ? fmt(t.hasta) : '∞'}`}
              style={{ width: `${width}%`, background: COLORES[i] ?? '#e2e8f0', height: '100%' }} />
          )
        })}
        {/* marcador posición actual */}
        {base > 0 && base < MAX && (
          <div style={{
            position: 'absolute', top: 0, bottom: 0, width: '3px',
            background: '#2d3748',
            left: `${Math.min((base / MAX) * 100, 98)}%`,
          }} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>
        <span>0€</span>
        <span>20.000€</span>
        <span>35.000€</span>
        <span>60.000€</span>
        <span>80.000€+</span>
      </div>
    </div>
  )
}

export default function FinanzasClient({ initialData, year, quarter }: Props) {
  const router = useRouter()
  const [data, setData] = useState<ResumenFinanciero | null>(initialData)
  const [isPending, startTransition] = useTransition()
  const [showMovs, setShowMovs] = useState<'correduria' | 'pisos' | 'personal' | null>(null)

  function navigate(y: number, q: number) {
    startTransition(async () => {
      const res = await fetch(`/api/finanzas?year=${y}&quarter=${q}`)
      if (res.ok) setData(await res.json())
    })
    router.push(`/finanzas?year=${y}&quarter=${q}`, { scroll: false })
  }

  const d = data
  const totalIngresos = d ? d.correduria.cobradoNeto + d.pisos.total.ingresos : 0
  const totalGastos = d ? d.correduria.gastosDeducibles + d.pisos.total.gastos + d.personal.total : 0
  const totalResultado = totalIngresos - (d ? d.correduria.gastosDeducibles + d.pisos.total.gastos : 0)
  const antPct = d?.anterior ? pct(totalResultado, d.anterior.resultado) : null

  const periodoLabel = quarter === 0 ? `Año ${year}` : `Q${quarter} ${year}`

  // Gráfico mensual global: combina correduria + pisos por mes
  const allMeses = new Map<string, { ingresos: number; gastos: number }>()
  if (d) {
    for (const m of [...d.correduria.porMes, ...d.pisos.porMes]) {
      const prev = allMeses.get(m.mes) ?? { ingresos: 0, gastos: 0 }
      prev.ingresos += m.ingresos; prev.gastos += m.gastos
      allMeses.set(m.mes, prev)
    }
  }
  const globalMeses = [...allMeses.entries()].sort().map(([mes, v]) => ({ mes, ...v }))
  const maxBar = Math.max(...globalMeses.map(m => Math.max(m.ingresos, m.gastos)), 1)

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 16px' }}>
      <style>{`
        @media (max-width: 768px) {
          .finanzas-kpi-grid { grid-template-columns: 1fr 1fr !important; }
          .finanzas-bloques { grid-template-columns: 1fr !important; }
          .finanzas-fiscal-cols { grid-template-columns: 1fr !important; }
          .finanzas-tramo-bar { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .finanzas-trimestres { grid-template-columns: auto 1fr 1fr 1fr !important; font-size: 11px !important; }
        }
        @media (max-width: 480px) {
          .finanzas-kpi-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Controles ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, flex: 1 }}>💶 Finanzas personales</h1>
        <select
          value={year}
          onChange={e => navigate(parseInt(e.target.value), quarter)}
          style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px' }}
        >
          {(d?.yearsDisponibles ?? [year]).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['Año', 'Q1', 'Q2', 'Q3', 'Q4'] as const).map((label, i) => (
            <button
              key={i}
              onClick={() => navigate(year, i)}
              style={{
                padding: '5px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                border: '1px solid var(--border)',
                background: quarter === i ? 'var(--primary)' : 'var(--surface)',
                color: quarter === i ? '#fff' : 'var(--text)',
                fontWeight: quarter === i ? 700 : 400,
              }}
            >{label}</button>
          ))}
        </div>
        {isPending && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Cargando…</span>}
      </div>

      {!d ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>Sin datos para este periodo.</div>
      ) : (
        <>
          {/* ── KPIs ── */}
          <div className="finanzas-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Ingresos netos', value: totalIngresos, color: 'var(--primary)', sub: periodoLabel },
              { label: 'Gastos totales', value: totalGastos, color: '#e53e3e', sub: 'Negocio + personal' },
              { label: 'Resultado negocio', value: totalResultado, color: totalResultado >= 0 ? 'var(--primary)' : '#e53e3e', sub: antPct !== null ? `${antPct >= 0 ? '↑' : '↓'} ${Math.abs(antPct).toFixed(0)}% vs ${year - 1}` : undefined },
              { label: 'Base imponible est.', value: d.fiscal.baseImponibleEstimada, color: '#805ad5', sub: `Tramo: ${(d.fiscal.tramoActual.tipo * 100).toFixed(0)}%${d.fiscal.margenHastaProximoTramo ? ` · ↑${fmt(d.fiscal.margenHastaProximoTramo)} al siguiente` : ''}` },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{k.label}</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: k.color }}>{fmt(k.value)}</div>
                {k.sub && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>{k.sub}</div>}
              </div>
            ))}
          </div>

          {/* ── Gráfico evolución mensual ── */}
          {globalMeses.length > 1 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '12px', color: 'var(--muted)' }}>EVOLUCIÓN MENSUAL — INGRESOS VS GASTOS</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '80px' }}>
                {globalMeses.map(m => (
                  <div key={m.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '68px', gap: '2px' }}>
                      <div title={`Gastos: ${fmt(m.gastos)}`} style={{ width: '100%', height: `${(m.gastos / maxBar) * 68}px`, background: '#fc8181', borderRadius: '2px 2px 0 0', minHeight: m.gastos > 0 ? '2px' : 0 }} />
                      <div title={`Ingresos: ${fmt(m.ingresos)}`} style={{ width: '100%', height: `${(m.ingresos / maxBar) * 68}px`, background: 'var(--primary)', borderRadius: '2px 2px 0 0', minHeight: m.ingresos > 0 ? '2px' : 0 }} />
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--muted)' }}>{m.mes.slice(5)}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '11px' }}>
                <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: 'var(--primary)', borderRadius: '2px', marginRight: '4px' }} />Ingresos</span>
                <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#fc8181', borderRadius: '2px', marginRight: '4px' }} />Gastos</span>
              </div>
            </div>
          )}

          {/* ── Grid 2×2 ── */}
          <div className="finanzas-bloques" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '20px' }}>

            {/* Correduría */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>🛡️ Correduría de seguros</div>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>Actividad económica · BBVA · Retención 15%</div>
                </div>
                <button onClick={() => setShowMovs(showMovs === 'correduria' ? null : 'correduria')}
                  style={{ fontSize: '11px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {showMovs === 'correduria' ? 'Ocultar' : 'Ver movs'}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                {[
                  { label: 'Cobrado neto', value: d.correduria.cobradoNeto, color: 'var(--primary)' },
                  { label: 'Gastos activ.', value: d.correduria.gastosDeducibles, color: '#e53e3e' },
                  { label: 'Resultado', value: d.correduria.resultado, color: d.correduria.resultado >= 0 ? 'var(--primary)' : '#e53e3e' },
                ].map(k => (
                  <div key={k.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{k.label}</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: k.color }}>{fmt(k.value)}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--primary-light)', borderRadius: '4px', padding: '6px 8px', marginBottom: '6px' }}>
                Bruto para la renta: <strong>{fmt(d.correduria.ingresosBrutos)}</strong> · Retenciones ya pagadas: <strong>{fmt(d.correduria.retencionesEstimadas)}</strong>
              </div>
              <MiniChart porMes={d.correduria.porMes} />
              {showMovs === 'correduria' && <MovTable movs={d.correduria.recientes} />}
            </div>

            {/* Pisos */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>🏨 Pisos turísticos</div>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>Rendimiento capital inmobiliario</div>
                </div>
                <a href="/apartamentos" style={{ fontSize: '11px', color: 'var(--primary)', textDecoration: 'none' }}>Detalle ↗</a>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)' }} />
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textAlign: 'right' }}>Ingresos</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textAlign: 'right' }}>Gastos</div>
              </div>
              {[
                { label: '🏠 Kutxa (3 pisos)', ing: d.pisos.kutxa.ingresos, gas: d.pisos.kutxa.gastos, sub: 'House Sev · Luxury · Busto Reform' },
                { label: '🏠 BBVA — Duplex', ing: d.pisos.bbva.ingresos, gas: d.pisos.bbva.gastos, sub: 'Duplex Center' },
              ].map(r => (
                <div key={r.label}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                    <div>
                      <div>{r.label}</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{r.sub}</div>
                    </div>
                    <div style={{ color: 'var(--primary)', fontWeight: 600 }}>{fmt(r.ing)}</div>
                    <div style={{ color: '#e53e3e', fontWeight: 600 }}>{fmt(r.gas)}</div>
                  </div>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', padding: '6px 0', fontSize: '13px', fontWeight: 700 }}>
                <div>Total pisos</div>
                <div style={{ color: 'var(--primary)' }}>{fmt(d.pisos.total.ingresos)}</div>
                <div style={{ color: '#e53e3e' }}>{fmt(d.pisos.total.gastos)}</div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--primary-light)', borderRadius: '4px', padding: '5px 8px', marginTop: '4px' }}>
                Resultado: <strong style={{ color: d.pisos.total.resultado >= 0 ? 'var(--primary)' : '#e53e3e' }}>{fmt(d.pisos.total.resultado)}</strong>
                <span style={{ marginLeft: '8px', color: 'var(--muted)' }}>· Amortización: configura valor de construcción</span>
              </div>
              <MiniChart porMes={d.pisos.porMes} color="#48bb78" />
              {showMovs === 'pisos' && <MovTable movs={d.pisos.recientes} />}
              <button onClick={() => setShowMovs(showMovs === 'pisos' ? null : 'pisos')}
                style={{ marginTop: '8px', fontSize: '11px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {showMovs === 'pisos' ? 'Ocultar movimientos' : 'Ver movimientos →'}
              </button>
            </div>

            {/* Personal */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>👤 Gastos personales</div>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>No computan en base imponible</div>
                </div>
                <button onClick={() => setShowMovs(showMovs === 'personal' ? null : 'personal')}
                  style={{ fontSize: '11px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {showMovs === 'personal' ? 'Ocultar' : 'Ver movs'}
                </button>
              </div>
              {[
                { label: '🔵 BBVA — Alberto', data: d.personal.bbva },
                { label: '🟣 Kutxa — Familiar', data: d.personal.kutxa },
              ].map(r => (
                <div key={r.label} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: r.data.gastos === 0 ? '4px' : '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{r.label}</span>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#e53e3e' }}>{fmt(r.data.gastos)}</span>
                  </div>
                  {r.data.gastos === 0 && r.label.includes('BBVA') && (
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                      Los gastos BBVA están en Correduría (seguros) y Pisos — no hay gastos personales en esta cuenta.
                    </div>
                  )}
                  {r.data.porCategoria.slice(0, 4).map(c => {
                    const pctVal = r.data.gastos > 0 ? (c.importe / r.data.gastos) * 100 : 0
                    return (
                      <div key={c.categoria} style={{ marginBottom: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '2px' }}>
                          <span style={{ color: 'var(--muted)' }}>{TIPO_LABEL[c.categoria] ?? c.categoria}</span>
                          <span>{fmt(c.importe)}</span>
                        </div>
                        <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px' }}>
                          <div style={{ height: '100%', width: `${pctVal}%`, background: '#805ad5', borderRadius: '2px' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '14px' }}>
                <span>Total personal</span>
                <span style={{ color: '#e53e3e' }}>{fmt(d.personal.total)}</span>
              </div>
              {showMovs === 'personal' && <MovTable movs={d.personal.recientes} />}
            </div>

            {/* Modelo 179 */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '12px' }}>📋 Obligaciones informativas</div>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Modelo 179 — Cesión turística</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px' }}>4 viviendas · Presentación trimestral</div>
              {[
                { q: 'Q1', plazo: '30 abr', meses: 'Ene–Mar' },
                { q: 'Q2', plazo: '31 jul', meses: 'Abr–Jun' },
                { q: 'Q3', plazo: '31 oct', meses: 'Jul–Sep' },
                { q: 'Q4', plazo: '31 ene', meses: 'Oct–Dic' },
              ].map(t => {
                const qNum = parseInt(t.q.slice(1))
                const hoy = new Date()
                const mesActual = hoy.getMonth() + 1
                const mesFinQ = qNum * 3
                const esPasado = mesActual > mesFinQ + 1 || (year < hoy.getFullYear())
                const esActual = mesActual > mesFinQ && mesActual <= mesFinQ + 1 && year === hoy.getFullYear()
                return (
                  <div key={t.q} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                    <span><strong>{t.q}</strong> {t.meses}</span>
                    <span style={{ color: 'var(--muted)' }}>hasta {t.plazo}</span>
                    <span style={{
                      fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                      background: esPasado ? '#c6f6d5' : esActual ? '#fefcbf' : 'var(--border)',
                      color: esPasado ? '#276749' : esActual ? '#744210' : 'var(--muted)',
                      fontWeight: 600,
                    }}>
                      {esPasado ? '✓ Presentar' : esActual ? '⚠️ En plazo' : 'Pendiente'}
                    </span>
                  </div>
                )
              })}
              <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--muted)', background: 'var(--primary-light)', borderRadius: '4px', padding: '6px 8px' }}>
                Los datos de reservas están disponibles en <a href="/apartamentos" style={{ color: 'var(--primary)' }}>Apartamentos</a>. Configura la referencia catastral para exportar automáticamente.
              </div>
            </div>
          </div>

          {/* ── Bloque fiscal ── */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>🏛️ Fiscal — IRPF estimado {year}</div>
                <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>Declaración conjunta · Orientativo, no sustituye asesoría fiscal</div>
              </div>
              <a
                href={`/api/finanzas/export?year=${year}`}
                style={{ fontSize: '12px', padding: '6px 12px', background: 'var(--primary)', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}
              >
                ⬇ CSV gestoría
              </a>
            </div>

            {/* Cálculo base imponible */}
            <div className="finanzas-fiscal-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Cálculo base imponible</div>
                {[
                  { label: 'Rend. actividad económica (correduría)', valor: d.correduria.ingresosBrutos - d.correduria.gastosDeducibles, signo: true },
                  { label: 'Rend. capital inmobiliario (pisos)', valor: d.pisos.total.resultado, signo: true },
                  { label: 'Reducción declaración conjunta', valor: -d.fiscal.reduccionConjunta, signo: true },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--muted)' }}>{r.label}</span>
                    <span style={{ fontWeight: 600, color: r.valor >= 0 ? 'var(--text)' : 'var(--primary)' }}>{r.valor >= 0 ? '' : '−'}{fmt(Math.abs(r.valor))}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 700, padding: '8px 0' }}>
                  <span>Base imponible estimada</span>
                  <span style={{ color: '#805ad5' }}>{fmt(d.fiscal.baseImponibleEstimada)}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', padding: '6px 8px', background: 'var(--primary-light)', borderRadius: '4px' }}>
                  Retenciones ya pagadas (correduría): <strong>{fmt(d.fiscal.retencionesAcumuladas)}</strong> — se descuentan de la cuota final en la renta
                </div>
              </div>

              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Tramos IRPF 2025</div>
                <TramoBar tramosIRPF={d.fiscal.tramosIRPF} base={d.fiscal.baseImponibleEstimada} />
                <div style={{ marginTop: '12px', fontSize: '12px', padding: '8px', background: d.fiscal.tramoActual.tipo >= 0.37 ? '#fff5f5' : 'var(--primary-light)', borderRadius: '6px', border: `1px solid ${d.fiscal.tramoActual.tipo >= 0.37 ? '#feb2b2' : 'var(--border)'}` }}>
                  <strong>Tramo actual: {(d.fiscal.tramoActual.tipo * 100).toFixed(0)}%</strong>
                  {d.fiscal.margenHastaProximoTramo !== null && (
                    <div style={{ color: 'var(--muted)', marginTop: '3px' }}>
                      Margen al siguiente tramo: <strong>{fmt(d.fiscal.margenHastaProximoTramo)}</strong>
                      <br />Si metes {fmt(d.fiscal.margenHastaProximoTramo)} más de gastos deducibles, reduces el tramo.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tabla trimestral */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Evolución trimestral (actividades + pisos)</div>
              <div className="finanzas-trimestres" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: '8px', fontSize: '12px' }}>
                <div style={{ fontWeight: 600, color: 'var(--muted)' }}>Trimestre</div>
                <div style={{ fontWeight: 600, color: 'var(--muted)', textAlign: 'right' }}>Ingresos</div>
                <div style={{ fontWeight: 600, color: 'var(--muted)', textAlign: 'right' }}>Gastos deducibles</div>
                <div style={{ fontWeight: 600, color: 'var(--muted)', textAlign: 'right' }}>Resultado</div>
                {d.fiscal.trimestres.map(t => (
                  <>
                    <div key={`q${t.q}`} style={{ fontWeight: 600, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>Q{t.q}</div>
                    <div style={{ textAlign: 'right', padding: '6px 0', borderBottom: '1px solid var(--border)', color: 'var(--primary)' }}>{fmt(t.ingresos)}</div>
                    <div style={{ textAlign: 'right', padding: '6px 0', borderBottom: '1px solid var(--border)', color: '#e53e3e' }}>{fmt(t.gastosDeducibles)}</div>
                    <div style={{ textAlign: 'right', padding: '6px 0', borderBottom: '1px solid var(--border)', fontWeight: 600, color: t.resultado >= 0 ? 'var(--primary)' : '#e53e3e' }}>{fmt(t.resultado)}</div>
                  </>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  )
}

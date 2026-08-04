'use client'
import Link from 'next/link'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, Line, ComposedChart, CartesianGrid } from 'recharts'
import type { ResumenFinanciero } from '@/lib/finanzas'
import type { MesEvolucion } from '@/lib/banca'
import { eur } from '@/lib/dinero'

// Resumen INTERACTIVO del periodo (negocio + personal) para /banca. Reutiliza los mismos
// cálculos de cabecera que /finanzas/radiografia (misma fuente `getResumenFinanciero`, cuadra
// al céntimo) y añade dos gráficas comparativas con Recharts (tematizado por CSS en globals.css).
// Es presentación pura: los números vienen ya calculados del servidor.

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px',
}
const DONA_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6']

function Kpi({ label, valor, sub, tono }: { label: string; valor: string; sub?: string; tono?: 'pos' | 'neg' | 'neutro' }) {
  const color = tono === 'pos' ? 'var(--positive)' : tono === 'neg' ? 'var(--negative)' : 'var(--text)'
  return (
    <div style={card}>
      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color }}>{valor}</div>
      {sub && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function etiquetaMes(mes: string): string { return `${MES_CORTO[Number(mes.slice(5, 7)) - 1] || ''}` }

export default function ResumenPeriodo({ resumen, evolucion, periodoLabel }: {
  resumen: ResumenFinanciero
  evolucion: MesEvolucion[]
  periodoLabel: string
}) {
  // ── Cabecera: MISMAS fórmulas que RadiografiaClient (no recomputar de otra forma) ──
  const ingresosNeg = resumen.correduria.cobradoNeto + resumen.pisos.total.ingresos
  const gastoNeg = resumen.correduria.gastosDeducibles + resumen.pisos.total.gastos
  const gastoPersonal = resumen.personal.total
  const gastoTotal = gastoNeg + gastoPersonal
  const resultado = ingresosNeg - gastoTotal
  const pctPersonal = gastoTotal > 0 ? Math.round((gastoPersonal / gastoTotal) * 100) : 0
  const ant = resumen.anterior
  const deltaGasto = ant && ant.gastos > 0 ? Math.round(((gastoTotal - ant.gastos) / ant.gastos) * 100) : null

  // ── Dona: reparto del gasto del periodo por bucket/negocio ──
  const reparto = [
    { name: '🛡️ Correduría (deducible)', value: resumen.correduria.gastosDeducibles },
    { name: '🏨 Pisos (renta)', value: resumen.pisos.total.gastos },
    { name: '👨‍👩‍👧 Personal (no deducible)', value: gastoPersonal },
  ].filter(r => r.value > 0)

  const evo = evolucion.map(m => ({ ...m, resultado: m.ingresos - m.gastos, label: etiquetaMes(m.mes) }))

  return (
    <section style={{ marginBottom: '32px' }}>
      <style>{`@media (max-width:768px){.bk-kpis{grid-template-columns:1fr 1fr!important}.bk-neg{grid-template-columns:1fr!important}.bk-graf{grid-template-columns:1fr!important}}`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700 }}>📊 Resumen del periodo</h2>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{periodoLabel}</span>
      </div>

      {/* KPIs de cabecera */}
      <div className="bk-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        <Kpi label="Ingresos" valor={eur(ingresosNeg)} sub="negocios" tono="pos" />
        <Kpi label="Gasto total" valor={eur(gastoTotal)} sub={deltaGasto !== null ? `${deltaGasto >= 0 ? '▲' : '▼'} ${Math.abs(deltaGasto)}% vs año anterior` : undefined} />
        <Kpi label="Resultado" valor={eur(resultado)} tono={resultado >= 0 ? 'pos' : 'neg'} />
        <Kpi label="Negocio / Personal" valor={`${100 - pctPersonal}/${pctPersonal}`} sub={`Personal: ${eur(gastoPersonal)}`} />
      </div>
      <div style={{ marginTop: '8px', fontSize: '12px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--muted)' }}>🧾 Base imponible IRPF est. (año): <strong style={{ color: 'var(--text)' }}>{eur(resumen.fiscal.baseImponibleEstimada)}</strong> · tramo {(resumen.fiscal.tramoActual.tipo * 100).toFixed(0)}%</span>
        <Link href="/finanzas/fiscal" style={{ color: 'var(--primary)', fontWeight: 600 }}>Mi declaración y tramos →</Link>
      </div>

      {/* Negocio (correduría + pisos) y Personal (BBVA/Kutxa) */}
      <div className="bk-neg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <strong>🏢 Negocios</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px', borderTop: '1px solid var(--border)' }}>
            <span>🛡️ Correduría</span>
            <span>cobrado <strong>{eur(resumen.correduria.cobradoNeto)}</strong> · result. <strong style={{ color: resumen.correduria.resultado >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{eur(resumen.correduria.resultado)}</strong></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px', borderTop: '1px solid var(--border)' }}>
            <span>🏨 Pisos</span>
            <span>ingresos <strong>{eur(resumen.pisos.total.ingresos)}</strong> · result. <strong style={{ color: resumen.pisos.total.resultado >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{eur(resumen.pisos.total.resultado)}</strong></span>
          </div>
          <div style={{ display: 'flex', gap: '14px', marginTop: '10px' }}>
            <Link href="/correduria" style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>Correduría →</Link>
            <Link href="/apartamentos" style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>Pisos →</Link>
          </div>
        </div>
        <div style={card}>
          <div style={{ marginBottom: '10px' }}><strong>👨‍👩‍👧 Personal</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px', borderTop: '1px solid var(--border)' }}>
            <span>🏦 BBVA <span style={{ fontSize: '11px', color: 'var(--muted)' }}>(100% tuya)</span></span>
            <strong>{eur(resumen.personal.bbva.gastos)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px', borderTop: '1px solid var(--border)' }}>
            <span>👨‍👩‍👧 Kutxabank <span style={{ fontSize: '11px', color: 'var(--muted)' }}>(familiar)</span></span>
            <strong>{eur(resumen.personal.kutxa.gastos)}</strong>
          </div>
          <div style={{ display: 'flex', gap: '14px', marginTop: '10px' }}>
            <Link href="/finanzas?tab=categorias&banco=bbva" style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>BBVA →</Link>
            <Link href="/finanzas?tab=categorias&banco=familiar" style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>Kutxabank →</Link>
          </div>
        </div>
      </div>

      {/* Gráficas comparativas */}
      <div className="bk-graf" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginTop: '12px' }}>
        <div style={card}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>📈 Ingresos vs gastos (últimos {evo.length} meses)</div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={evo} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number, n: string) => [eur(v), n === 'ingresos' ? 'Ingresos' : n === 'gastos' ? 'Gastos' : 'Resultado']} />
                <Bar dataKey="ingresos" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="gastos" fill="#ef4444" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="resultado" stroke="#6366f1" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>🍩 Reparto del gasto</div>
          {reparto.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Sin gasto en el periodo.</div>
          ) : (
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={reparto} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {reparto.map((_, i) => <Cell key={i} fill={DONA_COLORS[i % DONA_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [eur(v), n]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

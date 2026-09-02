import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getApartamentoDetalle } from '@/lib/propiedades'
import { fmtEur } from '@/lib/banca'
import { Pagina } from '@/components/ui'

export const dynamic = 'force-dynamic'

const PORTAL_LABEL: Record<string, string> = {
  BOOKING: 'Booking', AIRBNB: 'Airbnb', VRBO: 'VRBO',
  DIRECTO: 'Directo', EXPEDIA: 'Expedia', OTRO: 'Otro',
}
const CAT_ICON: Record<string, string> = {
  ALQUILER: '🏠', SUMINISTROS: '⚡', LIMPIEZA: '🧹', MANTENIMIENTO: '🔧',
  COMUNIDAD: '🏢', SEGURO: '🛡️', GESTION: '📋', REFORMAS: '🏗️',
  MARKETING: '📣', IMPUESTOS: '📊', OTRO: '📦',
}

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
function fmtMes(ym: string) {
  const [y, m] = ym.split('-')
  return `${MESES[parseInt(m) - 1]} ${y}`
}

export default async function ApartamentoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session) redirect('/login')

  const rawD = await getApartamentoDetalle(id)
  if (!rawD) notFound()
  const d = rawD!

  const anio = new Date().getFullYear()
  const mesActual = new Date().toLocaleString('es-ES', { month: 'long' })

  // Break-even: gastos fijos directos (ALQUILER + COMUNIDAD + SEGURO) / ADR
  const gastosFijos = d.gastosCat
    .filter(g => ['ALQUILER', 'COMUNIDAD', 'SEGURO'].includes(g.categoria))
    .reduce((s, g) => s + g.total, 0)
  const breakEvenNoches = d.adr > 0 ? Math.ceil(gastosFijos / 12 / d.adr) : null

  // Huecos entre próximas reservas
  const gaps: Array<{ desde: string; hasta: string; dias: number }> = []
  for (let i = 0; i < d.proximas.length - 1; i++) {
    const salida = new Date(d.proximas[i].salida)
    const entrada = new Date(d.proximas[i + 1].entrada)
    const dias = Math.round((entrada.getTime() - salida.getTime()) / 86400000)
    if (dias > 1) gaps.push({ desde: d.proximas[i].salida, hasta: d.proximas[i + 1].entrada, dias })
  }

  // YoY del mes
  const yoyPct = d.ingresosMesAA > 0
    ? Math.round(((d.ingresosMes - d.ingresosMesAA) / d.ingresosMesAA) * 100)
    : null

  return (
    <Pagina ancho="tabla">

      {/* Breadcrumb + título */}
      <div style={{ marginBottom: '24px' }}>
        <Link href="/apartamentos" style={{ fontSize: '13px', color: 'var(--muted)', textDecoration: 'none' }}>← Apartamentos</Link>
        <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '8px 0 4px' }}>{d.nombre}</h1>
        <div style={{ fontSize: '14px', color: 'var(--muted)' }}>
          {d.ubicacion}
          {d.dormitorios != null && ` · 🛏 ${d.dormitorios} hab.`}
          {d.banos != null && ` · 🚿 ${d.banos} baños`}
          {d.maxHuespedes != null && ` · 👤 máx ${d.maxHuespedes}`}
        </div>
      </div>

      {/* KPI strip */}
      <div className="aptodet-kpi-grid" style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
        gap: '12px', marginBottom: '28px',
      }}>
        <KPICard label={`Ingresos ${mesActual}`} value={fmtEur(d.ingresosMes)} color="var(--primary)"
          sub={yoyPct != null ? `${yoyPct >= 0 ? '+' : ''}${yoyPct}% vs ${anio - 1}` : undefined}
          subColor={yoyPct != null ? (yoyPct >= 0 ? 'var(--positive)' : 'var(--negative)') : undefined} />
        <KPICard label={`Gastos ${mesActual}`} value={fmtEur(d.gastosMes)} color="var(--text)" />
        <KPICard label="Resultado mes" value={fmtEur(d.resultadoMes)} color={d.resultadoMes >= 0 ? 'var(--positive)' : 'var(--negative)'} />
        <KPICard label="Ocupación mes" value={`${d.ocupacion}%`}
          color={d.ocupacion >= 70 ? 'var(--positive)' : d.ocupacion >= 40 ? 'var(--warning)' : 'var(--negative)'}
          sub={`${d.noches} noches`} />
        <KPICard label="ADR (€/noche)" value={d.adr > 0 ? fmtEur(d.adr) : '—'} color="var(--text)" />
        <KPICard label={`Ingresos ${anio}`} value={fmtEur(d.ingresosAnio)} color="var(--primary)" />
        <KPICard label={`Gastos ${anio}`} value={fmtEur(d.gastosAnio)} color="var(--text)" />
        <KPICard label={`Resultado ${anio}`} value={fmtEur(d.resultadoAnio)} color={d.resultadoAnio >= 0 ? 'var(--positive)' : 'var(--negative)'} />
      </div>

      <div className="aptodet-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Próximas reservas */}
        <Section title="📅 Próximas reservas">
          {d.proximas.length === 0 ? (
            <Empty text="Sin reservas próximas" />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: '11px' }}>
                  <Th>Huésped</Th><Th>Entrada</Th><Th>Salida</Th><Th>Noches</Th><Th>Importe</Th><Th>Portal</Th>
                </tr>
              </thead>
              <tbody>
                {d.proximas.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <Td>{r.huesped || '—'}</Td>
                    <Td>{r.entrada}</Td>
                    <Td>{r.salida}</Td>
                    <Td>{r.noches}</Td>
                    <Td>{fmtEur(r.importe)}</Td>
                    <Td>{r.portal ? (PORTAL_LABEL[r.portal] ?? r.portal) : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {gaps.length > 0 && (
            <div style={{ marginTop: '10px', padding: '8px 12px', background: 'var(--warning-bg)', borderRadius: '6px', fontSize: '12px', color: 'var(--warning)' }}>
              ⚠️ Huecos libres: {gaps.map(g => `${g.dias}d (${g.desde} → ${g.hasta})`).join(' · ')}
            </div>
          )}
        </Section>

        {/* Mix de portales */}
        <Section title="📡 Mix de portales">
          {d.portales.length === 0 ? (
            <Empty text={`Sin reservas en ${anio}`} />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: '11px' }}>
                  <Th>Portal</Th><Th>Reservas</Th><Th>Noches</Th><Th>Ingresos</Th><Th>%</Th>
                </tr>
              </thead>
              <tbody>
                {d.portales.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <Td>{PORTAL_LABEL[r.portal] ?? r.portal}</Td>
                    <Td>{r.reservas}</Td>
                    <Td>{r.noches}</Td>
                    <Td>{fmtEur(r.ingresos)}</Td>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'var(--bg)', minWidth: '40px' }}>
                          <div style={{ height: '100%', borderRadius: '2px', width: `${r.pct}%`, background: 'var(--primary)' }} />
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{r.pct}%</span>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      {/* Histórico mensual */}
      <Section title={`📈 Histórico mensual (últimos 12 meses)`} style={{ marginBottom: '20px' }}>
        {d.mensual.length === 0 ? (
          <Empty text="Sin datos históricos" />
        ) : (
          <div className="aptodet-table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: '11px' }}>
                <Th>Mes</Th><Th>Ingresos</Th><Th>Noches</Th><Th>Reservas</Th><Th>ADR</Th><Th>Ocupación</Th>
              </tr>
            </thead>
            <tbody>
              {[...d.mensual].reverse().map((r, i) => {
                const diasDelMes = (() => { const [y, m] = r.mes.split('-'); return new Date(parseInt(y), parseInt(m), 0).getDate() })()
                const ocup = Math.round((r.noches / diasDelMes) * 100)
                const adrM = r.noches > 0 ? Math.round(r.ingresos / r.noches) : 0
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <Td>{fmtMes(r.mes)}</Td>
                    <Td style={{ fontWeight: 600, color: 'var(--primary)' }}>{fmtEur(r.ingresos)}</Td>
                    <Td>{r.noches}</Td>
                    <Td>{r.reservas}</Td>
                    <Td>{adrM > 0 ? fmtEur(adrM) : '—'}</Td>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'var(--bg)', minWidth: '50px' }}>
                          <div style={{ height: '100%', borderRadius: '2px', width: `${Math.min(ocup, 100)}%`, background: ocup >= 70 ? 'var(--positive)' : ocup >= 40 ? 'var(--warning)' : 'var(--negative)' }} />
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{ocup}%</span>
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </Section>

      <div className="aptodet-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Gastos por categoría */}
        <Section title={`💶 Gastos por categoría (${anio})`}>
          {d.gastosCat.length === 0 ? (
            <Empty text={`Sin gastos registrados en ${anio}`} />
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: '11px' }}>
                    <Th>Categoría</Th><Th>Total</Th><Th>Facturas</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.gastosCat.map((g, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <Td>{CAT_ICON[g.categoria] ?? '📦'} {g.categoria}</Td>
                      <Td style={{ fontWeight: 600 }}>{fmtEur(g.total)}</Td>
                      <Td style={{ color: 'var(--muted)' }}>{g.n}</Td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--border)' }}>
                    <Td style={{ fontWeight: 700 }}>Total directo</Td>
                    <Td style={{ fontWeight: 700 }}>{fmtEur(d.gastosAnio)}</Td>
                    <Td style={{ color: 'var(--muted)' }}>{d.gastosCat.reduce((s, g) => s + g.n, 0)}</Td>
                  </tr>
                </tbody>
              </table>
              {breakEvenNoches != null && (
                <div style={{ marginTop: '10px', padding: '8px 12px', background: 'var(--primary-light)', borderRadius: '6px', fontSize: '12px', color: 'var(--primary)' }}>
                  💡 Break-even estimado: {breakEvenNoches} noches/mes para cubrir gastos fijos anuales
                </div>
              )}
            </>
          )}
        </Section>

        {/* Gastos compartidos */}
        <Section title="🏢 Gastos compartidos (referencia)">
          {d.gastosCatCompartidos.length === 0 ? (
            <Empty text="Sin gastos compartidos registrados" />
          ) : (
            <>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>
                Costes de prop_multi + seguros globales — no están asignados a este piso individualmente.
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: '11px' }}>
                    <Th>Categoría</Th><Th>Total</Th><Th>Facturas</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.gastosCatCompartidos.map((g, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <Td>{CAT_ICON[g.categoria] ?? '📦'} {g.categoria}</Td>
                      <Td>{fmtEur(g.total)}</Td>
                      <Td style={{ color: 'var(--muted)' }}>{g.n}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Section>
      </div>

      {/* Últimas reservas */}
      <Section title="🕐 Últimas reservas" style={{ marginBottom: '20px' }}>
        {d.ultimas.length === 0 ? (
          <Empty text="Sin reservas pasadas registradas" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: '11px' }}>
                  <Th>Huésped</Th><Th>Entrada</Th><Th>Salida</Th><Th>Noches</Th><Th>Neto</Th><Th>Bruto</Th><Th>Portal</Th>
                </tr>
              </thead>
              <tbody>
                {d.ultimas.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <Td>{r.huesped || '—'}</Td>
                    <Td>{r.entrada}</Td>
                    <Td>{r.salida}</Td>
                    <Td>{r.noches}</Td>
                    <Td style={{ fontWeight: 600 }}>{fmtEur(r.importe)}</Td>
                    <Td style={{ color: 'var(--muted)' }}>{r.bruto ? fmtEur(r.bruto) : '—'}</Td>
                    <Td>{r.portal ? (PORTAL_LABEL[r.portal] ?? r.portal) : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

    </Pagina>
  )
}

function KPICard({ label, value, color, sub, subColor }: { label: string; value: string; color: string; sub?: string; subColor?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', boxShadow: 'var(--shadow)' }}>
      <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500, marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: subColor ?? 'var(--muted)', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

function Section({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', boxShadow: 'var(--shadow)', ...style }}>
      <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px' }}>{title}</div>
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: '13px', color: 'var(--muted)', padding: '12px 0' }}>{text}</div>
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: '6px 8px 6px 0', fontWeight: 600 }}>{children}</th>
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '7px 8px 7px 0', verticalAlign: 'middle', ...style }}>{children}</td>
}

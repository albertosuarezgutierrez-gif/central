import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Hotel } from 'lucide-react'
import { PageHeader, ThinBar } from '@/components/ui'
import { getSession } from '@/lib/session'
import { getPropiedades, getResumenAnual, PROP_TURISTICOS, PROP_BBVA } from '@/lib/propiedades'
import { fmtEur } from '@/lib/banca'
import Filtro from './Filtro'
import BarrasMensuales from './BarrasMensuales'
import MensajesHuesped from './MensajesHuesped'

export const dynamic = 'force-dynamic'

const PORTAL_LABEL: Record<string, string> = {
  BOOKING: 'Booking', AIRBNB: 'Airbnb', VRBO: 'VRBO',
  DIRECTO: 'Directo', EXPEDIA: 'Expedia', OTRO: 'Otro',
}
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default async function ApartamentosPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const sp = await searchParams
  const now = new Date()
  const year  = Number(sp.year) || now.getFullYear()
  const monthRaw = Number(sp.month)
  const month = monthRaw >= 1 && monthRaw <= 12 ? monthRaw : null
  const periodoLabel = month ? `${MESES[month - 1]} ${year}` : `Año ${year}`

  const [propiedades, resumen] = await Promise.all([
    getPropiedades({ year, month }),
    getResumenAnual(year),
  ])
  const propias = propiedades.filter(p => !p.id.includes('multi') && !p.id.includes('personal'))

  // Separación de cuentas (ver apps/sivra/docs/contabilidad.md): NO mezclar.
  const turisticos = propias.filter(p => (PROP_TURISTICOS as readonly string[]).includes(p.id))
  const bbva       = propias.filter(p => (PROP_BBVA as readonly string[]).includes(p.id))

  const grupoKpis = (lista: typeof propias) => ({
    ingresos: lista.reduce((s, p) => s + p.ingresosMes, 0),
    gastos:   lista.reduce((s, p) => s + p.gastosMes, 0),
    anio:     lista.reduce((s, p) => s + p.ingresosAnio, 0),
    noches:   lista.reduce((s, p) => s + p.noches, 0),
    ocup:     lista.length > 0 ? Math.round(lista.reduce((s, p) => s + p.ocupacion, 0) / lista.length) : 0,
  })
  const kTur = grupoKpis(turisticos)
  const kBbva = grupoKpis(bbva)

  return (
    <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px 24px' }}>
      <PageHeader
        titulo="Mis apartamentos"
        sub={periodoLabel}
        icono={<Hotel size={20} strokeWidth={1.75} />}
        acciones={<Filtro year={year} month={month} />}
      />

      {/* KPI — Explotación turística (cuenta Kutxa, sin gastos personales) */}
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
        Explotación turística · 3 pisos (Kutxa)
      </div>
      <div className="aptos-kpi-strip" style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: '20px 24px', display: 'flex', gap: '32px', flexWrap: 'wrap', marginBottom: '20px',
        boxShadow: 'var(--shadow)',
      }}>
        <KPI label="Ingresos periodo" value={fmtEur(kTur.ingresos)} color="var(--primary)" />
        <KPI label="Gastos periodo" value={fmtEur(kTur.gastos)} color="var(--muted)" />
        <KPI label="Resultado" value={fmtEur(kTur.ingresos - kTur.gastos)} color={kTur.ingresos - kTur.gastos >= 0 ? 'var(--positive)' : 'var(--negative)'} />
        <KPI label={`Ingresos ${year}`} value={fmtEur(kTur.anio)} color="var(--text)" />
        <KPI label="Noches ocupadas" value={`${kTur.noches} noches`} color="var(--text)" />
        <KPI label="Ocupación media" value={`${kTur.ocup}%`} color={kTur.ocup >= 70 ? 'var(--positive)' : kTur.ocup >= 40 ? 'var(--warning)' : 'var(--negative)'} />
      </div>

      {/* KPI — Duplex + seguros (cuenta BBVA, unidad aparte) */}
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
        Duplex + seguros (BBVA) · aparte
      </div>
      <div className="aptos-kpi-strip" style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: '20px 24px', display: 'flex', gap: '32px', flexWrap: 'wrap', marginBottom: '28px',
        boxShadow: 'var(--shadow)',
      }}>
        <KPI label="Ingresos periodo" value={fmtEur(kBbva.ingresos)} color="var(--primary)" />
        <KPI label="Gastos periodo" value={fmtEur(kBbva.gastos)} color="var(--muted)" />
        <KPI label="Resultado" value={fmtEur(kBbva.ingresos - kBbva.gastos)} color={kBbva.ingresos - kBbva.gastos >= 0 ? 'var(--positive)' : 'var(--negative)'} />
        <KPI label={`Ingresos ${year}`} value={fmtEur(kBbva.anio)} color="var(--text)" />
      </div>

      {/* Qué se le manda al huésped y quién lo manda hoy (pedido de Alberto, 31/08/2026) */}
      <MensajesHuesped />

      {/* Gráficos resumen anual (Ingresos vs Gastos por mes) — una unidad por gráfico */}
      <div style={{ display: 'grid', gap: '16px', marginBottom: '28px' }}>
        <BarrasMensuales titulo={`Explotación turística ${year}`} badge="3 pisos · Kutxa" serie={resumen.turisticos} />
        <BarrasMensuales titulo={`Duplex + seguros ${year}`} badge="BBVA · aparte" serie={resumen.bbva} />
      </div>

      {/* Tarjetas por apartamento */}
      <div className="aptos-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {propias.map(p => (
          <Link key={p.id} href={`/apartamentos/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="apt-card" style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '20px', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div style={{ fontWeight: 700, fontSize: '15px' }}>{p.nombre}</div>
                <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Ver detalle →</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '14px' }}>{p.ubicacion}</div>

              {/* Financiero */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '14px' }}>
                <FinStat label="Ingresos mes" value={fmtEur(p.ingresosMes)} />
                <FinStat label="Gastos mes" value={fmtEur(p.gastosMes)} />
                <FinStat label="Resultado" value={fmtEur(p.resultadoMes)} color={p.resultadoMes >= 0 ? 'var(--positive)' : 'var(--negative)'} />
              </div>

              {/* Ocupación + ADR */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                  <span>Ocupación {p.ocupacion}% · {p.noches} noches</span>
                  {p.adr > 0 && <span>ADR {fmtEur(p.adr)}/noche</span>}
                </div>
                <ThinBar
                  pct={p.ocupacion}
                  alto={6}
                  track="var(--bg)"
                  color={p.ocupacion >= 70 ? 'var(--positive)' : p.ocupacion >= 40 ? 'var(--warning)' : 'var(--negative)'}
                />
              </div>

              {/* Portal top */}
              {p.topPortal && (
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '10px' }}>
                  📡 Principal: {PORTAL_LABEL[p.topPortal] ?? p.topPortal}
                </div>
              )}

              {/* Próxima reserva */}
              {p.proxima ? (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', fontSize: '13px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, marginBottom: '3px' }}>Próxima reserva</div>
                  <div style={{ fontWeight: 600 }}>{p.proxima.huesped || 'Huésped'}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '12px' }}>
                    {p.proxima.entrada} → {p.proxima.salida}
                    {p.proxima.portal && ` · ${PORTAL_LABEL[p.proxima.portal] ?? p.proxima.portal}`}
                  </div>
                </div>
              ) : (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', fontSize: '12px', color: 'var(--muted)' }}>
                  Sin reservas próximas
                </div>
              )}

              {/* Capacidad */}
              {p.dormitorios != null && (
                <div style={{ marginTop: '10px', display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--muted)' }}>
                  {p.dormitorios != null && <span>🛏 {p.dormitorios} hab.</span>}
                  {p.banos != null && <span>🚿 {p.banos} baños</span>}
                  {p.maxHuespedes != null && <span>👤 max {p.maxHuespedes}</span>}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}

function KPI({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500, marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

function FinStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: color || 'var(--text)', marginTop: '2px' }}>{value}</div>
    </div>
  )
}

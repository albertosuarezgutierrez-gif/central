import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getPropiedades } from '@/lib/propiedades'
import { fmtEur } from '@/lib/banca'

export const dynamic = 'force-dynamic'

const PORTAL_LABEL: Record<string, string> = {
  BOOKING: 'Booking', AIRBNB: 'Airbnb', VRBO: 'VRBO',
  DIRECTO: 'Directo', EXPEDIA: 'Expedia', OTRO: 'Otro',
}

export default async function ApartamentosPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const propiedades = await getPropiedades()
  const propias = propiedades.filter(p => !p.id.includes('multi') && !p.id.includes('personal'))

  const totalMes = propias.reduce((s, p) => s + p.ingresosMes, 0)
  const totalAnio = propias.reduce((s, p) => s + p.ingresosAnio, 0)
  const gastosMes = propias.reduce((s, p) => s + p.gastosMes, 0)
  const totalNoches = propias.reduce((s, p) => s + p.noches, 0)
  const ocupMedia = propias.length > 0 ? Math.round(propias.reduce((s, p) => s + p.ocupacion, 0) / propias.length) : 0

  return (
    <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700 }}>🏨 Mis apartamentos</h1>
      </div>

      {/* KPI strip */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: '20px 24px', display: 'flex', gap: '32px', flexWrap: 'wrap', marginBottom: '28px',
        boxShadow: 'var(--shadow)',
      }}>
        <KPI label="Ingresos este mes" value={fmtEur(totalMes)} color="var(--primary)" />
        <KPI label="Gastos este mes" value={fmtEur(gastosMes)} color="var(--muted)" />
        <KPI label="Resultado mes" value={fmtEur(totalMes - gastosMes)} color={totalMes - gastosMes >= 0 ? '#16a34a' : '#dc2626'} />
        <KPI label={`Ingresos ${new Date().getFullYear()}`} value={fmtEur(totalAnio)} color="var(--text)" />
        <KPI label="Noches ocupadas" value={`${totalNoches} noches`} color="var(--text)" />
        <KPI label="Ocupación media" value={`${ocupMedia}%`} color={ocupMedia >= 70 ? '#16a34a' : ocupMedia >= 40 ? '#d97706' : '#dc2626'} />
      </div>

      {/* Tarjetas por apartamento */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
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
                <FinStat label="Resultado" value={fmtEur(p.resultadoMes)} color={p.resultadoMes >= 0 ? '#16a34a' : '#dc2626'} />
              </div>

              {/* Ocupación + ADR */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                  <span>Ocupación {p.ocupacion}% · {p.noches} noches</span>
                  {p.adr > 0 && <span>ADR {fmtEur(p.adr)}/noche</span>}
                </div>
                <div style={{ height: '6px', borderRadius: '3px', background: 'var(--bg)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '3px',
                    width: `${Math.min(p.ocupacion, 100)}%`,
                    background: p.ocupacion >= 70 ? '#16a34a' : p.ocupacion >= 40 ? '#d97706' : '#dc2626',
                    transition: 'width .3s',
                  }} />
                </div>
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

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

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
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
      </div>

      {/* Tarjetas por apartamento */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {propias.map(p => (
          <div key={p.id} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '20px', boxShadow: 'var(--shadow)',
          }}>
            <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '4px' }}>{p.nombre}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px' }}>{p.ubicacion}</div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <FinStat label="Ingresos mes" value={fmtEur(p.ingresosMes)} />
              <FinStat label="Gastos mes" value={fmtEur(p.gastosMes)} />
              <FinStat
                label="Resultado"
                value={fmtEur(p.resultadoMes)}
                color={p.resultadoMes >= 0 ? '#16a34a' : '#dc2626'}
              />
            </div>

            {p.proxima ? (
              <div style={{
                borderTop: '1px solid var(--border)', paddingTop: '12px',
                fontSize: '13px', color: 'var(--text)',
              }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, marginBottom: '4px' }}>Próxima reserva</div>
                <div style={{ fontWeight: 600 }}>{p.proxima.huesped || 'Huésped'}</div>
                <div style={{ color: 'var(--muted)', fontSize: '12px' }}>
                  {p.proxima.entrada} → {p.proxima.salida}
                  {p.proxima.portal && ` · ${PORTAL_LABEL[p.proxima.portal] ?? p.proxima.portal}`}
                </div>
              </div>
            ) : (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', fontSize: '12px', color: 'var(--muted)' }}>
                Sin reservas próximas
              </div>
            )}

            {p.dormitorios != null && (
              <div style={{ marginTop: '12px', display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--muted)' }}>
                {p.dormitorios != null && <span>🛏 {p.dormitorios} hab.</span>}
                {p.banos != null && <span>🚿 {p.banos} baños</span>}
                {p.maxHuespedes != null && <span>👤 max {p.maxHuespedes}</span>}
              </div>
            )}
          </div>
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

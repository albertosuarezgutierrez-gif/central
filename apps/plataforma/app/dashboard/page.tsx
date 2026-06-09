import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import LogoutButton from './LogoutButton'

const SECTOR_LABEL: Record<string, string> = {
  hosteleria: '🍽️ Hostelería',
  limpieza: '🧹 Limpieza',
  inmobiliario: '🏠 Inmobiliario',
}

const APP_URL: Record<string, string> = {
  'ia-rest': process.env.IAREST_URL || 'https://iarest.es',
  ialimp: process.env.IALIMP_URL || 'https://app.ialimp.es',
  sivra: process.env.SIVRA_URL || '#',
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sociedades = await prisma.sociedad.findMany({
    where: { cuentaId: session.id },
    include: { negocios: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })

  const totalNegocios = sociedades.reduce((s, soc) => s + soc.negocios.length, 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '0 24px', height: '56px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
          <span style={{
            background: 'var(--primary)', color: '#fff',
            borderRadius: '6px', padding: '2px 8px', fontSize: '15px',
          }}>ia</span>
          <span>plataforma</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '14px', color: 'var(--muted)' }}>{session.email}</span>
          <LogoutButton />
        </div>
      </header>

      <main style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Welcome */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Hola, {session.nombre}</h1>
          <p style={{ color: 'var(--muted)', marginTop: '4px', fontSize: '15px' }}>
            {totalNegocios === 0
              ? 'Aún no tienes negocios configurados.'
              : `${totalNegocios} negocio${totalNegocios !== 1 ? 's' : ''} en ${sociedades.length} sociedad${sociedades.length !== 1 ? 'es' : ''}`}
          </p>
        </div>

        {/* Empty state */}
        {sociedades.length === 0 && (
          <div style={{
            background: 'var(--surface)', border: '1px dashed var(--border)',
            borderRadius: 'var(--radius)', padding: '48px 24px',
            textAlign: 'center', color: 'var(--muted)',
          }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>🏗️</div>
            <p style={{ fontWeight: 600, fontSize: '16px', marginBottom: '8px' }}>Configura tu primera sociedad</p>
            <p style={{ fontSize: '14px' }}>
              Añade tus empresas y negocios directamente en la base de datos por ahora.<br />
              El gestor de alta llegará en la próxima iteración.
            </p>
          </div>
        )}

        {/* Sociedades + negocios */}
        {sociedades.map(soc => (
          <section key={soc.id} style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700 }}>{soc.nombre}</h2>
              {soc.cif && (
                <span style={{ fontSize: '13px', color: 'var(--muted)', fontFamily: 'monospace' }}>
                  CIF {soc.cif}
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
              {soc.negocios.map(neg => {
                const url = neg.app ? APP_URL[neg.app] : null
                return (
                  <a
                    key={neg.id}
                    href={url || '#'}
                    target={url ? '_blank' : undefined}
                    rel="noreferrer"
                    style={{
                      display: 'block',
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)', padding: '20px',
                      boxShadow: 'var(--shadow)',
                      transition: 'border-color .15s, box-shadow .15s',
                      cursor: url ? 'pointer' : 'default',
                    }}
                    onMouseEnter={e => {
                      if (url) {
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'
                        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(79,70,229,.12)'
                      }
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                      ;(e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow)'
                    }}
                  >
                    <div style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 600, marginBottom: '6px' }}>
                      {SECTOR_LABEL[neg.sector] ?? `⚙️ ${neg.sector}`}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '4px' }}>{neg.nombre}</div>
                    {neg.app && (
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        {neg.app}
                        {url && ' ↗'}
                      </div>
                    )}
                    {/* Stub financiero — se rellenará con module-contabilidad en iteración siguiente */}
                    <div style={{
                      marginTop: '16px', paddingTop: '16px',
                      borderTop: '1px solid var(--border)',
                      display: 'flex', gap: '16px',
                    }}>
                      <Stat label="Ingresos" value="—" />
                      <Stat label="Resultado" value="—" />
                    </div>
                  </a>
                )
              })}

              {soc.negocios.length === 0 && (
                <div style={{
                  border: '1px dashed var(--border)', borderRadius: 'var(--radius)',
                  padding: '20px', color: 'var(--muted)', fontSize: '14px', textAlign: 'center',
                }}>
                  Sin negocios en esta sociedad
                </div>
              )}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '2px' }}>{value}</div>
    </div>
  )
}

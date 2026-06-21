import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getPropietarioAccessToken } from '@/lib/propiedades'

export const dynamic = 'force-dynamic'

export default async function LimpiezasPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const token = await getPropietarioAccessToken(session.email)
  const ialimp = process.env.IALIMP_URL || 'https://app.ialimp.es'
  const portalUrl = token ? `${ialimp}/propietario/${token}` : `${ialimp}/propietario`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{
        padding: '16px 24px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>🧹 Portal de limpiezas</h1>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
            {token ? 'Acceso directo como propietario' : 'Puede pedirte login la primera vez'}
          </div>
        </div>
        <a
          href={portalUrl}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: '13px', color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}
        >
          Abrir en pestaña ↗
        </a>
      </div>
      <iframe
        src={portalUrl}
        style={{ flex: 1, border: 'none', width: '100%' }}
        title="Portal de propietario ialimp"
      />
    </div>
  )
}

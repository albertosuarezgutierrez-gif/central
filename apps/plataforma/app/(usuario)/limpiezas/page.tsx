import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getPropietarioAccessToken } from '@/lib/propiedades'
import { PageHeader } from '@/components/ui'
import { SprayCan } from 'lucide-react'

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
        padding: '16px 24px 0', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <PageHeader
          titulo="Portal de limpiezas"
          sub={token ? 'Acceso directo como propietario' : 'Puede pedirte login la primera vez'}
          icono={<SprayCan size={20} strokeWidth={1.75} />}
          acciones={
            <a
              href={portalUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: '13px', color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}
            >
              Abrir en pestaña ↗
            </a>
          }
        />
      </div>
      <iframe
        src={portalUrl}
        style={{ flex: 1, border: 'none', width: '100%' }}
        title="Portal de propietario ialimp"
      />
    </div>
  )
}

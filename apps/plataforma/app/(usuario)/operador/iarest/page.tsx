import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'

export const dynamic = 'force-dynamic'

export default async function OperadorIaRestPage() {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '24px' }}>🍽️ ia-rest</h1>
      <div style={{
        background: 'var(--surface)', border: '1px dashed var(--border)',
        borderRadius: 'var(--radius)', padding: '48px 24px', textAlign: 'center', color: 'var(--muted)',
      }}>
        <div style={{ fontSize: '36px', marginBottom: '12px' }}>🍽️</div>
        <p style={{ fontWeight: 600, marginBottom: '6px' }}>Resumen de ia-rest — próximamente</p>
        <p style={{ fontSize: '13px' }}>KPIs por restaurante + acceso directo.</p>
        <a
          href={process.env.IAREST_URL || 'https://iarest.es'}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'inline-block', marginTop: '16px', color: 'var(--primary)', fontWeight: 600, fontSize: '14px' }}
        >
          Abrir ia-rest ↗
        </a>
      </div>
    </main>
  )
}

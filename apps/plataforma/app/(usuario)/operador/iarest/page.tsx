import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import Link from 'next/link'
import { Pagina } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function OperadorIaRestPage() {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')

  const sections = [
    {
      href: '/operador/iarest/restaurantes',
      icon: '🏪',
      title: 'Restaurantes',
      desc: 'Lista completa de locales: plan, personal, mesas y actividad. Detalle por restaurante.',
    },
    {
      href: '/operador/iarest/cobros',
      icon: '💶',
      title: 'Cobros',
      desc: 'Volumen y comisiones por restaurante. Histórico mensual.',
    },
    {
      href: '/operador/iarest/suscripciones',
      icon: '💳',
      title: 'Suscripciones',
      desc: 'Estado Stripe por cuenta, MRR y próximos cobros. Solo lectura.',
    },
    {
      href: '/operador/iarest/soporte',
      icon: '🎫',
      title: 'Soporte',
      desc: 'Tickets de los restaurantes. Responde y cierra desde aquí.',
    },
    {
      href: '/operador/iarest/sugerencias',
      icon: '💡',
      title: 'Sugerencias',
      desc: 'Ideas y peticiones del equipo de sala. Prioriza y anota.',
    },
    {
      href: '/operador/iarest/crecimiento',
      icon: '📈',
      title: 'Crecimiento',
      desc: 'Instagram, blog y leads de landing. Borradores pendientes y alcance.',
    },
    {
      href: '/operador/iarest/sistema',
      icon: '🔬',
      title: 'Sistema',
      desc: 'QA runs, score de salud, training IA y estadísticas por fuente.',
    },
    {
      href: '/operador/iarest/crm',
      icon: '🎯',
      title: 'CRM',
      desc: 'Pipeline de leads: prospección, contactos y estado de cada oportunidad.',
    },
  ]

  return (
    <Pagina ancho="lectura">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>🍽️ ia-rest</h1>
        <a
          href={`${process.env.IAREST_URL || 'https://iarest.es'}/super`}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: '13px', color: 'var(--muted)', textDecoration: 'none' }}
        >
          Panel legacy ↗
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
        {sections.map(s => (
          <Link
            key={s.href}
            href={s.href}
            style={{ textDecoration: 'none', color: 'var(--text)' }}
          >
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '20px',
              transition: 'border-color .15s',
            }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>{s.icon}</div>
              <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '4px' }}>{s.title}</div>
              <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>{s.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </Pagina>
  )
}

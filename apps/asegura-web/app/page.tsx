import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { MEDIADOR } from '@central/module-seguros'
import { RAMOS } from '@/lib/ramos'
import { PORTAL_URL, url } from '@/lib/sitio'
import Formulario from '@/components/Formulario'

export const metadata: Metadata = {
  title: 'Correduría de seguros en Sevilla',
  description:
    'Correduría de seguros en Sevilla inscrita en la DGSFP. Comparamos entre varias compañías tu seguro de hogar, comunidad, comercio, auto, vida y salud. Te llamamos.',
  alternates: { canonical: url('/') },
}

const tarjeta: CSSProperties = {
  display: 'block',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radio)',
  padding: '16px 18px',
  textDecoration: 'none',
  color: 'var(--text)',
}

const panel: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radio)',
  padding: '22px 20px',
}

export default function Home() {
  return (
    <>
      <section style={{ padding: '8px 0 28px' }}>
        <h1>Correduría de seguros en Sevilla</h1>
        <p style={{ fontSize: 18, color: 'var(--muted)', maxWidth: 620 }}>
          Somos correduría, no aseguradora: trabajamos con varias compañías a la vez, así que nuestro trabajo es
          entender tu caso y decirte dónde encaja mejor — no colocarte la póliza de una marca concreta.
        </p>
        <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 620 }}>
          Te atiende {MEDIADOR.identidad.nombre}, corredor inscrito en la DGSFP con la clave{' '}
          <strong style={{ color: 'var(--text)' }}>{MEDIADOR.identidad.claveDgsfp}</strong>. La comisión la paga la
          compañía: tú no abonas ningún honorario por el servicio de mediación.
        </p>
        <p>
          <a
            href="#presupuesto"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 48,
              padding: '0 22px',
              background: 'var(--brand)',
              color: '#fff',
              fontWeight: 700,
              borderRadius: 12,
              textDecoration: 'none',
            }}
          >
            Que me llamen
          </a>{' '}
          {/* Segundo clic para quien ya es cliente: su intranet, donde guarda
              sus pólizas. Va al lado del CTA de venta, no escondido en el pie. */}
          <a
            href={PORTAL_URL}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 48,
              padding: '0 22px',
              background: 'var(--panel)',
              color: 'var(--brand-ink)',
              border: '1px solid var(--border)',
              fontWeight: 700,
              borderRadius: 12,
              textDecoration: 'none',
              marginTop: 8,
            }}
          >
            Ya soy cliente · Mis seguros
          </a>
        </p>
      </section>

      <section aria-labelledby="ramos" style={{ marginBottom: 32 }}>
        <h2 id="ramos">Qué revisamos</h2>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
          {RAMOS.map((r) => (
            <Link key={r.slug} href={`/seguros/${r.slug}`} style={tarjeta}>
              <strong style={{ display: 'block', fontSize: 17, marginBottom: 4, color: 'var(--brand-ink)' }}>{r.nombre}</strong>
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>{r.intro[0]?.slice(0, 120)}…</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="cambiar" style={{ ...panel, marginBottom: 32 }}>
        <h2 id="cambiar">¿Ya tienes seguro y solo quieres que lo lleve otro?</h2>
        <p style={{ marginBottom: 8 }}>
          No hace falta cambiar de compañía ni esperar al vencimiento para cambiar de correduría. Tu póliza sigue igual
          —mismas coberturas, mismo precio, mismo número— y pasamos a ser nosotros quienes la gestionamos.
        </p>
        <Link href="/cambiar-de-correduria" style={{ fontWeight: 600 }}>
          Cómo funciona el cambio de mediador →
        </Link>
      </section>

      <section id="presupuesto" aria-labelledby="pedir" style={panel}>
        <h2 id="pedir">Pide presupuesto o una revisión</h2>
        <p style={{ color: 'var(--muted)', fontSize: 15 }}>
          Cuéntanos qué seguro quieres mirar y te llamamos. Sin compromiso y sin coste.
        </p>
        <Formulario />
      </section>
    </>
  )
}

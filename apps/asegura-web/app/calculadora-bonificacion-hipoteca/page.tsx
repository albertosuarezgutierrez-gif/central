import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { OG_IMAGEN, url } from '@/lib/sitio'
import { fichaFaq, migas, jsonLd } from '@/lib/seo'
import type { Ramo } from '@/lib/ramos'
import CalculadoraBonificacion from '@/components/CalculadoraBonificacion'
import Formulario from '@/components/Formulario'

// Por qué existe (29/09/2026, idea de Alberto): quien tiene hipoteca paga al
// banco un seguro de vida o de hogar a cambio de una rebaja del tipo, y casi
// nadie echa la cuenta de lo que le cuesta DE VERDAD. La calculadora la hace:
// capital × puntos / 100 es lo que vale la bonificación, y lo que se paga por
// encima es el coste real. No promete ahorro (lib/ramos.test.ts lo vigila):
// enseña una cuenta con los datos de la persona y deja la decisión en su mano.

const TITULO = 'Calculadora del seguro de la hipoteca: coste real con bonificación'

export const metadata: Metadata = {
  title: TITULO,
  description:
    '¿Te compensa el seguro de vida u hogar del banco? Pon el capital, los puntos de bonificación y lo que pagas, y verás su coste real al año.',
  alternates: { canonical: url('/calculadora-bonificacion-hipoteca') },
  openGraph: { title: TITULO, url: url('/calculadora-bonificacion-hipoteca'), type: 'website', images: [OG_IMAGEN] },
}

const panel: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radio)',
  padding: '16px 18px',
}

const FAQ = {
  faq: [
    {
      pregunta: '¿Cómo se calcula lo que vale la bonificación?',
      respuesta:
        'Multiplicando el capital que te queda por pagar por los puntos que te rebajan y dividiendo entre cien. Con 40.000€ pendientes y 0,50 puntos, el banco te cobra unos 200€ menos de intereses al año.',
    },
    {
      pregunta: '¿Qué es el coste real del seguro?',
      respuesta:
        'Lo que pagas por el seguro menos lo que te ahorras de intereses por tenerlo. Si pagas 500€ y la bonificación vale 200€, el seguro te cuesta de verdad 300€ al año.',
    },
    {
      pregunta: '¿Por qué la cuenta es solo del primer año?',
      respuesta:
        'Porque la bonificación se aplica sobre el capital pendiente, y ese capital baja con cada cuota. Cada año la bonificación vale un poco menos, mientras que la prima del seguro suele mantenerse o subir.',
    },
    {
      pregunta: '¿Dónde miro los puntos de mi bonificación?',
      respuesta:
        'En la escritura de la hipoteca o en la oferta vinculante que te dio el banco. Suele venir cada producto con su rebaja: tanto por el seguro de vida, tanto por el de hogar, tanto por la nómina.',
    },
    {
      pregunta: '¿Guardáis los datos que escribo?',
      respuesta:
        'No. La cuenta se hace en tu propio navegador y no se envía a ningún sitio. Solo si nos escribes con el formulario de abajo recibimos lo que tú pongas en él.',
    },
  ],
} as Pick<Ramo, 'faq'>

export default function CalculadoraBonificacionHipoteca() {
  const faq = fichaFaq(FAQ as Ramo)
  const breadcrumb = migas([
    { nombre: 'Inicio', ruta: '/' },
    { nombre: 'Calculadora del seguro de la hipoteca', ruta: '/calculadora-bonificacion-hipoteca' },
  ])

  return (
    <div className="wrap pagina">
      {breadcrumb && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />}
      {faq && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faq) }} />}

      <nav aria-label="Migas de pan" style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>
        <Link href="/">Inicio</Link> <span aria-hidden>›</span> Seguro de la hipoteca
      </nav>

      <h1>¿Cuánto te cuesta de verdad el seguro del banco?</h1>
      <p style={{ fontSize: 17, color: 'var(--muted)', maxWidth: 640 }}>
        Si el banco te rebaja el tipo de la hipoteca por contratar su seguro de vida o de hogar, esa rebaja cuenta.
        Pon tus cifras y verás lo que te cuesta el seguro <strong style={{ color: 'var(--text)' }}>una vez
        descontada la bonificación</strong>.
      </p>

      <div style={{ margin: '24px 0', maxWidth: 640 }}>
        <CalculadoraBonificacion />
      </div>

      <section aria-labelledby="leer" style={{ ...panel, marginBottom: 24 }}>
        <h2 id="leer">Cómo leer el resultado</h2>
        <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 10 }}>
          <li>
            <strong>Compara con el coste real, no con el recibo.</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>
              Un seguro fuera del banco solo te compensa si cuesta menos que ese coste real, porque al cambiarlo pierdes la
              bonificación.
            </span>
          </li>
          <li>
            <strong>Mira coberturas, no solo precio.</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>
              Capital asegurado, beneficiario y exclusiones tienen que ser al menos iguales a los del seguro del banco.
            </span>
          </li>
          <li>
            <strong>Repite la cuenta cada año.</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>
              Al bajar el capital pendiente la bonificación vale menos, y lo que hoy no compensa puede compensar dentro de
              unos años.
            </span>
          </li>
        </ol>
      </section>

      <section aria-labelledby="contacto" style={{ marginBottom: 24, maxWidth: 640 }}>
        <h2 id="contacto">¿Te lo miramos?</h2>
        <p style={{ marginTop: 0 }}>
          Déjanos tus datos y un corredor revisa tu caso con la escritura y el seguro que tienes. Sin compromiso.
        </p>
        <Formulario ramoPorDefecto="vida" />
      </section>

      <section aria-labelledby="faq" style={{ marginBottom: 28 }}>
        <h2 id="faq">Preguntas frecuentes</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {FAQ.faq.map((f) => (
            <details key={f.pregunta} open style={{ ...panel, padding: '14px 16px' }}>
              <summary style={{ fontWeight: 700, cursor: 'pointer', minHeight: 28 }}>{f.pregunta}</summary>
              <p style={{ margin: '10px 0 0', color: 'var(--muted)' }}>{f.respuesta}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}

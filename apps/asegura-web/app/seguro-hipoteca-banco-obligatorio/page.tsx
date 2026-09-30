import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { CALCULADORA_HIPOTECA, OG_IMAGEN, url } from '@/lib/sitio'
import { fichaFaq, migas, jsonLd } from '@/lib/seo'
import type { Ramo } from '@/lib/ramos'

// Intención: «¿el banco me obliga a contratar su seguro con la hipoteca?».
// Contenido informativo, sin promesas de ahorro (lib/ramos.test.ts). No se citan
// números de artículo: la referencia es la ley y su texto en el BOE.

const RUTA = '/seguro-hipoteca-banco-obligatorio'
const BOE = 'https://www.boe.es/buscar/act.php?id=BOE-A-2019-3814'
const TITULO = '¿Te obliga el banco a contratar su seguro con la hipoteca?'

export const metadata: Metadata = {
  title: TITULO,
  description:
    'Qué puede exigirte el banco con la hipoteca y qué no: el seguro de daños, el de vida, la bonificación del tipo y tu derecho a llevar una póliza de otra aseguradora.',
  alternates: { canonical: url(RUTA) },
  openGraph: { title: TITULO, url: url(RUTA), type: 'website', images: [OG_IMAGEN] },
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
      pregunta: '¿El banco puede obligarme a contratar su seguro?',
      respuesta:
        'Puede exigirte tener determinados seguros, pero no que sean los suyos. La Ley 5/2019 de contratos de crédito inmobiliario limita la venta vinculada y obliga al banco a aceptar una póliza de otra aseguradora que ofrezca garantías equivalentes.',
    },
    {
      pregunta: '¿Es obligatorio el seguro de hogar con la hipoteca?',
      respuesta:
        'El seguro de daños sobre el inmueble hipotecado sí es exigible por la normativa del mercado hipotecario, porque la vivienda es la garantía del préstamo. Lo que no es obligatorio es contratarlo con el banco.',
    },
    {
      pregunta: '¿Es obligatorio el seguro de vida con la hipoteca?',
      respuesta:
        'Ninguna ley lo impone con carácter general, pero el banco sí puede pedirte como condición un seguro que garantice el pago del préstamo, como el de vida. Lo que no puede es obligarte a contratarlo con él: tiene que aceptar el de otra aseguradora con garantías equivalentes.',
    },
    {
      pregunta: '¿Qué pasa con la bonificación si contrato el seguro fuera del banco?',
      respuesta:
        'El banco puede condicionar la rebaja del tipo a que contrates sus productos. Si cambias de seguro, puedes perder esa bonificación y el tipo subir. Por eso conviene comparar el coste real del seguro del banco, descontando lo que te rebajan, antes de decidir.',
    },
    {
      pregunta: '¿Cómo sé si la póliza que traigo le vale al banco?',
      respuesta:
        'Debe ofrecer garantías equivalentes a las de la que el banco te propone. Compara capital asegurado, coberturas, exclusiones y beneficiario. Si quieres, un corredor revisa las dos contigo.',
    },
  ],
} as Pick<Ramo, 'faq'>

export default function SeguroHipotecaBancoObligatorio() {
  const faq = fichaFaq(FAQ as Ramo)
  const breadcrumb = migas([
    { nombre: 'Inicio', ruta: '/' },
    { nombre: 'Seguro de la hipoteca: ¿obligatorio?', ruta: RUTA },
  ])

  return (
    <div className="wrap pagina">
      {breadcrumb && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />}
      {faq && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faq) }} />}

      <nav aria-label="Migas de pan" style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>
        <Link href="/">Inicio</Link> <span aria-hidden>›</span> Seguro de la hipoteca
      </nav>

      <h1>{TITULO}</h1>
      <p style={{ fontSize: 17, color: 'var(--muted)', maxWidth: 680 }}>
        Puede exigirte un seguro, pero no que sea el suyo. Esto es lo que dice la normativa y lo que conviene mirar antes
        de firmar o de cambiar de póliza.
      </p>

      <section aria-labelledby="ley" style={{ ...panel, margin: '24px 0' }}>
        <h2 id="ley">Lo que dice la ley</h2>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 10 }}>
          <li>
            <strong>Venta vinculada y combinada.</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>
              La Ley 5/2019, reguladora de los contratos de crédito inmobiliario, limita que el banco te condicione la
              hipoteca a contratar otros productos. Puede exigirte un seguro, pero debe aceptar una póliza de otra
              aseguradora que ofrezca garantías equivalentes.
            </span>
          </li>
          <li>
            <strong>Bonificar el tipo sí puede.</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>
              El banco puede rebajarte el tipo de interés a cambio de que contrates productos con él. Si después cambias
              el seguro, puedes perder esa bonificación.
            </span>
          </li>
          <li>
            <strong>Seguro de daños del inmueble.</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>
              La normativa del mercado hipotecario permite exigirlo, porque la vivienda es la garantía del préstamo.
            </span>
          </li>
          <li>
            <strong>Seguro de vida.</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>
              No lo impone la ley, pero el banco puede pedirlo como garantía del préstamo. Puedes contratarlo con
              otra aseguradora si las garantías son equivalentes; con el banco, suele ir ligado a una bonificación.
            </span>
          </li>
        </ul>
        <p style={{ margin: '14px 0 0', fontSize: 14, color: 'var(--muted)' }}>
          Texto de la ley en el{' '}
          <a href={BOE} target="_blank" rel="noopener noreferrer">
            BOE (BOE-A-2019-3814)
          </a>
          . Esta página es informativa y no sustituye a la lectura de tu contrato ni a un asesoramiento sobre tu caso.
        </p>
      </section>

      <section aria-labelledby="pasos" style={{ marginBottom: 24 }}>
        <h2 id="pasos">Qué mirar antes de decidir</h2>
        <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 10 }}>
          <li>
            <strong>Lee qué te bonifican y por qué.</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>
              En la escritura o en la oferta vinculante figura cada producto con su rebaja del tipo.
            </span>
          </li>
          <li>
            <strong>Echa la cuenta del coste real.</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>
              Lo que pagas por el seguro menos lo que te rebajan en intereses. La calculadora lo hace con tus cifras.
            </span>
          </li>
          <li>
            <strong>Compara coberturas, no solo la cifra.</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>
              Una póliza ajena tiene que ofrecer garantías equivalentes para que el banco la acepte.
            </span>
          </li>
        </ol>
        <div className="hero-cta">
          <Link href={CALCULADORA_HIPOTECA} className="btn btn-brand" style={{ minHeight: 44 }}>
            Calcular el coste real del seguro
          </Link>
          <Link href="/#presupuesto" className="btn btn-outline" style={{ minHeight: 44 }}>
            Que un corredor lo revise
          </Link>
        </div>
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

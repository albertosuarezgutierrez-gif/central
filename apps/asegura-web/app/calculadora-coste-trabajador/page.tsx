import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { OG_IMAGEN, url } from '@/lib/sitio'
import { fichaFaq, migas, jsonLd } from '@/lib/seo'
import type { Ramo } from '@/lib/ramos'
import { RUTA_COSTE_TRABAJADOR } from '@/lib/coste-trabajador'
import CalculadoraCosteTrabajador from '@/components/CalculadoraCosteTrabajador'
import Formulario from '@/components/Formulario'

// Por qué existe (07/11/2026, docs/HERRAMIENTAS-CAPTACION.md): quien va a
// contratar quiere saber el coste REAL (bruto + Seguridad Social de la empresa),
// y casi nadie sabe que un seguro de salud pagado como retribución flexible le
// sube el neto al trabajador sin subir el coste. La cuenta es el motor de
// nóminas del grupo (`@central/module-nominas`) en el navegador; el lead va por
// el MISMO formulario que el resto de la web (`/api/lead` → plataforma).

const TITULO = 'Calculadora: ¿cuánto cuesta contratar a un trabajador?'

export const metadata: Metadata = {
  title: TITULO,
  description:
    'Calcula el coste de un trabajador para la empresa en 2026: bruto, Seguridad Social desglosada, neto e IRPF. Y cuánto gana con el seguro de salud como retribución flexible.',
  alternates: { canonical: url(RUTA_COSTE_TRABAJADOR) },
  openGraph: { title: TITULO, url: url(RUTA_COSTE_TRABAJADOR), type: 'website', images: [OG_IMAGEN] },
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
      pregunta: '¿Cuánto le cuesta a la empresa un trabajador además del sueldo?',
      respuesta:
        'La cuota de Seguridad Social de la empresa: contingencias comunes, desempleo, FOGASA, formación profesional, MEI y accidentes de trabajo. En un contrato indefinido suele rondar un tercio del salario bruto, según la actividad.',
    },
    {
      pregunta: '¿Qué es el seguro de salud como retribución flexible?',
      respuesta:
        'La empresa paga el seguro médico del trabajador en lugar de una parte del sueldo en dinero. Hasta 500€ al año por persona asegurada (1.500€ con discapacidad) no tributan en el IRPF, según el artículo 42.3.c) de la Ley del IRPF.',
    },
    {
      pregunta: '¿Le cuesta más a la empresa?',
      respuesta:
        'No. El seguro sí cotiza a la Seguridad Social igual que el salario (artículo 147 de la Ley General de la Seguridad Social), así que el coste total no cambia. Lo que baja es la retención de IRPF del trabajador.',
    },
    {
      pregunta: '¿Por qué dice «aproximado»?',
      respuesta:
        'Porque falta algún dato que cambia la cuenta (la actividad de la empresa, la duración del contrato temporal o las horas reales a tiempo parcial) o hay una cifra pendiente de verificar. La calculadora lo dice en lugar de inventarlo.',
    },
    {
      pregunta: '¿Guardáis los datos que escribo?',
      respuesta:
        'No. La cuenta se hace en tu propio navegador y no se envía a ningún sitio. Solo si nos escribes con el formulario de abajo recibimos lo que tú pongas en él.',
    },
  ],
} as Pick<Ramo, 'faq'>

export default function CalculadoraCosteTrabajadorPagina() {
  const faq = fichaFaq(FAQ as Ramo)
  const breadcrumb = migas([
    { nombre: 'Inicio', ruta: '/' },
    { nombre: 'Calculadora del coste de un trabajador', ruta: RUTA_COSTE_TRABAJADOR },
  ])

  return (
    <div className="wrap pagina">
      {breadcrumb && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />}
      {faq && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faq) }} />}

      <nav aria-label="Migas de pan" style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>
        <Link href="/">Inicio</Link> <span aria-hidden>›</span> Coste de un trabajador
      </nav>

      <h1>¿Cuánto cuesta contratar a un trabajador?</h1>
      <p style={{ fontSize: 17, color: 'var(--muted)', maxWidth: 640 }}>
        Pon el salario y el tipo de contrato y verás el coste total para la empresa, la Seguridad Social desglosada y lo que
        cobra el trabajador. Añade un seguro de salud y verás cuánto gana él sin que a ti te cueste más.
      </p>

      <div style={{ margin: '24px 0 32px' }}>
        <CalculadoraCosteTrabajador />
      </div>

      <section aria-labelledby="aviso-legal" style={{ ...panel, marginBottom: 24 }}>
        <h2 id="aviso-legal">Es una cuenta orientativa</h2>
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          Usa las bases y tipos de cotización de 2026 y el procedimiento general de retenciones del IRPF. No tiene en cuenta
          bonificaciones a la contratación, pluses del convenio, horas extra ni regularizaciones, y no sustituye a la nómina
          ni al consejo de tu asesoría laboral o fiscal. Grupo ASegura no se hace responsable de decisiones tomadas solo con
          este resultado.
        </p>
      </section>

      <section aria-labelledby="contacto" style={{ marginBottom: 24, maxWidth: 640 }}>
        <h2 id="contacto">Te ayudamos con el seguro de convenio o de salud de tu plantilla</h2>
        <p style={{ marginTop: 0 }}>
          Déjanos tus datos y un corredor te prepara el seguro que pide tu convenio o un seguro de salud para tu equipo. Sin
          compromiso.
        </p>
        <Formulario ramoPorDefecto="salud" />
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

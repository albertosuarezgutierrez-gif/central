import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { OG_IMAGEN, url } from '@/lib/sitio'
import { fichaFaq, migas, jsonLd } from '@/lib/seo'
import type { Ramo } from '@/lib/ramos'
import CartaBaja from '@/components/CartaBaja'

// Por qué existe (medido con OpenSEO el 26/09/2026): «modelo carta baja seguro»
// (140/mes), «carta de baja seguro coche» (70) y «carta baja seguro hogar» (40)
// tienen dificultad 0 y la primera página son webs de plantillas estáticas —
// no aseguradoras. «dar de baja seguro coche» (390, KD 0) va por el mismo
// camino. Una herramienta que rellena la carta Y calcula el último día gana a
// una plantilla en Word, y no es asesoramiento: la carta es de la persona.
//
// Es la puerta de entrada al gestor: quien llega aquí tiene un vencimiento
// encima, y el cierre del componente le ofrece no volver a buscarlo.

const TITULO = 'Modelo de carta para dar de baja un seguro'

export const metadata: Metadata = {
  title: TITULO,
  description:
    'Rellena tus datos y descarga la carta para no renovar tu seguro de coche, hogar o salud. Te decimos el último día para enviarla. Gratis y sin registro.',
  alternates: { canonical: url('/carta-baja-seguro') },
  openGraph: { title: TITULO, url: url('/carta-baja-seguro'), type: 'website', images: [OG_IMAGEN] },
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
      pregunta: '¿Hasta cuándo puedo enviar la carta?',
      respuesta:
        'Hasta un mes antes de la fecha de vencimiento de la póliza (art. 22 de la Ley de Contrato de Seguro). Lo que cuenta es que puedas demostrar que la enviaste en plazo, así que guarda el justificante.',
    },
    {
      pregunta: '¿Sirve la misma carta para el coche, el hogar o la salud?',
      respuesta:
        'Sí. La ley es la misma para todos los seguros que se renuevan cada año: basta un escrito con tus datos, el número de póliza, el vencimiento y tu voluntad de no prorrogar el contrato.',
    },
    {
      pregunta: '¿A qué dirección la envío?',
      respuesta:
        'A la que tu compañía indique para estas comunicaciones: suele estar en las condiciones de la póliza o en su área de cliente. Si no la encuentras, un burofax con acuse de recibo a su domicilio social siempre deja constancia.',
    },
    {
      pregunta: '¿Guardáis los datos que escribo?',
      respuesta:
        'No. La carta se prepara en tu propio navegador y no se envía a ningún servidor: al cerrar la página desaparece. La envías tú, desde tu correo o por correo postal.',
    },
    {
      pregunta: '¿Y si se me ha pasado el plazo?',
      respuesta:
        'La póliza se renueva un año más. La carta te sirve igual para el vencimiento siguiente: pon esa fecha y te decimos el nuevo último día.',
    },
  ],
} as Pick<Ramo, 'faq'>

export default function CartaBajaSeguro() {
  const faq = fichaFaq(FAQ as Ramo)
  const breadcrumb = migas([
    { nombre: 'Inicio', ruta: '/' },
    { nombre: 'Carta para dar de baja un seguro', ruta: '/carta-baja-seguro' },
  ])

  return (
    <div className="wrap pagina">
      {breadcrumb && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />}
      {faq && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faq) }} />}

      <nav aria-label="Migas de pan" style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>
        <Link href="/">Inicio</Link> <span aria-hidden>›</span> Carta de baja
      </nav>

      <h1>Carta para dar de baja un seguro</h1>
      <p style={{ fontSize: 17, color: 'var(--muted)', maxWidth: 640 }}>
        Para que un seguro no se renueve hay que avisar a la compañía <strong style={{ color: 'var(--text)' }}>por
        escrito y al menos un mes antes del vencimiento</strong>. Escribe tus datos y te dejamos la carta lista para
        copiar, imprimir o enviar desde tu correo, con el último día para mandarla. Vale para el coche, la moto, el
        hogar, la salud o cualquier seguro anual.
      </p>

      <div style={{ margin: '24px 0' }}>
        <CartaBaja />
      </div>

      <section aria-labelledby="enviar" style={{ ...panel, marginBottom: 24 }}>
        <h2 id="enviar">Cómo enviarla para que cuente</h2>
        <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 10 }}>
          <li>
            <strong>Por un canal que deje constancia:</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>
              el correo o el formulario que indique tu compañía, o un burofax con acuse de recibo.
            </span>
          </li>
          <li>
            <strong>Guarda el justificante con la fecha.</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>Si hay discusión, lo que decide es cuándo la enviaste.</span>
          </li>
          <li>
            <strong>No vale dejar de pagar el recibo</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>ni una llamada sin más: ninguna de las dos es una comunicación por escrito.</span>
          </li>
        </ol>
        <p style={{ margin: '12px 0 0' }}>
          Todos los pasos, con lo que pasa después:{' '}
          <Link href="/blog/como-dar-de-baja-un-seguro-a-tiempo">cómo dar de baja un seguro a tiempo</Link>.
        </p>
      </section>

      <section aria-labelledby="alternativa" style={{ marginBottom: 24 }}>
        <h2 id="alternativa">¿Te vas porque nadie te atiende?</h2>
        <p style={{ maxWidth: 640, marginTop: 0 }}>
          Entonces quizá no hace falta cambiar de seguro. Puedes{' '}
          <Link href="/cambiar-de-correduria">cambiar de correduría sin cambiar de póliza</Link>: mismas coberturas,
          mismo precio y mismo número, sin esperar al vencimiento.
        </p>
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

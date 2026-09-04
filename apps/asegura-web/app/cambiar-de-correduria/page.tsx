import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { MEDIADOR } from '@central/module-seguros'
import { url } from '@/lib/sitio'
import { fichaFaq, migas, jsonLd } from '@/lib/seo'
import type { Ramo } from '@/lib/ramos'
import Formulario from '@/components/Formulario'

// La página con más intención de compra de todo el sitio y, a la vez, la que
// casi nadie escribe: quien busca «cambiar de correduría sin cambiar de seguro»
// ya es cliente de otro y quiere irse. Convierte un lead en cliente SIN
// tarificar — o sea, sin gastar los 0,50 € de una consulta a Avant2 y sin
// competir por precio, que es la pelea que no se gana.
//
// 🚨 Tono: aquí es especialmente fácil resbalar hacia el asesoramiento. Lo que
// se explica es un TRÁMITE (quién gestiona la póliza), no una recomendación de
// producto. En cuanto se insinúe «te conseguimos algo mejor», arrastra análisis
// objetivo e IPID (RDL 3/2020).

export const metadata: Metadata = {
  title: 'Cambiar de correduría sin cambiar de seguro',
  description:
    'Puedes cambiar de mediador sin tocar tu póliza: mismas coberturas, mismo precio y mismo número. Te explicamos cómo funciona el cambio de correduría en Sevilla.',
  alternates: { canonical: url('/cambiar-de-correduria') },
  openGraph: { title: 'Cambiar de correduría sin cambiar de seguro', url: url('/cambiar-de-correduria'), type: 'article' },
}

const panel: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radio)',
  padding: '20px',
}

const PASOS = [
  {
    titulo: 'Nos dices qué pólizas quieres traer',
    cuerpo:
      'Con el número de póliza y la compañía basta para empezar. Si no lo tienes a mano, aparece en el recibo del banco.',
  },
  {
    titulo: 'Firmas la orden de sustitución de mediador',
    cuerpo:
      'Es un documento corto que dice que a partir de ahora tu póliza la gestionamos nosotros. Lo firmas tú como tomador; nadie puede hacerlo en tu nombre.',
  },
  {
    titulo: 'Lo comunicamos a la compañía',
    cuerpo:
      'La aseguradora registra el cambio de mediador. La póliza sigue siendo la misma: mismo número, mismas coberturas y mismo vencimiento.',
  },
  {
    titulo: 'A partir de ahí, nos llamas a nosotros',
    cuerpo:
      'Para un parte, una duda del condicionado o la renovación. Y con la fecha de vencimiento apuntada, que es lo que se suele pasar.',
  },
] as const

// Se reutiliza el constructor de FAQ de los ramos: el JSON-LD `FAQPage` es el
// mismo, y duplicar el generador para una página suelta es cómo se acaba con
// dos formatos de marcado distintos en el mismo sitio.
const FAQ = {
  slug: 'cambiar-de-correduria',
  faq: [
    {
      pregunta: '¿Cambiar de correduría cambia mi póliza o mi precio?',
      respuesta:
        'No. La póliza es un contrato entre tú y la compañía aseguradora; el mediador es quien la gestiona y te asesora. Al cambiar de mediador, el número de póliza, las coberturas, la prima y la fecha de vencimiento siguen exactamente igual.',
    },
    {
      pregunta: '¿Tengo que esperar al vencimiento para cambiar de mediador?',
      respuesta:
        'No. Cambiar de mediador no es lo mismo que cambiar de seguro: no hay que esperar a la renovación ni dar ningún preaviso al respecto. El preaviso de un mes del artículo 22 de la Ley de Contrato de Seguro se refiere a no renovar la póliza, que es otra cosa distinta.',
    },
    {
      pregunta: '¿Cuesta algo?',
      respuesta:
        'No. Como corredores percibimos una comisión sobre la prima que abona la entidad aseguradora; el cliente no paga ningún honorario adicional por el servicio de mediación.',
    },
    {
      pregunta: '¿Se puede hacer siempre?',
      respuesta:
        'Casi siempre, pero no es automático: cada compañía tiene su procedimiento y algunas ponen condiciones, por ejemplo sobre pólizas recién emitidas o con recibos pendientes. Lo comprobamos con tu compañía antes de que firmes nada y te decimos si en tu caso concreto se puede o no.',
    },
    {
      pregunta: '¿Tengo que avisar yo a mi correduría actual?',
      respuesta:
        'No hace falta que se lo comuniques tú: la sustitución se tramita con la compañía aseguradora. Si prefieres avisarles por cortesía, puedes hacerlo, pero no es un requisito del trámite.',
    },
  ],
} as unknown as Ramo

export default function CambiarDeCorreduria() {
  const faq = fichaFaq(FAQ)
  const breadcrumb = migas([
    { nombre: 'Inicio', ruta: '/' },
    { nombre: 'Cambiar de correduría', ruta: '/cambiar-de-correduria' },
  ])

  return (
    <>
      {breadcrumb && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />}
      {faq && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faq) }} />}

      <nav aria-label="Migas de pan" style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>
        <Link href="/">Inicio</Link> <span aria-hidden>›</span> Cambiar de correduría
      </nav>

      <h1>Cambiar de correduría sin cambiar de seguro</h1>
      <p style={{ fontSize: 17, color: 'var(--muted)', maxWidth: 640 }}>
        Mucha gente aguanta con un mediador con el que no cuenta porque cree que para cambiar hay que anular la póliza y
        volver a empezar. No es así: <strong style={{ color: 'var(--text)' }}>la póliza y el mediador son dos cosas
        distintas</strong>. Puedes quedarte con tu seguro exactamente como está y cambiar solo quién te lo lleva.
      </p>
      <p style={{ maxWidth: 640 }}>
        Tu contrato es con la compañía aseguradora. Nosotros somos el corredor: quien te explica el condicionado, te
        avisa del vencimiento y da la cara cuando hay un siniestro.
      </p>

      <section aria-labelledby="pasos" style={{ ...panel, margin: '24px 0' }}>
        <h2 id="pasos">Cómo funciona</h2>
        <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 14 }}>
          {PASOS.map((p) => (
            <li key={p.titulo}>
              <strong>{p.titulo}.</strong> <span style={{ color: 'var(--muted)' }}>{p.cuerpo}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="no-cambia" style={{ marginBottom: 24 }}>
        <h2 id="no-cambia">Lo que NO cambia</h2>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
          <li>El número de póliza y la compañía.</li>
          <li>Las coberturas y el condicionado que firmaste.</li>
          <li>La prima y la forma de pago.</li>
          <li>La fecha de vencimiento y la antigüedad acumulada.</li>
        </ul>
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

      <section id="presupuesto" aria-labelledby="pedir" style={panel}>
        <h2 id="pedir">Cuéntanos qué pólizas quieres traer</h2>
        <p style={{ color: 'var(--muted)', fontSize: 15 }}>
          Te decimos si en tu caso se puede y qué hace falta. Te atiende {MEDIADOR.identidad.nombre}.
        </p>
        <Formulario />
      </section>
    </>
  )
}

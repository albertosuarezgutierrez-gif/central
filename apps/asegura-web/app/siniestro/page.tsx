import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { MEDIADOR } from '@central/module-seguros'
import { url } from '@/lib/sitio'
import { fichaFaq, migas, jsonLd } from '@/lib/seo'
import type { Ramo } from '@/lib/ramos'
import Formulario from '@/components/Formulario'

// 🚨 Esta página NO es contenido nuevo inventado: RECUPERA una URL que Google ya
// tenía indexada del sitio anterior y que llevaba en 404 desde que este proyecto
// tomó el apex (05/09/2026). Medido en Search Console el 07/09/2026:
// `/siniestro/` acumulaba impresiones en **posición media 7,7** — la mejor de
// todo el dominio, con la portada en 49,3. O sea: la única consulta en la que el
// negocio ya competía se estaba sirviendo con una página de error.
//
// Por eso el slug es exactamente `/siniestro`, y no uno «mejor»: cambiarlo
// tiraría la señal que se viene a recuperar. (Google entra por `/siniestro/`;
// Next quita la barra final con una 308 y llega aquí.)
//
// 🚨 Tono, que aquí es lo delicado: se explica un TRÁMITE y unos PLAZOS DE LEY,
// no se promete un resultado. «Te conseguimos que te paguen» sería asesoramiento
// y arrastraría análisis objetivo e IPID (RDL 3/2020, arts. 11 y 17). Lo que sí
// se puede decir —y es lo que de verdad distingue a un corredor— es de qué lado
// está: el corredor trabaja para el asegurado, no para la compañía.
//
// Los artículos citados son de la Ley 50/1980 de Contrato de Seguro. Van con el
// número porque una cita verificable es lo que separa esto de un texto de
// comparador; si alguien los toca, que los compruebe antes.

export const metadata: Metadata = {
  title: 'Qué hacer si tienes un siniestro',
  description:
    'Los plazos que marca la ley cuando das un parte: 7 días para comunicarlo, 40 para el pago mínimo. Qué hace tu corredor y qué puedes hacer si la compañía deniega o no contesta.',
  alternates: { canonical: url('/siniestro') },
  openGraph: {
    title: 'Qué hacer si tienes un siniestro',
    url: url('/siniestro'),
    type: 'article',
  },
}

const panel: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radio)',
  padding: '20px',
}

const PASOS = [
  {
    titulo: 'Pon a salvo lo urgente y evita que vaya a más',
    cuerpo:
      'Cortar el agua, apuntalar, llamar a los servicios de emergencia. La ley te obliga a aminorar las consecuencias (art. 17 LCS) y esos gastos corren a cargo del asegurador.',
  },
  {
    titulo: 'Guarda pruebas antes de tocar nada',
    cuerpo:
      'Fotos y vídeo de los daños, de dónde vienen y de lo que se ha estropeado. Facturas de lo dañado si las tienes. Es lo que después mira el perito, y lo que ya no se puede reconstruir cuando está todo recogido.',
  },
  {
    titulo: 'Comunica el siniestro dentro de plazo',
    cuerpo:
      'Siete días desde que lo conoces, salvo que tu póliza dé más (art. 16 LCS). Hazlo por un canal que deje rastro y quédate con el número de expediente.',
  },
  {
    titulo: 'No aceptes ni firmes un cierre que no entiendas',
    cuerpo:
      'La cifra de la primera valoración no siempre es la última palabra. Antes de firmar un finiquito, pregunta qué partidas incluye y cuáles se han dejado fuera.',
  },
]

const PLAZOS = [
  {
    plazo: '7 días',
    que: 'para comunicar el siniestro a la compañía desde que lo conoces, salvo que la póliza fije un plazo mayor.',
    norma: 'art. 16 LCS',
  },
  {
    plazo: '40 días',
    que: 'es el plazo en que la compañía debe abonar el importe mínimo de lo que pueda deber, aunque el expediente siga abierto.',
    norma: 'art. 18 LCS',
  },
  {
    plazo: '3 meses',
    que: 'si pasan sin que la compañía pague ni consigne, la ley prevé un recargo por mora sobre la indemnización.',
    norma: 'art. 20 LCS',
  },
]

// FAQ con la forma de `Ramo` porque `fichaFaq()` ya sabe emitir el `FAQPage` y
// devolver `null` cuando no hay preguntas. Reutilizar el constructor evita una
// segunda forma de escribir el mismo JSON-LD.
const FAQ = {
  faq: [
    {
      pregunta: '¿Puedo dar el parte yo mismo o tiene que hacerlo el corredor?',
      respuesta:
        'Puedes darlo tú, y si el plazo aprieta hazlo sin esperar a nadie: lo que cuenta es que la compañía lo reciba dentro de los siete días del art. 16 LCS. Dinos el número de expediente y seguimos nosotros desde ahí.',
    },
    {
      pregunta: '¿Me van a subir la prima por dar un parte?',
      respuesta:
        'Depende de la compañía, del ramo y de tu historial; no es automático ni lo decidimos nosotros. Lo que sí podemos hacer es decirte qué suele pesar en tu caso antes de que abras el parte, para que la decisión sea tuya y con la información delante.',
    },
    {
      pregunta: 'La compañía dice que mi póliza no cubre esto. ¿Se acabó?',
      respuesta:
        'No necesariamente. Una denegación se sostiene en una cláusula concreta del condicionado, y lo primero es leerla y ver si el hecho encaja de verdad en ella. Si el desacuerdo es sobre la valoración del daño y no sobre la cobertura, el art. 38 LCS abre el procedimiento pericial: cada parte nombra su perito y, si no coinciden, se designa un tercero.',
    },
    {
      pregunta: '¿Y si no me contestan o no me pagan?',
      respuesta:
        'La vía es escalonada: primero el Servicio de Atención al Cliente de la propia aseguradora, que tiene la obligación de contestarte por escrito; después, si lo hay, el Defensor del Asegurado; y agotado eso, el Servicio de Reclamaciones de la DGSFP. No se puede reclamar a la DGSFP sin haber pasado antes por el servicio de la compañía.',
    },
    {
      pregunta: '¿Qué hace exactamente un corredor en un siniestro?',
      respuesta:
        'Somos correduría, no compañía: nuestro cliente eres tú. Eso significa leer el condicionado que firmaste, decirte qué cubre y qué no en tus palabras, seguir el expediente para que no se quede parado y, si hay desacuerdo, ayudarte a plantearlo por el cauce que corresponde. No decidimos la indemnización, que la fija la compañía.',
    },
  ],
} as Pick<Ramo, 'faq'>

export default function Siniestro() {
  const faq = fichaFaq(FAQ as Ramo)
  const breadcrumb = migas([
    { nombre: 'Inicio', ruta: '/' },
    { nombre: 'Siniestros', ruta: '/siniestro' },
  ])

  return (
    <div className="wrap pagina">
      {breadcrumb && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />}
      {faq && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faq) }} />}

      <nav aria-label="Migas de pan" style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>
        <Link href="/">Inicio</Link> <span aria-hidden>›</span> Siniestros
      </nav>

      <h1>Qué hacer si tienes un siniestro</h1>
      <p style={{ fontSize: 17, color: 'var(--muted)', maxWidth: 640 }}>
        Un siniestro es el único momento en que se ve para qué servía la póliza, y suele pillar a la gente sin saber por
        dónde empezar. Esto es lo que hay que hacer, en orden, y{' '}
        <strong style={{ color: 'var(--text)' }}>los plazos que marca la ley</strong> — que corren desde el día del
        parte, no desde que a uno le viene bien.
      </p>
      <p style={{ maxWidth: 640 }}>
        Si eres cliente nuestro, llámanos y lo abrimos contigo. Si no lo eres, la información de esta página te sirve
        igual: está para que sepas qué puedes exigir.
      </p>

      <section aria-labelledby="pasos" style={{ ...panel, margin: '24px 0' }}>
        <h2 id="pasos">Los primeros pasos, en orden</h2>
        <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 14 }}>
          {PASOS.map((p) => (
            <li key={p.titulo}>
              <strong>{p.titulo}.</strong> <span style={{ color: 'var(--muted)' }}>{p.cuerpo}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="plazos" style={{ marginBottom: 24 }}>
        <h2 id="plazos">Los plazos que fija la Ley de Contrato de Seguro</h2>
        <p style={{ color: 'var(--muted)', maxWidth: 640, marginTop: 0 }}>
          No son costumbre del sector: están en la Ley 50/1980 y se pueden citar cuando un expediente se queda parado.
        </p>
        {/* Lista, no tabla: son tres filas de texto y una tabla obligaría a
            scroll horizontal en móvil sin ganar nada. */}
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 12 }}>
          {PLAZOS.map((p) => (
            <li key={p.norma} style={{ ...panel, padding: '14px 16px' }}>
              <strong style={{ fontSize: 18 }}>{p.plazo}</strong>{' '}
              <span style={{ color: 'var(--muted)' }}>{p.que}</span>{' '}
              <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>({p.norma})</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="lado" style={{ marginBottom: 24 }}>
        <h2 id="lado">De qué lado está tu corredor</h2>
        <p style={{ maxWidth: 640, marginTop: 0 }}>
          Es la diferencia práctica entre una correduría y la red de una compañía: nosotros mediamos con varias
          entidades y quien nos ha contratado eres tú. En un siniestro eso se traduce en cosas concretas — leerte el
          condicionado que firmaste, seguir el expediente para que no se quede en un cajón y plantear el desacuerdo por
          el cauce que toca. La indemnización la fija la compañía; lo que no debería es fijarla sin que nadie de tu
          lado haya mirado el contrato.
        </p>
        <p style={{ maxWidth: 640 }}>
          ¿Estás en otra correduría y no te cogen el teléfono cuando hay un parte?{' '}
          <Link href="/cambiar-de-correduria">Puedes cambiar de mediador sin tocar tu póliza</Link>.
        </p>
        {/* El blog entró en `main` mientras se escribía esta página. No compiten:
            esto es el proceso entero y ese artículo es UN caso concreto —el
            peor— contado en detalle. Sin el enlace serían dos islas sobre el
            mismo tema, que es justo lo que este PR viene a arreglar. */}
        <p style={{ maxWidth: 640 }}>
          Si el caso ya está denegado, la guía larga está aquí:{' '}
          <Link href="/blog/siniestro-denegado-que-hacer">qué hacer cuando la compañía deniega un siniestro</Link>.
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

      <section id="presupuesto" aria-labelledby="pedir" style={panel}>
        <h2 id="pedir">Cuéntanos qué ha pasado</h2>
        <p style={{ color: 'var(--muted)', fontSize: 15 }}>
          Sin compromiso y sin coste. Te contesta {MEDIADOR.identidad.nombre}.
        </p>
        <Formulario />
      </section>
    </div>
  )
}

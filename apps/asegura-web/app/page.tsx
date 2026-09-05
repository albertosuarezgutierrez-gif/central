import type { Metadata } from 'next'
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

/**
 * Iconos de los ramos.
 *
 * Trazo de `currentColor` y sin relleno: heredan el color del token de marca de
 * su tarjeta, así que no hay ni un hex aquí. Se dibujan a mano en vez de traer
 * una librería de iconos porque son cinco y una dependencia entera por cinco
 * glifos es peso que paga el visitante del móvil.
 */
function IconoRamo({ slug }: { slug: string }) {
  const trazo = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (slug) {
    case 'hogar':
      return (
        <svg {...trazo}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.5V20h13V9.5" />
          <path d="M9.5 20v-5h5v5" />
        </svg>
      )
    case 'comunidades':
      return (
        <svg {...trazo}>
          <path d="M3 21h18" />
          <path d="M5 21V6l7-3 7 3v15" />
          <path d="M9 9h2M13 9h2M9 13h2M13 13h2M9 17h2M13 17h2" />
        </svg>
      )
    case 'comercio':
      return (
        <svg {...trazo}>
          <path d="M4 8h16l-1 3.5a3 3 0 0 1-3 2.3H8a3 3 0 0 1-3-2.3Z" />
          <path d="M6 8 7.5 4h9L18 8" />
          <path d="M6 14v7h12v-7" />
        </svg>
      )
    case 'auto':
      return (
        <svg {...trazo}>
          <path d="M4 16v3M20 16v3" />
          <path d="M3.5 16h17v-3.2L18.8 8H5.2L3.5 12.8Z" />
          <path d="M7 12.5h.01M17 12.5h.01" />
        </svg>
      )
    case 'vida-y-salud':
      return (
        <svg {...trazo}>
          <path d="M12 20s-7-4.4-7-9.2A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.8C19 15.6 12 20 12 20Z" />
        </svg>
      )
    default:
      return (
        <svg {...trazo}>
          <path d="M12 3.5 4.5 6.5v5c0 4.4 3.1 7.9 7.5 9 4.4-1.1 7.5-4.6 7.5-9v-5Z" />
        </svg>
      )
  }
}

/**
 * Los tres argumentos de la portada.
 *
 * 🚨 Ninguno es una promesa sobre el precio. Lo que puede decir una correduría
 * sin caer en asesoramiento (RDL 3/2020) es QUÉ es y CÓMO trabaja: varias
 * compañías, análisis propio, y una persona con nombre y clave DGSFP. En cuanto
 * apareciera un «ahorra un X %» esto pasaría a exigir análisis objetivo
 * documentado e IPID antes de contratar.
 */
const CONFIANZA = [
  {
    titulo: 'Correduría, no aseguradora',
    texto: 'Trabajamos con varias compañías a la vez. Nuestro trabajo es entender tu caso, no colocarte una marca concreta.',
  },
  {
    titulo: 'No pagas el servicio',
    texto: 'La comisión la paga la compañía. No abonas ningún honorario por la mediación.',
  },
  {
    titulo: 'Te atiende una persona',
    texto: `${MEDIADOR.identidad.nombre}, corredor inscrito en la DGSFP. Siempre el mismo interlocutor.`,
  },
] as const

const PASOS = [
  {
    titulo: 'Nos cuentas qué quieres mirar',
    texto: 'Un formulario corto o una llamada. Si ya tienes póliza, con verla basta para empezar.',
  },
  {
    titulo: 'Lo estudiamos con varias compañías',
    texto: 'Miramos coberturas, límites y exclusiones, no solo la cifra de la prima.',
  },
  {
    titulo: 'Te lo explicamos y decides tú',
    texto: 'Te contamos qué cubre cada opción y en qué se diferencian. Sin compromiso y sin coste.',
  },
] as const

export default function Home() {
  return (
    <>
      <section className="hero">
        <span className="chip">
          <span className="chip-punto" aria-hidden="true" />
          Corredor inscrito en la DGSFP · {MEDIADOR.identidad.claveDgsfp}
        </span>
        <h1>Tu seguro, mirado por alguien que no trabaja para la aseguradora</h1>
        <p className="lead">
          Correduría de seguros en Sevilla. Estudiamos tu hogar, tu comunidad, tu comercio, tu coche o tu salud entre
          varias compañías y te explicamos qué cubre cada opción.
        </p>
        <div className="hero-cta">
          <a href="#presupuesto" className="btn btn-brand">
            Que me llamen
          </a>
          {/* Segundo clic para quien ya es cliente: su intranet, donde guarda
              sus pólizas. Va junto al CTA de venta, no escondido en el pie. */}
          <a href={PORTAL_URL} className="btn btn-suave">
            Ya soy cliente · Mis seguros
          </a>
        </div>
      </section>

      <div className="confianza">
        {CONFIANZA.map((c) => (
          <div key={c.titulo} className="confianza-item">
            <strong>{c.titulo}</strong>
            <span>{c.texto}</span>
          </div>
        ))}
      </div>

      <section className="seccion" aria-labelledby="ramos">
        <div className="seccion-tit">
          <h2 id="ramos">Qué revisamos</h2>
          <p className="tenue">Cada página cuenta qué conviene mirar en ese seguro antes de firmarlo.</p>
        </div>
        <div className="rejilla">
          {RAMOS.map((r) => (
            <Link key={r.slug} href={`/seguros/${r.slug}`} className="tarjeta">
              <span className="tarjeta-icono">
                <IconoRamo slug={r.slug} />
              </span>
              <h3>{r.nombre}</h3>
              <p>{r.intro[0]?.slice(0, 116)}…</p>
              <span className="tarjeta-mas">Ver qué mirar →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="seccion" aria-labelledby="como">
        <div className="seccion-tit">
          <h2 id="como">Cómo funciona</h2>
        </div>
        <div className="pasos">
          {PASOS.map((p) => (
            <div key={p.titulo} className="paso">
              <h3>{p.titulo}</h3>
              <p>{p.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="seccion panel panel-tinta" aria-labelledby="cambiar">
        <h2 id="cambiar">¿Ya tienes seguro y solo quieres que lo lleve otro?</h2>
        <p className="lectura" style={{ marginBottom: 8 }}>
          No hace falta cambiar de compañía ni esperar al vencimiento para cambiar de correduría. Tu póliza sigue igual
          —mismas coberturas, mismo precio, mismo número— y pasamos a ser nosotros quienes la gestionamos.
        </p>
        <Link href="/cambiar-de-correduria" style={{ fontWeight: 600 }}>
          Cómo funciona el cambio de mediador →
        </Link>
      </section>

      <section id="presupuesto" className="seccion panel" aria-labelledby="pedir">
        <div className="seccion-tit">
          <h2 id="pedir">Pide presupuesto o una revisión</h2>
          <p className="tenue">Cuéntanos qué seguro quieres mirar y te llamamos. Sin compromiso y sin coste.</p>
        </div>
        <Formulario />
      </section>
    </>
  )
}

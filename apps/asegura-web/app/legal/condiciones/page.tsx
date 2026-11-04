// Condiciones de uso de los canales digitales de Grupo ASegura (web pública,
// portal del cliente y WhatsApp). Adaptadas de las del portal
// (`apps/asegura-portal/app/legal/condiciones`), de las que solo se toma lo que
// vale para todos los canales. Lo que es propio del portal (acceso por código,
// autorizar a otra persona) se queda allí. Titular y datos de contacto salen de
// `MEDIADOR`, de `@central/module-seguros`: nunca a mano.
import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'

import {
  MEDIADOR,
  FECHA_TEXTOS_WEB,
  VERSION_TEXTOS_WEB,
  telefonoLegible,
} from '@central/module-seguros'

import { OG_IMAGEN, url } from '@/lib/sitio'

export const metadata: Metadata = {
  title: 'Condiciones de uso',
  description:
    'Condiciones de uso de la web, el portal del cliente y el canal de WhatsApp de Grupo ASegura: titular, qué es cada canal, responsabilidad y ley aplicable.',
  alternates: { canonical: url('/legal/condiciones') },
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'Grupo ASegura',
    url: url('/legal/condiciones'),
    images: [OG_IMAGEN],
  },
  robots: { index: true, follow: true },
}

const main: CSSProperties = {
  minHeight: '100vh',
  background: 'var(--bg)',
  color: 'var(--text)',
  padding: '32px 16px 64px',
}

const contenedor: CSSProperties = {
  maxWidth: 760,
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
}

const antetitulo: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--brand)',
}

const h1: CSSProperties = {
  fontSize: 'clamp(26px, 6vw, 36px)',
  lineHeight: 1.15,
  margin: '10px 0 0',
  fontWeight: 800,
  overflowWrap: 'break-word',
}

const entradilla: CSSProperties = {
  fontSize: 'clamp(16px, 3.5vw, 18px)',
  lineHeight: 1.6,
  color: 'var(--muted)',
  margin: '12px 0 0',
}

const tarjeta: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radio)',
  padding: 'clamp(16px, 4vw, 24px)',
}

const h2: CSSProperties = {
  fontSize: 'clamp(19px, 4vw, 22px)',
  lineHeight: 1.25,
  margin: '0 0 12px',
  fontWeight: 700,
}

const h3: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.35,
  margin: '18px 0 8px',
  fontWeight: 700,
}

const parrafo: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.65,
  margin: '0 0 12px',
  overflowWrap: 'break-word',
}

const parrafoUltimo: CSSProperties = { ...parrafo, marginBottom: 0 }

const lista: CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  fontSize: 16,
  lineHeight: 1.6,
}

const datos: CSSProperties = {
  margin: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 4,
}

const dt: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginTop: 12,
}

const dd: CSSProperties = {
  margin: 0,
  fontSize: 16,
  lineHeight: 1.55,
  overflowWrap: 'anywhere',
}

// Las bases jurídicas van en fichas apiladas, no en una tabla: en 320 px una
// tabla de dos columnas obliga a scroll horizontal o parte las palabras, y esto
// se lee igual de bien en cualquier ancho.
const fichas: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 12,
}

const ficha: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radio)',
  padding: '12px 14px',
}

const fichaTitulo: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.45,
  margin: 0,
}

const fichaBase: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.5,
  color: 'var(--muted)',
  margin: '6px 0 0',
}

const destacado: CSSProperties = {
  border: '1px solid var(--brand)',
  borderRadius: 'var(--radio)',
  padding: '12px 14px',
  fontSize: 16,
  lineHeight: 1.6,
  margin: 0,
}

const enlace: CSSProperties = { color: 'var(--brand)', overflowWrap: 'anywhere' }

const nota: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.6,
  color: 'var(--muted)',
  margin: '12px 0 0',
}

const version: CSSProperties = {
  fontSize: 13,
  color: 'var(--muted)',
  margin: 0,
}

export default function Condiciones() {
  const { identidad, marca } = MEDIADOR

  return (
    <div style={main}>
      <div style={contenedor}>
        <header>
          <p style={antetitulo}>Condiciones · web, portal y WhatsApp</p>
          <h1 style={h1}>Condiciones de uso</h1>
          <p style={entradilla}>
            Reglas de uso de los canales digitales de {marca}: esta web, el portal del cliente y el
            WhatsApp de la correduría. Usarlos implica aceptar lo que sigue.
          </p>
        </header>

        <section style={tarjeta} aria-labelledby="titular">
          <h2 id="titular" style={h2}>
            1. Quién es el titular
          </h2>
          <dl style={datos}>
            <dt style={{ ...dt, marginTop: 0 }}>Titular</dt>
            <dd style={dd}>{identidad.nombre}</dd>
            <dt style={dt}>NIF</dt>
            <dd style={dd}>{identidad.nif}</dd>
            <dt style={dt}>Actividad</dt>
            <dd style={dd}>
              {identidad.figura}, inscrito en el registro de la DGSFP con la clave{' '}
              {identidad.claveDgsfp}.
            </dd>
            <dt style={dt}>Domicilio</dt>
            <dd style={dd}>{identidad.domicilio}</dd>
            <dt style={dt}>Contacto</dt>
            <dd style={dd}>
              <a href={`mailto:${identidad.email}`} style={enlace}>
                {identidad.email}
              </a>
            </dd>
          </dl>
          <p style={{ ...parrafoUltimo, marginTop: 12 }}>
            El detalle del registro, la ausencia de vinculación con compañías y el procedimiento de
            reclamación están en la{' '}
            <Link href="/legal/informacion-mediador" style={enlace}>
              información del mediador
            </Link>
            .
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="objeto">
          <h2 id="objeto" style={h2}>
            2. Para qué sirven estos canales
          </h2>
          <ul style={lista}>
            <li>
              <strong>La web</strong> informa sobre seguros y permite pedir presupuesto o
              información.
            </li>
            <li>
              <strong>El portal del cliente</strong> permite ver tus pólizas y comunicar un
              siniestro. Tiene además sus propias condiciones, que se aceptan al entrar.
            </li>
            <li>
              <strong>El WhatsApp de la correduría</strong> permite hablar con nosotros por escrito,
              como harías por teléfono o por correo.
            </li>
          </ul>
          <p style={{ ...nota }}>
            Nada de lo que se ve en estos canales contrata, renueva ni anula un seguro por sí solo,
            ni sustituye a las condiciones de tu póliza.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="whatsapp">
          <h2 id="whatsapp" style={h2}>
            3. Uso del canal de WhatsApp
          </h2>
          <ul style={lista}>
            <li>
              Escribes al número de WhatsApp de la correduría
              ({telefonoLegible()}) cuando quieres, y te contesta una persona del equipo de la
              correduría.
            </li>
            <li>
              <strong>No hay respuestas automáticas ni te contesta un robot.</strong> Por eso la
              respuesta puede tardar: fuera del horario de atención no es inmediata.
            </li>
            <li>
              Los mensajes se registran en el sistema de gestión de la correduría (CRM) para poder
              gestionar tu póliza o tu solicitud y que la conversación quede completa. Cómo se
              tratan esos datos, cuánto se conservan y cómo borrarlos está en la{' '}
              <Link href="/legal/privacidad#whatsapp" style={enlace}>
                política de privacidad
              </Link>{' '}
              y en las{' '}
              <Link href="/legal/eliminacion-datos" style={enlace}>
                instrucciones de eliminación de datos
              </Link>
              .
            </li>
            <li>
              WhatsApp es un servicio de un tercero (Meta) y se rige además por sus propios
              términos. No nos escribas datos de salud, claves ni números de tarjeta completos:
              para eso te indicaremos otro medio.
            </li>
            <li>
              <strong>Un siniestro no se da por comunicado por escribirlo en WhatsApp</strong> hasta
              que te confirmemos que lo hemos trasladado a la compañía. Si el plazo aprieta (la ley
              da siete días desde que lo conoces, art. 16 de la Ley de Contrato de Seguro) o hay
              heridos, llámanos o llama directamente a tu aseguradora.
            </li>
          </ul>
        </section>

        <section style={tarjeta} aria-labelledby="responsabilidad">
          <h2 id="responsabilidad" style={h2}>
            4. Responsabilidad
          </h2>
          <p style={parrafo}>
            Ponemos los medios razonables para que los canales estén disponibles y la información
            sea correcta, pero son herramientas: pueden fallar, estar en mantenimiento o depender
            de un tercero (WhatsApp) que no controlamos. Que un canal esté caído no cambia ninguno de
            tus plazos.
          </p>
          <p style={parrafoUltimo}>
            Tú respondes de que los datos que nos das sean ciertos y de tener derecho a aportarlos.
            La información de la web es orientativa y no es una oferta vinculante ni asesoramiento
            personalizado hasta que lo hablamos contigo.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="propiedad">
          <h2 id="propiedad" style={h2}>
            5. Propiedad intelectual
          </h2>
          <p style={parrafoUltimo}>
            Los textos, el diseño, el nombre {marca} y el logotipo son del titular o se usan con
            permiso. Puedes verlos y compartir el enlace de las páginas, pero no copiarlos ni
            reutilizarlos con fines comerciales sin nuestro permiso por escrito.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="datos">
          <h2 id="datos" style={h2}>
            6. Protección de datos
          </h2>
          <p style={parrafoUltimo}>
            Lo que hacemos con tus datos, con qué base jurídica y cómo ejercer tus derechos está en
            la{' '}
            <Link href="/legal/privacidad" style={enlace}>
              política de privacidad
            </Link>
            . Para pedir que borremos tu conversación de WhatsApp, mira las{' '}
            <Link href="/legal/eliminacion-datos" style={enlace}>
              instrucciones de eliminación de datos
            </Link>
            .
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="ley">
          <h2 id="ley" style={h2}>
            7. Reclamaciones y ley aplicable
          </h2>
          <p style={parrafo}>
            Las quejas se dirigen primero a nuestro Servicio de Atención al Cliente y, si no se
            resuelven, a la DGSFP; los canales están en la{' '}
            <Link href="/legal/informacion-mediador" style={enlace}>
              información del mediador
            </Link>
            .
          </p>
          <p style={parrafoUltimo}>
            Se aplica la ley española. Si eres consumidor, puedes acudir a los tribunales de tu
            domicilio.
          </p>
        </section>

        <p style={version}>
          Versión {VERSION_TEXTOS_WEB} · última revisión {FECHA_TEXTOS_WEB}
        </p>
      </div>
    </div>
  )
}

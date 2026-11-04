// Cómo pedir la supresión de los datos tratados por el canal de WhatsApp de
// Grupo ASegura. Es la URL de «instrucciones de eliminación de datos» que pide
// Meta en la revisión de la app. El correo y el domicilio son los que ya
// figuran en la política de privacidad (`MEDIADOR`); no se inventa ningún
// contacto nuevo. La supresión la ejecuta una persona, no un proceso
// automático: por eso se promete el plazo del art. 12.3 RGPD y no «al instante».
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
  title: 'Eliminación de datos de WhatsApp',
  description:
    'Cómo pedir a Grupo ASegura que borre tu conversación de WhatsApp, sus mensajes y adjuntos: qué datos hay, cómo solicitarlo, plazo de respuesta y qué se conserva por ley.',
  alternates: { canonical: url('/legal/eliminacion-datos') },
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'Grupo ASegura',
    url: url('/legal/eliminacion-datos'),
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

export default function EliminacionDatos() {
  const { identidad, marca } = MEDIADOR

  return (
    <div style={main}>
      <div style={contenedor}>
        <header>
          <p style={antetitulo}>Protección de datos · WhatsApp</p>
          <h1 style={h1}>Eliminación de datos de WhatsApp</h1>
          <p style={entradilla}>
            Si has hablado con {marca} por WhatsApp y quieres que borremos esa conversación, aquí
            tienes qué datos hay, cómo pedirlo y en cuánto tiempo lo hacemos.
          </p>
        </header>

        <section style={tarjeta} aria-labelledby="datos">
          <h2 id="datos" style={h2}>
            1. Qué datos tratamos
          </h2>
          <ul style={lista}>
            <li>
              <strong>Mensajes:</strong> el texto de lo que nos escribes y de lo que te escribe la
              correduría. Se guarda cifrado.
            </li>
            <li>
              <strong>Tu número de teléfono</strong>, cifrado, y una huella irreversible (hash) de
              él, que sirve para reconocer tu número sin descifrarlo.
            </li>
            <li>
              <strong>Adjuntos:</strong> las imágenes, documentos o audios que nos envíes.
            </li>
            <li>
              El nombre de tu perfil de WhatsApp, si lo tienes, y las fechas de los mensajes.
            </li>
          </ul>
          <p style={nota}>
            El detalle completo está en el{' '}
            <Link href="/legal/privacidad#whatsapp" style={enlace}>
              apartado de WhatsApp de la política de privacidad
            </Link>
            .
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="como">
          <h2 id="como" style={h2}>
            2. Cómo pedir que los borremos
          </h2>
          <p style={parrafo}>Tienes dos formas, las dos gratuitas:</p>
          <ul style={lista}>
            <li>
              <strong>Por WhatsApp:</strong> escribe <strong>«BAJA»</strong> al número de la
              correduría ({telefonoLegible()}), el mismo desde el que nos escribiste. Una persona
              del equipo recibirá tu petición y te confirmará cuando esté hecho.
            </li>
            <li>
              <strong>Por correo:</strong> escribe a{' '}
              <a href={`mailto:${identidad.email}`} style={enlace}>
                {identidad.email}
              </a>{' '}
              indicando que quieres la supresión de tus datos de WhatsApp y el teléfono desde el que
              nos escribiste. También puedes hacerlo por correo postal a {identidad.domicilio}.
            </li>
          </ul>
          <p style={nota}>
            Para evitar que otra persona borre tu conversación, podemos pedirte que acredites tu
            identidad antes de ejecutarlo.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="plazo">
          <h2 id="plazo" style={h2}>
            3. Plazo de respuesta
          </h2>
          <p style={parrafoUltimo}>
            Te contestamos y atendemos tu petición en el plazo máximo de <strong>un mes</strong>{' '}
            desde que la recibimos (art. 12.3 RGPD). Si es compleja o hay muchas solicitudes,
            podría ampliarse dos meses más, y te lo diremos dentro del primer mes con el motivo.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="que-se-borra">
          <h2 id="que-se-borra" style={h2}>
            4. Qué se borra y qué se conserva
          </h2>
          <p style={destacado}>
            La supresión borra <strong>la conversación, sus mensajes y los adjuntos</strong>, y la
            huella de tu número si no hay otra razón para conservarla. Dejamos de tratar tus datos
            de WhatsApp.
          </p>
          <h3 style={h3}>Lo que podemos tener que conservar</h3>
          <p style={parrafoUltimo}>
            Si eres cliente, la documentación de tus pólizas y recibos y la de la mediación (por
            ejemplo, una póliza que contratamos o un siniestro que gestionamos) se conserva el
            tiempo que exige la normativa de distribución de seguros y la de prevención del
            blanqueo de capitales, con bloqueo de acceso y solo para atender a los organismos que
            lo reclamen (art. 17.3.b RGPD). Eso es independiente de la conversación de WhatsApp:
            puedes pedir borrar esta sin afectar a tu póliza.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="reclamar">
          <h2 id="reclamar" style={h2}>
            5. Si no estás conforme
          </h2>
          <p style={parrafoUltimo}>
            Puedes reclamar ante la{' '}
            <a href="https://www.aepd.es" rel="noreferrer noopener" style={enlace} target="_blank">
              Agencia Española de Protección de Datos
            </a>
            . El resto de tus derechos (acceso, rectificación, oposición…) están en la{' '}
            <Link href="/legal/privacidad#derechos" style={enlace}>
              política de privacidad
            </Link>
            , y las reglas de uso del canal en las{' '}
            <Link href="/legal/condiciones" style={enlace}>
              condiciones de uso
            </Link>
            .
          </p>
        </section>

        <p style={version}>
          Versión {VERSION_TEXTOS_WEB} · última revisión {FECHA_TEXTOS_WEB}
        </p>
      </div>
    </div>
  )
}

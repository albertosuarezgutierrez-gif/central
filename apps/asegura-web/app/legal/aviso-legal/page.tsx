// Aviso legal del sitio público de Grupo ASegura.
//
// Es la identificación del prestador del servicio de la sociedad de la
// información que exige el art. 10 de la Ley 34/2002 (LSSI-CE). Los datos del
// titular NO se escriben aquí: salen de `MEDIADOR` (`@central/module-seguros`),
// que es la fuente única de los dos lados de la correduría.
//
// 🚨 Cada frase de esta página es una afirmación sobre lo que el sitio hace. Si
// el sitio cambia —se añade un área privada, un pago, una contratación en
// línea— esta página cambia EN EL MISMO PR y sube `VERSION_TEXTOS_WEB`. Un
// aviso legal que describe una versión anterior del sitio no es un texto
// desactualizado: es información falsa al usuario.
import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'

import {
  MEDIADOR,
  FECHA_TEXTOS_WEB,
  VERSION_TEXTOS_WEB,
} from '@central/module-seguros'

import { AMBITO, SITIO_URL, url } from '@/lib/sitio'

export const metadata: Metadata = {
  title: 'Aviso legal · Grupo ASegura',
  description:
    'Titular del sitio, objeto, condiciones de uso, propiedad intelectual, ley aplicable y fuero de la web de Grupo ASegura, correduría de seguros en Sevilla.',
  alternates: { canonical: url('/legal/aviso-legal') },
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

const enlace: CSSProperties = { color: 'var(--brand)', overflowWrap: 'anywhere' }

const version: CSSProperties = {
  fontSize: 13,
  color: 'var(--muted)',
  margin: 0,
}

export default function AvisoLegal() {
  const { identidad, marca } = MEDIADOR

  // `div` y no `main`: el `<main>` lo pone el layout desde el rediseño del
  // 05/09/2026, y anidar dos es HTML inválido — un lector de pantalla deja de
  // saber cuál es el contenido principal de la página.
  return (
    <div style={main}>
      <div style={contenedor}>
        <header>
          <p style={antetitulo}>Aviso legal</p>
          <h1 style={h1}>Aviso legal</h1>
          <p style={entradilla}>
            Quién es el titular de este sitio, para qué sirve y con qué condiciones puedes usarlo.
          </p>
        </header>

        <section style={tarjeta} aria-labelledby="titular">
          <h2 id="titular" style={h2}>
            1. Titular del sitio
          </h2>
          <p style={parrafo}>
            El titular de <strong>{SITIO_URL}</strong> es {identidad.nombre}, que ejerce bajo el
            nombre comercial <strong>{marca}</strong>.
          </p>
          <dl style={datos}>
            <dt style={{ ...dt, marginTop: 0 }}>Titular</dt>
            <dd style={dd}>{identidad.nombre}</dd>
            <dt style={dt}>NIF</dt>
            <dd style={dd}>{identidad.nif}</dd>
            <dt style={dt}>Actividad</dt>
            <dd style={dd}>
              {identidad.figura}, inscrito en el Registro Administrativo de Distribuidores de
              Seguros y Reaseguros de la DGSFP con la clave <strong>{identidad.claveDgsfp}</strong>.
            </dd>
            <dt style={dt}>Domicilio profesional</dt>
            <dd style={dd}>{identidad.domicilio}</dd>
            <dt style={dt}>Correo de contacto</dt>
            <dd style={dd}>
              <a href={`mailto:${identidad.email}`} style={enlace}>
                {identidad.email}
              </a>
            </dd>
          </dl>
          <p style={{ ...parrafoUltimo, marginTop: 12 }}>
            La actividad de mediación de seguros está supervisada por la Dirección General de
            Seguros y Fondos de Pensiones. La información precontractual completa está en{' '}
            <Link href="/legal/informacion-mediador" style={enlace}>
              información del mediador
            </Link>
            .
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="objeto">
          <h2 id="objeto" style={h2}>
            2. Objeto del sitio
          </h2>
          <p style={parrafo}>
            Este sitio informa sobre los seguros que medía la correduría y permite pedir un
            presupuesto o ponerse en contacto. Nada más.
          </p>
          <p style={parrafoUltimo}>
            En concreto, y para que no haya malentendidos: <strong>aquí no se contrata</strong>. No
            se emiten pólizas, no se cobran primas, no hay área privada de cliente y ninguna
            información de estas páginas es una oferta vinculante ni un asesoramiento
            personalizado. Lo que cubre un seguro es lo que digan sus condiciones particulares y
            generales, no lo que resuma una página web. El asesoramiento, con su análisis objetivo y
            su recomendación motivada, viene después y por escrito.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="condiciones-uso">
          <h2 id="condiciones-uso" style={h2}>
            3. Condiciones de uso
          </h2>
          <p style={parrafo}>
            Navegar por el sitio te convierte en usuario y supone aceptar este aviso. Al usarlo te
            comprometes a:
          </p>
          <ul style={lista}>
            <li>
              Usarlo conforme a la ley y a la buena fe, sin dañarlo ni intentar acceder a partes que
              no son públicas.
            </li>
            <li>
              Dar datos ciertos en el formulario de contacto, y tener derecho a facilitar los datos
              de otra persona si los incluyes.
            </li>
            <li>
              No usar el formulario para enviar publicidad, contenido ilícito o comunicaciones
              masivas.
            </li>
          </ul>
          <p style={{ ...parrafoUltimo, marginTop: 12 }}>
            Ponemos los medios razonables para que el sitio esté disponible y para que su contenido
            sea correcto y esté al día, pero es una herramienta y puede fallar, estar en
            mantenimiento o contener un error. Podemos modificar, suspender o retirar cualquier
            contenido sin aviso previo. Si algo del sitio te lleva a una página de un tercero (por
            ejemplo, la DGSFP o una entidad aseguradora), esa página no es nuestra y no respondemos
            de lo que haya en ella.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="propiedad-intelectual">
          <h2 id="propiedad-intelectual" style={h2}>
            4. Propiedad intelectual e industrial
          </h2>
          <p style={parrafo}>
            Los textos, el diseño, la estructura de navegación, el código y los elementos gráficos
            de este sitio son titularidad de {identidad.nombre} o se usan con autorización de quien
            lo sea. El nombre comercial <strong>{marca}</strong> y su logotipo identifican a esta
            correduría.
          </p>
          <p style={parrafoUltimo}>
            Puedes leer, imprimir y guardar copias para tu uso personal. Reproducir, distribuir,
            transformar o comunicar públicamente el contenido con cualquier otro fin necesita
            autorización previa y por escrito. Las marcas y denominaciones de las entidades
            aseguradoras que puedan aparecer pertenecen a sus titulares y se citan solo para
            identificarlas.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="datos-cookies">
          <h2 id="datos-cookies" style={h2}>
            5. Datos personales y cookies
          </h2>
          <p style={parrafoUltimo}>
            Qué datos tratamos, para qué, con qué base legal y cómo ejercer tus derechos está en la{' '}
            <Link href="/legal/privacidad" style={enlace}>
              política de privacidad
            </Link>
            . Este sitio usa cookies técnicas imprescindibles para funcionar, y cookies de medición
            de audiencia <strong>solo si las aceptas</strong> en el aviso que aparece al entrar. El
            detalle, y el botón para cambiar de opinión, están en la{' '}
            <Link href="/legal/cookies" style={enlace}>
              política de cookies
            </Link>
            .
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="reclamaciones">
          <h2 id="reclamaciones" style={h2}>
            6. Reclamaciones
          </h2>
          <p style={parrafoUltimo}>
            Las quejas se dirigen primero a nuestro Servicio de Atención al Cliente,{' '}
            <a href={`mailto:${identidad.email}`} style={enlace}>
              {identidad.email}
            </a>
            , que responde en el plazo máximo de un mes. Solo si no se resuelven, a la DGSFP. El
            detalle y el orden de los canales está en{' '}
            <Link href="/legal/informacion-mediador" style={enlace}>
              información del mediador
            </Link>
            .
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="ley-fuero">
          <h2 id="ley-fuero" style={h2}>
            7. Ley aplicable y fuero
          </h2>
          <p style={parrafo}>
            Este aviso y el uso del sitio se rigen por la legislación española, en particular por la
            Ley 34/2002 de servicios de la sociedad de la información y por la normativa de
            distribución de seguros (Ley 16/2018 y Real Decreto-ley 3/2020).
          </p>
          <p style={parrafoUltimo}>
            Si eres consumidor, son competentes los juzgados y tribunales de tu domicilio, y ninguna
            cláusula de este aviso te quita ese derecho. Si no lo eres, las partes se someten a los
            juzgados y tribunales de {AMBITO.ciudad}.
          </p>
        </section>

        <p style={version}>
          Versión {VERSION_TEXTOS_WEB} · última revisión {FECHA_TEXTOS_WEB}
        </p>
      </div>
    </div>
  )
}

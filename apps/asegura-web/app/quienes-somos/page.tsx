// Página «Quiénes somos» de la web pública de Grupo ASegura.
//
// 🚨 Ni un solo dato del mediador se escribe a mano aquí: clave DGSFP, NIF,
// domicilio, correo y los datos del seguro de responsabilidad civil salen de
// `MEDIADOR` (`@central/module-seguros`), que es la fuente única que comparten
// el panel del corredor y el portal del asegurado. Una segunda copia de la
// clave DGSFP es una copia de más: el día que cambie una, la otra miente sin
// que falle nada.
//
// 🚨 Y no se inventa trayectoria. Aquí NO hay años de experiencia, ni número de
// clientes, ni premios, ni «somos líderes en»: nada de eso está medido, y en
// una página que existe para dar confianza una cifra inventada es justo lo que
// la destruye si alguien la comprueba. Lo que sí es verdad y sí se dice es lo
// verificable: que es una correduría (varias compañías, no una marca), quién
// responde con nombre y clave de registro, y cómo cobra.
import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { MEDIADOR, NO_EXCLUSIVIDAD, lineaIdentificacion } from '@central/module-seguros'

import { AMBITO, url } from '@/lib/sitio'

export const metadata: Metadata = {
  title: 'Quiénes somos · Correduría de seguros en Sevilla',
  // Ni aquí se teclea la clave: la descripción se compone desde `MEDIADOR`, que
  // es la misma fuente que pinta el cuerpo de la página.
  description: `${MEDIADOR.marca} es la correduría de ${MEDIADOR.identidad.nombre}, corredor inscrito en la DGSFP con la clave ${MEDIADOR.identidad.claveDgsfp}. Qué es una correduría, quién responde y cómo cobramos.`,
  alternates: { canonical: url('/quienes-somos') },
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
  fontSize: 'clamp(26px, 6vw, 38px)',
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

const enlace: CSSProperties = { color: 'var(--brand)' }

const pie: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
  color: 'var(--muted)',
  margin: 0,
  overflowWrap: 'break-word',
}

export default function QuienesSomos() {
  const { identidad, responsabilidadCivil, remuneracion, marca } = MEDIADOR

  return (
    <main style={main}>
      <div style={contenedor}>
        <header>
          <p style={antetitulo}>Quiénes somos</p>
          <h1 style={h1}>Una correduría, no una compañía</h1>
          <p style={entradilla}>
            {marca} es el nombre comercial con el que trabaja {identidad.nombre},{' '}
            {identidad.figura.toLowerCase()} inscrito en el registro de la DGSFP con la clave{' '}
            {identidad.claveDgsfp}. Atendemos en {AMBITO.ciudad} y su provincia.
          </p>
        </header>

        <section style={tarjeta} aria-labelledby="que-es-correduria">
          <h2 id="que-es-correduria" style={h2}>
            Qué es una correduría y en qué se diferencia de un agente
          </h2>
          <p style={parrafo}>
            Un agente de seguros trabaja para una compañía: te ofrece los productos de esa marca, y
            si no encajan contigo, no tiene otra cosa que enseñarte. Una correduría no está atada a
            ninguna: analiza contratos de varias entidades y te propone el que se ajusta a lo que
            necesitas, con una recomendación motivada.
          </p>
          <p style={parrafo}>
            La diferencia no es de estilo, es jurídica. El corredor es un mediador independiente y
            actúa por cuenta del cliente, no de la aseguradora. {NO_EXCLUSIVIDAD}
          </p>
          <p style={parrafoUltimo}>
            En la práctica eso significa tres cosas: que comparamos, que si el año que viene otra
            compañía encaja mejor te lo decimos, y que cuando hay un siniestro quien discute con la
            aseguradora eres tú y nosotros contigo, no la aseguradora con nadie.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="quien-responde">
          <h2 id="quien-responde" style={h2}>
            Quién responde
          </h2>
          <p style={parrafo}>
            Detrás de {marca} hay una persona con nombre, no un formulario. Es quien te atiende y
            quien responde de la mediación:
          </p>
          <dl style={datos}>
            <dt style={{ ...dt, marginTop: 0 }}>Mediador</dt>
            <dd style={dd}>{identidad.nombre}</dd>
            <dt style={dt}>Figura</dt>
            <dd style={dd}>{identidad.figura}</dd>
            <dt style={dt}>Clave DGSFP</dt>
            <dd style={dd}>
              {identidad.claveDgsfp} — Registro Administrativo de Distribuidores de Seguros y
              Reaseguros. Puedes comprobarlo en{' '}
              <a href="https://www.dgsfp.mineco.gob.es" rel="noreferrer noopener" style={enlace} target="_blank">
                dgsfp.mineco.gob.es
              </a>
              .
            </dd>
            <dt style={dt}>NIF</dt>
            <dd style={dd}>{identidad.nif}</dd>
            <dt style={dt}>Domicilio profesional</dt>
            <dd style={dd}>{identidad.domicilio}</dd>
            <dt style={dt}>Contacto</dt>
            <dd style={dd}>
              <a href={`mailto:${identidad.email}`} style={enlace}>
                {identidad.email}
              </a>
            </dd>
          </dl>
        </section>

        <section style={tarjeta} aria-labelledby="rc-profesional">
          <h2 id="rc-profesional" style={h2}>
            Seguro de responsabilidad civil profesional
          </h2>
          <p style={parrafo}>
            Un corredor está obligado a tener cubierta su propia responsabilidad civil profesional
            por el {responsabilidadCivil.referenciaLegal}. Es la garantía de que, si el error es
            nuestro, hay con qué responder.
          </p>
          <dl style={datos}>
            <dt style={{ ...dt, marginTop: 0 }}>Entidad aseguradora</dt>
            <dd style={dd}>{responsabilidadCivil.aseguradora}</dd>
            <dt style={dt}>Póliza</dt>
            <dd style={dd}>{responsabilidadCivil.poliza}</dd>
          </dl>
          <p style={{ ...parrafoUltimo, marginTop: 12, color: 'var(--muted)', fontSize: 15 }}>
            El mediador dispone además de la capacidad financiera exigida por esa misma norma.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="como-cobramos">
          <h2 id="como-cobramos" style={h2}>
            Cómo cobramos
          </h2>
          <p style={parrafo}>{remuneracion.resumen}</p>
          <p style={parrafoUltimo}>
            La comisión tampoco cambia según qué compañía elijas, así que la recomendación no
            depende de cuál nos convenga más. Si en algún caso hubiera que cobrar honorarios, se
            pactarían por escrito contigo antes de nada.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="donde-trabajamos">
          <h2 id="donde-trabajamos" style={h2}>
            Dónde trabajamos
          </h2>
          <p style={parrafo}>
            En {AMBITO.ciudad} y su provincia. Un corredor puede mediar en toda España, pero esto es
            lo que decimos que hacemos: atender de cerca, en {AMBITO.comunidad}, a quien puede
            llamarnos y encontrarnos.
          </p>
          <ul style={lista}>
            <li>Hogar, comunidades de propietarios, comercio y empresa, auto y moto, vida y salud.</li>
            <li>
              Si ya tienes seguro con otra correduría o con una compañía, puedes cambiarte sin
              perder cobertura: te explicamos cómo en{' '}
              <Link href="/cambiar-de-correduria" style={enlace}>
                cambiar de correduría
              </Link>
              .
            </li>
            <li>
              Escríbenos a{' '}
              <a href={`mailto:${identidad.email}`} style={enlace}>
                {identidad.email}
              </a>{' '}
              y te contestamos en horario de oficina.
            </li>
          </ul>
        </section>

        <section style={tarjeta} aria-labelledby="mas-informacion">
          <h2 id="mas-informacion" style={h2}>
            Información obligatoria
          </h2>
          <p style={parrafoUltimo}>
            La información precontractual que la Ley 16/2018 de Distribución de Seguros obliga a
            darte antes de contratar está completa en{' '}
            <Link href="/legal/informacion-mediador" style={enlace}>
              información del mediador
            </Link>
            . Ahí también están los canales para presentar una queja.
          </p>
        </section>

        <p style={pie}>{lineaIdentificacion()}</p>
      </div>
    </main>
  )
}

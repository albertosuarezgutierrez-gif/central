// Política de privacidad de la web PÚBLICA de Grupo ASegura.
//
// No es la del portal del cliente (`apps/asegura-portal`) ni una copia suya:
// describe lo que hace ESTE sitio, que trata mucho menos (un formulario de
// contacto que sale por `/api/lead`) y no trata cosas que el portal sí (subida
// de documentos, lectura automática por un modelo de lenguaje, cuentas). El
// responsable, en cambio, es el mismo y sale del mismo sitio: `MEDIADOR`, de
// `@central/module-seguros`.
//
// 🚨 Tres cosas que se dicen aquí porque son ciertas HOY, y que hay que
// cambiar EN EL MISMO PR el día que deje de serlo:
//
//   1. **Hay medición de visitas, y está detrás del consentimiento.** Desde el
//      05/09/2026 la web usa PostHog (región europea) tras un banner de
//      Cookiebot. El apartado 7 lo describe. Lo que se mide y lo que NO se mide
//      está decidido en `components/Analitica.tsx` —sin autocaptura de clics,
//      sin grabación de sesión y sin perfiles de persona— y lo vigila
//      `lib/analitica.test.ts`, que impide que PostHog pueda cargarse si
//      Cookiebot no está configurado. Si esa configuración cambia, este
//      apartado cambia EN EL MISMO PR: una política que promete menos
//      medición de la que hay es la forma cara de equivocarse.
//   2. **No se declara Delegado de Protección de Datos.** Que exista o no es un
//      hecho, no una redacción — ver el comentario de `mediador.ts`. Mientras no
//      esté confirmado y con un buzón que se sepa que recibe correo, los
//      derechos se ejercen por el contacto general, que sí está verificado.
//      Declarar un DPD que no existe es dar al interesado una puerta que no
//      abre.
//   3. **Los datos de salud se advierten aunque el formulario no los pida.** En
//      vida, salud y decesos la conversación acaba tocándolos, y son categoría
//      especial del art. 9 RGPD: se tratan con consentimiento explícito y no se
//      escriben en un formulario web.
import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'

import {
  MEDIADOR,
  FECHA_TEXTOS_WEB,
  VERSION_TEXTOS_WEB,
} from '@central/module-seguros'

import { url } from '@/lib/sitio'

export const metadata: Metadata = {
  title: 'Política de privacidad · Grupo ASegura',
  description:
    'Qué datos trata Grupo ASegura cuando pides presupuesto, con qué base jurídica, quién más los ve, cuánto se conservan y cómo ejercer tus derechos ante el RGPD.',
  alternates: { canonical: url('/legal/privacidad') },
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

/** Finalidad → base jurídica. Cada fila es una afirmación sobre lo que se hace. */
const BASES = [
  {
    finalidad: 'Atender tu solicitud de presupuesto o de información y ponernos en contacto contigo',
    base: 'Tu consentimiento al enviar el formulario (art. 6.1.a RGPD) y, en su caso, las medidas precontractuales que pides con él (art. 6.1.b RGPD).',
  },
  {
    finalidad: 'Analizar tu situación, consultar a las compañías y prepararte una propuesta',
    base: 'Medidas precontractuales a petición tuya y ejecución del contrato de mediación (art. 6.1.b RGPD).',
  },
  {
    finalidad: 'Gestionar tus pólizas, tus renovaciones y tus siniestros mientras seas cliente',
    base: 'Ejecución del contrato de mediación (art. 6.1.b RGPD) y deber de asesoramiento del corredor (Ley 16/2018).',
  },
  {
    finalidad: 'Conservar la documentación de la mediación y atender a los organismos que la exijan',
    base: 'Obligación legal (art. 6.1.c RGPD): normativa de distribución de seguros y de prevención del blanqueo de capitales.',
  },
  {
    finalidad: 'Atender tus derechos de protección de datos y tus reclamaciones',
    base: 'Obligación legal (art. 6.1.c RGPD).',
  },
] as const

/**
 * Las cookies que el sitio puede instalar. Son las de verdad, no una lista tipo.
 *
 * 🚨 Tiene que coincidir con lo que hace `components/Analitica.tsx`. Si ahí se
 * añade una herramienta, aquí aparece su fila EN EL MISMO PR: una política de
 * cookies incompleta no es un descuido de redacción, es la infracción.
 */
const COOKIES = [
  {
    nombre: 'CookieConsent',
    categoria: 'Necesaria',
    proveedor: 'Cookiebot (Usercentrics A/S)',
    para: 'Guarda qué has elegido en el banner, para no volver a preguntártelo en cada página.',
    duracion: '1 año',
  },
  {
    nombre: 'ph_…_posthog',
    categoria: 'Estadística',
    proveedor: 'PostHog (región europea)',
    para: 'Distingue una visita de otra para poder contar visitantes y páginas vistas. Solo se instala si aceptas.',
    duracion: '1 año',
  },
] as const

export default function Privacidad() {
  const { identidad, marca } = MEDIADOR

  return (
    <main style={main}>
      <div style={contenedor}>
        <header>
          <p style={antetitulo}>Protección de datos · RGPD y LOPDGDD</p>
          <h1 style={h1}>Política de privacidad</h1>
          <p style={entradilla}>
            Esto es lo que hacemos con tus datos en {marca}. Está escrito sobre lo que este sitio
            hace de verdad, no sobre lo que suele ponerse en estas páginas.
          </p>
        </header>

        <section style={tarjeta} aria-labelledby="responsable">
          <h2 id="responsable" style={h2}>
            1. Quién responde de tus datos
          </h2>
          <dl style={datos}>
            <dt style={{ ...dt, marginTop: 0 }}>Responsable</dt>
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
            Puedes consultar la información completa del mediador en{' '}
            <Link href="/legal/informacion-mediador" style={enlace}>
              información del mediador
            </Link>
            .
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="que-datos">
          <h2 id="que-datos" style={h2}>
            2. Qué datos tratamos
          </h2>
          <h3 style={{ ...h3, marginTop: 0 }}>Lo que nos das tú</h3>
          <ul style={lista}>
            <li>
              Del formulario: tu nombre, tu teléfono o tu correo, y lo que escribas para explicarnos
              qué necesitas.
            </li>
            <li>
              De la conversación posterior: los datos que hagan falta para poder pedir precio a las
              compañías, que dependen del ramo (la vivienda y sus metros, el vehículo y su matrícula,
              la actividad del comercio, las personas a asegurar).
            </li>
          </ul>

          <h3 style={h3}>Lo que no tratamos aquí</h3>
          <p style={parrafoUltimo}>
            Este sitio no pide contraseñas, ni datos bancarios, ni datos de pago: no se contrata ni
            se cobra nada desde la web. Tampoco te perfila, ni graba lo que haces en pantalla, ni
            registra lo que escribes: la medición de visitas del apartado 7 cuenta páginas vistas,
            no personas.
          </p>

          <h3 style={h3}>Lo que se mide de tu navegación</h3>
          <p style={parrafoUltimo}>
            Si aceptas las cookies de estadística, se registran las páginas que ves, desde qué
            página llegaste y datos técnicos aproximados (tipo de dispositivo, navegador, idioma y
            una localización a nivel de ciudad deducida de tu IP, que no se guarda). Sirve para
            saber qué secciones interesan y desde dónde llega la gente. Si no aceptas, no se
            registra nada de esto.
          </p>

          <h3 style={h3}>Datos de salud</h3>
          <p style={destacado}>
            En los ramos de <strong>vida, salud y decesos</strong> la contratación exige datos de
            salud (cuestionarios médicos, antecedentes, hábitos). Son una{' '}
            <strong>categoría especial de datos</strong> del <strong>art. 9 del RGPD</strong> y
            solo se pueden tratar con tu <strong>consentimiento explícito</strong>, que se pide
            aparte y para ese fin concreto. Por eso{' '}
            <strong>no escribas datos de salud en el formulario de esta web</strong>: para llamarte
            no hacen falta, y ese cauce no es el adecuado para ellos. Si aun así los incluyes, los
            tratamos solo para atender tu solicitud y no los cedemos a ninguna compañía sin tu
            consentimiento explícito previo.
          </p>
          <p style={nota}>
            Lo mismo vale para los datos de otra persona: si nos das los de un familiar o un
            empleado, respondes de estar autorizado a hacerlo y de haberle informado de lo que dice
            esta página.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="finalidad">
          <h2 id="finalidad" style={h2}>
            3. Para qué, y con qué base jurídica
          </h2>
          <ul style={fichas}>
            {BASES.map((fila) => (
              <li key={fila.finalidad} style={ficha}>
                <p style={fichaTitulo}>{fila.finalidad}</p>
                <p style={fichaBase}>{fila.base}</p>
              </li>
            ))}
          </ul>
          <p style={nota}>
            No usamos tus datos para enviarte publicidad de terceros ni los vendemos a nadie. Si
            algún día quisiéramos mandarte comunicaciones comerciales propias, sería con un
            consentimiento aparte, pedido antes y que puedes retirar cuando quieras — y retirarlo no
            afecta a lo que se hizo mientras estaba dado.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="destinatarios">
          <h2 id="destinatarios" style={h2}>
            4. Quién más ve tus datos
          </h2>
          <ul style={lista}>
            <li>
              <strong>Las entidades aseguradoras</strong> a las que consultemos para conseguirte
              precio, y solo los datos que cada una necesita para cotizar el riesgo. Es el núcleo
              del servicio: sin enviar tus datos a las compañías no hay presupuesto que comparar.
            </li>
            <li>
              <strong>Los proveedores que hacen falta para que esto funcione</strong> —el
              alojamiento del sitio, el correo y las herramientas de gestión de la correduría—, que
              tratan los datos por cuenta nuestra, con contrato de encargo del art. 28 RGPD y
              siguiendo nuestras instrucciones.
            </li>
            <li>
              <strong>Los dos proveedores de la medición</strong>, y solo si la aceptas:{' '}
              <strong>Cookiebot</strong> (Usercentrics A/S, Dinamarca), que registra tu elección
              sobre las cookies, y <strong>PostHog</strong>, que cuenta las páginas vistas. La
              medición está configurada contra la <strong>región europea</strong> de PostHog, así
              que esos datos se alojan en la Unión Europea. Los dos tratan los datos por cuenta
              nuestra con contrato de encargo del art. 28 RGPD.
            </li>
            <li>
              <strong>La Administración</strong> y los tribunales, cuando una norma nos obligue a
              facilitarlos.
            </li>
          </ul>
          <p style={nota}>
            No están previstas transferencias internacionales de datos. Si en algún momento
            existieran, se harían con las garantías del capítulo V del RGPD y se diría en esta
            página antes de empezar.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="conservacion">
          <h2 id="conservacion" style={h2}>
            5. Cuánto tiempo los guardamos
          </h2>
          <ul style={lista}>
            <li>
              Si nos escribes y no llegamos a nada, los datos de tu solicitud se conservan el tiempo
              necesario para atenderla y, después, hasta un año, por si vuelves con la misma
              consulta.
            </li>
            <li>
              Si acabas siendo cliente, mientras dure la relación de mediación y después durante los
              plazos de prescripción de las responsabilidades que puedan derivarse de ella.
            </li>
            <li>
              La documentación de la mediación, durante los plazos que exigen la normativa de
              seguros y la de prevención del blanqueo de capitales.
            </li>
          </ul>
          <p style={nota}>
            Por eso hay cosas que no podemos borrar aunque nos lo pidas: no es una negativa nuestra,
            es un deber legal de conservación. Cuando ocurra, te decimos qué se ha borrado, qué se
            queda y por qué.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="derechos">
          <h2 id="derechos" style={h2}>
            6. Tus derechos
          </h2>
          <p style={parrafo}>
            Los artículos 15 a 22 del RGPD te dan estos derechos sobre tus datos:
          </p>
          <ul style={lista}>
            <li>
              <strong>Acceso</strong> (art. 15): saber si tratamos datos tuyos y cuáles.
            </li>
            <li>
              <strong>Rectificación</strong> (art. 16): corregir los que estén mal o incompletos.
            </li>
            <li>
              <strong>Supresión</strong> (art. 17): pedir que se borren cuando ya no sean necesarios.
            </li>
            <li>
              <strong>Limitación</strong> (art. 18): pedir que se conserven pero no se usen mientras
              se resuelve una discrepancia.
            </li>
            <li>
              <strong>Portabilidad</strong> (art. 20): recibir en un formato legible los datos que
              nos hayas dado tú.
            </li>
            <li>
              <strong>Oposición</strong> (art. 21): oponerte a un tratamiento por motivos de tu
              situación particular.
            </li>
            <li>
              <strong>No ser objeto de decisiones automatizadas</strong> (art. 22). No las hacemos:
              quien analiza y recomienda es una persona.
            </li>
            <li>
              <strong>Retirar el consentimiento</strong> en cualquier momento, cuando el tratamiento
              se base en él.
            </li>
          </ul>
          <p style={{ ...parrafo, marginTop: 12 }}>
            Se ejercen escribiendo a{' '}
            <a href={`mailto:${identidad.email}`} style={enlace}>
              {identidad.email}
            </a>{' '}
            o por correo postal a {identidad.domicilio}, indicando qué derecho ejerces y acreditando
            tu identidad. Contestamos en el plazo de un mes.
          </p>
          <p style={parrafoUltimo}>
            Si no te contestamos o no estás conforme con la respuesta, puedes reclamar ante la{' '}
            <a href="https://www.aepd.es" rel="noreferrer noopener" style={enlace} target="_blank">
              Agencia Española de Protección de Datos
            </a>
            , que es la autoridad de control. Puedes acudir a ella directamente, sin pasar antes por
            nosotros.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="cookies">
          <h2 id="cookies" style={h2}>
            7. Cookies
          </h2>
          <p style={parrafo}>
            La primera vez que entras aparece un banner con dos opciones claras. Hasta que elijas,
            no se instala ninguna cookie que no sea imprescindible, y{' '}
            <strong>rechazar es tan fácil como aceptar</strong>: son dos botones del mismo tamaño y
            en el mismo sitio, sin casillas premarcadas y sin que haya que entrar en ningún menú
            para decir que no (art. 22.2 de la LSSI y criterio de la AEPD).
          </p>
          <p style={parrafo}>
            Estas son todas las cookies que puede usar el sitio. No hay ninguna más:
          </p>
          <ul style={fichas}>
            {COOKIES.map((c) => (
              <li key={c.nombre} style={ficha}>
                <p style={fichaTitulo}>
                  {c.nombre} · {c.categoria}
                </p>
                <p style={fichaBase}>
                  {c.para} · Proveedor: {c.proveedor} · Duración: {c.duracion}
                </p>
              </li>
            ))}
          </ul>
          <p style={{ ...parrafo, marginTop: 16 }}>
            <strong>No hay cookies de publicidad</strong>, ni píxeles de redes sociales, ni
            seguimiento entre sitios web. Tampoco se graba tu sesión en vídeo ni se registran tus
            clics ni lo que escribes en el formulario: la analítica está configurada expresamente
            sin autocaptura y sin grabación, porque en un formulario de seguros se acaban
            escribiendo datos personales que no tienen por qué llegar a una herramienta de medición.
          </p>
          <p style={parrafo}>
            <strong>Puedes cambiar de opinión cuando quieras</strong> desde el enlace «Cambiar
            preferencias de cookies» que hay en el pie de todas las páginas, o borrando las cookies
            desde tu navegador. Retirar el consentimiento no afecta a la licitud de lo que se hizo
            mientras estaba dado.
          </p>
          <p style={parrafoUltimo}>
            Si rechazas las cookies de estadística, la web funciona igual: solo dejamos de contar la
            visita.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="cambios">
          <h2 id="cambios" style={h2}>
            8. Cambios en esta política
          </h2>
          <p style={parrafoUltimo}>
            Si cambia lo que hacemos con tus datos, cambia esta página y sube su número de versión,
            que es el que aparece justo debajo. Así siempre se puede saber qué texto estaba vigente
            en cada momento.
          </p>
        </section>

        <p style={version}>
          Versión {VERSION_TEXTOS_WEB} · última revisión {FECHA_TEXTOS_WEB}
        </p>
      </div>
    </main>
  )
}

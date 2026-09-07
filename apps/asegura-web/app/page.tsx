import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { MEDIADOR } from '@central/module-seguros'
import { RAMOS } from '@/lib/ramos'
import { COMPANIAS, COMPANIAS_EN_CARTERA } from '@/lib/companias'
import { PORTAL_URL, url } from '@/lib/sitio'
import Formulario from '@/components/Formulario'
import Reveal from '@/components/Reveal'
import PanelDemo from '@/components/PanelDemo'
import Cifras from '@/components/Cifras'
import Escaneo from '@/components/Escaneo'

export const metadata: Metadata = {
  title: 'Correduría de seguros en toda España',
  description:
    'Correduría de seguros inscrita en la DGSFP que media en toda España. Comparamos entre varias compañías tu seguro de hogar, comunidad, comercio, auto, vida y salud.',
  alternates: { canonical: url('/') },
}

/** Palomita de las garantías del hero. Trazo grueso, como el suyo. */
function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m20 6-11 11-5-5" />
    </svg>
  )
}

function Flecha() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

/**
 * Iconos de los ramos. Trazo de `currentColor`, así que heredan el color de su
 * cuadro. Dibujados a mano en vez de traer una librería: son cinco glifos y una
 * dependencia entera es peso que paga el visitante del móvil.
 */
function IconoRamo({ slug }: { slug: string }) {
  const t = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (slug) {
    case 'hogar':
      return (
        <svg {...t}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.5V20h13V9.5" />
          <path d="M9.5 20v-5h5v5" />
        </svg>
      )
    case 'comunidades':
      return (
        <svg {...t}>
          <path d="M3 21h18" />
          <path d="M5 21V6l7-3 7 3v15" />
          <path d="M9 9h2M13 9h2M9 13h2M13 13h2M9 17h2M13 17h2" />
        </svg>
      )
    case 'comercio':
      return (
        <svg {...t}>
          <path d="M4 8h16l-1 3.5a3 3 0 0 1-3 2.3H8a3 3 0 0 1-3-2.3Z" />
          <path d="M6 8 7.5 4h9L18 8" />
          <path d="M6 14v7h12v-7" />
        </svg>
      )
    case 'auto':
      return (
        <svg {...t}>
          <path d="M4 16v3M20 16v3" />
          <path d="M3.5 16h17v-3.2L18.8 8H5.2L3.5 12.8Z" />
          <path d="M7 12.5h.01M17 12.5h.01" />
        </svg>
      )
    case 'vida-y-salud':
      return (
        <svg {...t}>
          <path d="M12 20s-7-4.4-7-9.2A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.8C19 15.6 12 20 12 20Z" />
        </svg>
      )
    default:
      return (
        <svg {...t}>
          <path d="M12 3.5 4.5 6.5v5c0 4.4 3.1 7.9 7.5 9 4.4-1.1 7.5-4.6 7.5-9v-5Z" />
        </svg>
      )
  }
}

/**
 * 🚨 Ninguna de estas tres frases es una promesa sobre el precio. Lo que puede
 * decir una correduría sin caer en asesoramiento (RDL 3/2020) es QUÉ es y CÓMO
 * trabaja. Un «ahorra un X %» aquí arrastraría análisis objetivo documentado e
 * IPID entregado antes de contratar.
 */
const GARANTIAS = ['Sin coste para ti', 'Sin compromiso', `Corredor inscrito en la DGSFP`] as const


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

/**
 * Preguntas de la portada.
 *
 * Salen de las FAQ que ya están escritas por ramo (`lib/ramos.ts`), no de un
 * texto nuevo: así pasan por el mismo guardián de copy que el resto y no hay
 * dos versiones de la misma respuesta que se separen con el tiempo.
 */
const PREGUNTAS = RAMOS.flatMap((r) => r.faq.slice(0, 1)).slice(0, 5)

export default function Home() {
  return (
    <>
      {/* ── Portada ─────────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-atmosfera" aria-hidden />
        <div className="hero-mancha a" aria-hidden />
        <div className="hero-mancha b" aria-hidden />
        <div className="wrap dos-columnas hero-cols">
          <Reveal>
            <span className="chip">
              <span className="chip-punto" aria-hidden />
              Correduría en toda España · Registro DGSFP {MEDIADOR.identidad.claveDgsfp}
            </span>
            {/*
              🚨 El hero vende LO QUE NOS DIFERENCIA, y eso no es la figura
              jurídica ni el parte: es la intranet, que está abierta a
              cualquiera. Dictado de Alberto (07/09/2026): «la idea principal
              que nos diferencia es la intranet donde el cliente puede controlar
              sus seguros siendo nuestro cliente o no».

              Lo anterior («Un seguro se juzga el día del parte. Ese día me
              llamas a mí») describía el servicio de un corredor cualquiera:
              cierto, pero copiable por los 90.000 mediadores del registro. Que
              tus pólizas de OTRAS compañías vivan aquí, no.

              ⚠️ Cada frase de aquí abajo tiene que ser cierta HOY, y estas tres
              lo son: la intranet crea identidad con solo un correo verificado
              (`verificar/route.ts`, «El resultado NO bloquea el login»), acepta
              el PDF de cualquier compañía (`POST /api/polizas`, lo lee la IA) y
              desde el 07/09/2026 pone su vencimiento en el calendario aunque
              quien la suba no sea cliente. Lo que NO se dice es «olvídate»: eso
              promete un aviso saliente que para una póliza subida todavía no
              tiene por dónde salir, y el propio cron lo cuenta como `sinCanal`.

              El nombre va en PRIMERA PERSONA y sale de `MEDIADOR`, no tecleado.

              ✍️ La palabra es «seguros», no «pólizas» (Alberto, 07/09/2026).
              Nadie dice en su casa «tengo tres pólizas»: dice «tengo tres
              seguros». «Póliza» es la palabra del corredor, y el h1 lo lee
              quien todavía no lo es. Dentro del texto sí se dice «póliza»
              —cuando se habla del PDF concreto que se sube— porque ahí es el
              nombre exacto de la cosa.

              🚨 Y la segunda línea ya NO dice «Aunque no sean mías». La quitó
              Alberto en corto («aunque no sean míos no lo pongas») pese a que
              era la frase que más nos separaba del resto. Se probó «Y
              contrólalos todos.», donde el «todos» aún insinuaba lo de las
              otras compañías, y también lo quitó («quita todos»). Así que el h1
              ya no dice NADA que no pueda decir cualquier correduría: es un
              titular de tono, no de argumento.

              Que el diferenciador no se pierda depende entera y únicamente del
              `lead` de aquí abajo, que es donde vive el «de cualquier
              compañía». Si alguien recorta ese párrafo por longitud —cosa
              razonable, tiene siete líneas en móvil—, la portada se queda sin
              decir en ninguna parte lo único que no puede copiar el corredor de
              al lado, y no falla nada. Lo ancla `lib/ramos.test.ts`.
            */}
            <h1 className="display">
              Sube tus seguros.
              <br />
              <span className="destaca">Y contrólalos.</span>
            </h1>
            {/*
              Una línea más corto que la primera versión (06/09/2026), y no por
              estilo: la frase acababa en «…quien te coge el teléfono cuando hay
              que dar el parte», que es lo MISMO que dice el h1 dos líneas más
              arriba, y esa redundancia empujaba la última línea justo debajo de
              los botones flotantes. Lo que sobra en un hero no es neutro: ocupa
              el sitio donde el visitante decide.
            */}
            <p className="lead" style={{ marginTop: 28 }}>
              Soy {MEDIADOR.identidad.nombre}, corredor de seguros en toda España. Tu intranet guarda las
              pólizas de cualquier compañía, te dice qué cubre cada una y te apunta en el calendario hasta
              cuándo puedes decidir si la renuevas. Sin coste y sin cambiar de correduría.
            </p>
            <div className="hero-cta">
              <a href="#presupuesto" className="btn btn-brand btn-brillo">
                Que me llamen
                <Flecha />
              </a>
              {/* 🚨 El rótulo NO dice «Ya soy cliente». Decía eso hasta el
                  07/09/2026, y era el fallo de verdad de esta portada: la
                  intranet acepta a cualquiera, y el botón le estaba diciendo al
                  99 % de los visitantes que no era para ellos. */}
              <a href={PORTAL_URL} className="btn btn-outline">
                Entrar a mis seguros
              </a>
            </div>
            <ul className="garantias">
              {GARANTIAS.map((g) => (
                <li key={g}>
                  <Check />
                  {g}
                </li>
              ))}
            </ul>
          </Reveal>
          {/* La columna que se toca. Es lo que convierte la portada en algo
              que se prueba en vez de algo que se lee. */}
          <Reveal delay={0.15}>
            <PanelDemo />
          </Reveal>
        </div>
      </section>

      {/* Marquesina de compañías. Los nombres NO son de relleno: cada uno tiene
          detrás pólizas vivas medidas en la BD o un acuerdo confirmado — ver la
          procedencia nombre a nombre en `COMPANIAS`. */}
      <section className="banda" style={{ padding: '32px 0' }} aria-label="Compañías con las que trabajamos">
        <div className="wrap">
          <p className="antetitulo" style={{ display: 'block', textAlign: 'center', marginBottom: 20 }}>
            Compañías con las que trabajamos
          </p>
          <div className="companias">
            {/* TRES copias, no dos. La regla es que las copias que quedan por
                delante cubran el contenedor; con dos, el bucle enseñaba banda
                vacía en cada vuelta.

                Medido con Playwright a 1440 px el 07/09/2026, con el mismo
                script para las dos formas: la copia de SOLO NOMBRES mide 976 px
                y la de LOGOS 1.172, contra un contenedor de 1.104. O sea, al
                pasar a logos la banda se ensanchó y el margen creció: con tres
                copias quedan 2.344 px por delante. Quien acorte la lista o
                cambie una `escala` de `lib/companias.ts` vuelve a medirlo, en
                vez de fiarse de esta nota.

                Las copias 2 y 3 son decorativas: `aria-hidden` y `alt=""` para
                que un lector de pantalla no lea siete marcas tres veces. */}
            <ul>
              {[...COMPANIAS, ...COMPANIAS, ...COMPANIAS].map((c, i) => {
                const copia = i >= COMPANIAS.length
                return (
                  <li
                    key={`${c.nombre}-${i}`}
                    aria-hidden={copia}
                    style={c.escala ? ({ '--escala': c.escala } as CSSProperties) : undefined}
                  >
                    {c.logo ? (
                      // Sin `next/image` a propósito: son SVG (que el optimizador
                      // no toca), están en `public/` y su tamaño lo fija el CSS.
                      // El `alt` va vacío en las copias decorativas para que un
                      // lector de pantalla no lea siete marcas tres veces.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.logo} alt={copia ? '' : c.nombre} loading="lazy" decoding="async" />
                    ) : (
                      // Sin logo todavía: el nombre como wordmark. NO se dibuja
                      // uno parecido — un logo aproximado de una aseguradora en
                      // la web de su corredor es peor que no ponerlo.
                      <span className="companias-nombre">{c.nombre}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Ramos ───────────────────────────────────────────────────────── */}
      <section className="seccion banda" id="ramos" aria-labelledby="ramos-t">
        <div className="wrap">
          <Reveal className="seccion-tit">
            <p className="antetitulo">Qué revisamos</p>
            {/* Sin número: `lib/ramos.ts` tiene SEIS ramos y el menú solo
                enseña cinco (responsabilidad civil no está en la nav). Un
                «cinco seguros» escrito a mano se queda desfasado el día que se
                añada uno, y encima contradice a las tarjetas de debajo, que
                salen todas de RAMOS. */}
            <h2 className="display" id="ramos-t">
              Cada seguro, <span className="destaca">con el mismo criterio.</span>
            </h2>
            <p className="lead">Cada página cuenta qué conviene mirar en ese seguro antes de firmarlo.</p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="rejilla">
              {RAMOS.map((r) => (
                <Link key={r.slug} href={`/seguros/${r.slug}`} className="tarjeta">
                  <span className="tarjeta-icono">
                    <IconoRamo slug={r.slug} />
                  </span>
                  <h3>{r.nombre}</h3>
                  <p>{r.intro[0]?.slice(0, 116)}…</p>
                  <span className="tarjeta-mas">
                    Ver qué mirar
                    <Flecha />
                  </span>
                </Link>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Sube la póliza y la leemos ───────────────────────────────────
          🚨 El copy dice EXACTAMENTE lo que hace `apps/asegura-portal`
          (`lib/extraer-poliza.ts` + `app/api/polizas/route.ts`), ni un paso
          más: lee el documento y deja la ficha rellena, que la persona
          confirma (`confirmadaPorUsuario` nace en `false`, la procedencia es
          `declarado`). NO dice «el agente se encarga de todo» ni «guardamos tu
          póliza»: el fichero NO se persiste — solo su nombre y los datos
          extraídos. Eso, además de ser verdad, es el mejor argumento de los
          tres, así que se cuenta como tal. */}
      <section className="seccion" id="subir" aria-labelledby="subir-t">
        <div className="wrap dos-columnas">
          <Reveal>
            <p className="antetitulo">Tu póliza, sin teclear</p>
            <h2 className="display" id="subir-t">
              Súbela y la <span className="destaca">leemos por ti.</span>
            </h2>
            <p className="lead">
              Un PDF o una foto con el móvil. Sacamos la compañía, el número, el vencimiento y las coberturas, y te
              dejamos la ficha rellena en tu intranet para que la revises.
            </p>
            <ul className="garantias" style={{ marginTop: 24 }}>
              <li>
                <Check />
                Vale un PDF o una foto
              </li>
              <li>
                <Check />
                Confirmas tú: nada se da por bueno solo
              </li>
              <li>
                <Check />
                El documento no se guarda, solo sus datos
              </li>
            </ul>
            {/* 🚨 Esto NO es un «regístrate» de marketing: es lo que el portal
                hace HOY, verificado en su código. `/api/acceso/solicitar` no
                consulta la cartera antes de mandar el código, y `verificar`
                crea la identidad si el canal no existía — o sea, entra
                cualquiera con un correo, sin ser cliente, y puede subir sus
                pólizas desde el primer minuto. Lo que un no-cliente NO tiene es
                vínculo con la cartera: ve su espacio, no el nuestro. Por eso el
                texto promete «tu espacio» y no «tus pólizas». */}
            <div className="hero-cta" style={{ marginTop: 28 }}>
              <a href={PORTAL_URL} className="btn btn-brand">
                Crear mi área con mi correo
                <Flecha />
              </a>
            </div>
            <p className="tenue" style={{ margin: '14px 0 0', fontSize: 14 }}>
              No hace falta ser cliente todavía: entras con tu correo, te llega un código y ya tienes tu espacio.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <Escaneo />
          </Reveal>
        </div>
      </section>

      {/* ── Cómo funciona ───────────────────────────────────────────────── */}
      <section className="seccion" id="como" aria-labelledby="como-t">
        <div className="wrap">
          <Reveal className="seccion-tit centrado">
            <p className="antetitulo">Cómo funciona</p>
            <h2 className="display" id="como-t">
              Tres pasos, <span className="destaca">sin papeleo.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="pasos">
              {PASOS.map((p) => (
                <div key={p.titulo} className="paso">
                  <h3>{p.titulo}</h3>
                  <p>{p.texto}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── El corredor ─────────────────────────────────────────────────── */}
      <section className="seccion banda-acento" id="corredor" aria-labelledby="corredor-t">
        <div className="wrap dos-columnas">
          <Reveal>
            <p className="antetitulo">Quién te atiende</p>
            <h2 className="display" id="corredor-t" style={{ color: 'inherit' }}>
              Detrás de la web hay un <span className="destaca">corredor de verdad.</span>
            </h2>
            {/*
              Ya no repite «la misma persona te coge el teléfono»: eso lo dice
              ahora el hero. Aquí queda lo que el hero NO puede llevar sin
              recargarse — la parte comprobable: nombre, clave de registro y un
              domicilio donde encontrarle, los tres desde `MEDIADOR`.
            */}
            <p className="lead" style={{ color: 'inherit', opacity: 0.85 }}>
              No es un comparador automático. Detrás de cada presupuesto hay una persona con nombre, con clave de
              registro en la DGSFP y con un domicilio en el que se le puede encontrar.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="credencial">
              <div className="credencial-halo" aria-hidden />
              <div className="credencial-mono" aria-hidden>
                AS
              </div>
              <h3 style={{ marginTop: 20, fontSize: '1.25rem' }}>{MEDIADOR.identidad.nombre}</h3>
              <p className="tenue" style={{ margin: 0, fontSize: 14 }}>
                Corredor de seguros · {MEDIADOR.identidad.domicilio}
              </p>
              <figure className="credencial-cita">
                <blockquote>
                  «Mi trabajo no es venderte una marca. Es entender qué tienes que cubrir y decirte dónde encaja
                  mejor.»
                </blockquote>
              </figure>
              <span className="credencial-dgsfp">DGSFP {MEDIADOR.identidad.claveDgsfp}</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Banda oscura, con foco que sigue al puntero y contadores ───── */}
      <Cifras
        titular={
          <>
            {'Tus pólizas viven en cajones, correos y carpetas distintas.'.split(' ').map((w, i) => (
              <span key={i} style={{ transitionDelay: `${i * 45}ms` }}>
                {w}&nbsp;
              </span>
            ))}
            {'Así no se puede decidir.'.split(' ').map((w, i) => (
              <span key={`b${i}`} className="destaca" style={{ transitionDelay: `${350 + i * 45}ms` }}>
                {w}&nbsp;
              </span>
            ))}
          </>
        }
        cifras={[
          { valor: COMPANIAS_EN_CARTERA.length, texto: 'Compañías con pólizas en cartera' },
          { valor: RAMOS.length, texto: 'Ramos que revisamos' },
          { valor: 0, estatico: '0 €', texto: 'Lo que te cuesta el servicio' },
        ]}
        nota="La comisión la paga la aseguradora, no tú: no cobramos honorarios por el servicio de mediación."
      />

      {/* ── Cambiar de correduría ───────────────────────────────────────── */}
      <section className="seccion banda" id="cambiar" aria-labelledby="cambiar-t">
        <div className="wrap dos-columnas">
          <Reveal>
            <p className="antetitulo">Ya tienes seguro</p>
            <h2 className="display" id="cambiar-t">
              Cambiar de correduría <span className="destaca">no es cambiar de póliza.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="lead" style={{ maxWidth: 'none' }}>
              No hace falta cambiar de compañía ni esperar al vencimiento. Tu póliza sigue igual —mismas coberturas,
              mismo precio, mismo número— y pasamos a ser nosotros quienes la gestionamos.
            </p>
            <Link href="/cambiar-de-correduria" className="btn btn-outline">
              Cómo funciona el cambio
              <Flecha />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ── Preguntas ───────────────────────────────────────────────────── */}
      <section className="seccion" id="faq" aria-labelledby="faq-t">
        <div className="wrap dos-columnas" style={{ alignItems: 'start' }}>
          <Reveal>
            <p className="antetitulo">Preguntas</p>
            <h2 className="display" id="faq-t">
              Lo que más <span className="destaca">nos preguntan.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="faq">
              {PREGUNTAS.map((f) => (
                <details key={f.pregunta}>
                  <summary>{f.pregunta}</summary>
                  <p>{f.respuesta}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Formulario ──────────────────────────────────────────────────── */}
      <section className="seccion banda" id="presupuesto" aria-labelledby="pedir-t">
        <div className="wrap">
          <Reveal className="seccion-tit centrado">
            <p className="antetitulo">Empieza aquí</p>
            <h2 className="display" id="pedir-t">
              Pide presupuesto o <span className="destaca">una revisión.</span>
            </h2>
            <p className="lead">Cuéntanos qué seguro quieres mirar y te llamamos. Sin compromiso y sin coste.</p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="panel" style={{ maxWidth: 720, margin: '0 auto' }}>
              <Formulario />
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}

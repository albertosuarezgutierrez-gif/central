import type { Metadata } from 'next'
import Link from 'next/link'
import { MEDIADOR } from '@central/module-seguros'
import { RAMOS } from '@/lib/ramos'
import { PORTAL_URL, url } from '@/lib/sitio'
import Formulario from '@/components/Formulario'
import Reveal from '@/components/Reveal'
import PanelDemo from '@/components/PanelDemo'
import Cifras from '@/components/Cifras'
import Escaneo from '@/components/Escaneo'

export const metadata: Metadata = {
  title: 'Correduría de seguros en Sevilla',
  description:
    'Correduría de seguros en Sevilla inscrita en la DGSFP. Comparamos entre varias compañías tu seguro de hogar, comunidad, comercio, auto, vida y salud. Te llamamos.',
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

/**
 * Aseguradoras con pólizas VIVAS en la cartera.
 *
 * 🚨 Medido en la BD el 05/09/2026, no puesto de memoria: Mapfre 64, Allianz
 * 26, Occident 19 y Reale 1 — las 110 pólizas vivas. Un muro de logos con una
 * compañía con la que no se trabaja es una afirmación falsa sobre terceros, y
 * de las caras.
 */
const COMPANIAS = ['Mapfre', 'Allianz', 'Occident', 'Reale'] as const

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
              Correduría en Sevilla · Registro DGSFP {MEDIADOR.identidad.claveDgsfp}
            </span>
            <h1 className="display">
              Tu seguro, mirado por quien
              <br />
              <span className="destaca">no trabaja para la aseguradora.</span>
            </h1>
            <p className="lead" style={{ marginTop: 28 }}>
              Somos correduría, no compañía: comparamos entre varias aseguradoras tu hogar, tu comunidad, tu comercio,
              tu coche o tu salud, y te explicamos qué cubre cada opción antes de que firmes.
            </p>
            <div className="hero-cta">
              <a href="#presupuesto" className="btn btn-brand btn-brillo">
                Que me llamen
                <Flecha />
              </a>
              {/* Segundo clic para quien ya es cliente: su intranet, donde
                  guarda sus pólizas. Va junto al CTA de venta. */}
              <a href={PORTAL_URL} className="btn btn-outline">
                Ya soy cliente
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

      {/* Marquesina de compañías. Los nombres NO son de relleno: son las
          aseguradoras con pólizas VIVAS en la cartera, medidas en la BD el
          05/09/2026 (Mapfre 64, Allianz 26, Occident 19, Reale 1). Si algún día
          entra otra compañía, este array se actualiza desde el mismo sitio. */}
      <section className="banda" style={{ padding: '32px 0' }} aria-label="Compañías con las que trabajamos">
        <div className="wrap">
          <p className="antetitulo" style={{ display: 'block', textAlign: 'center', marginBottom: 20 }}>
            Compañías con las que trabajamos
          </p>
          <div className="companias">
            <ul>
              {[...COMPANIAS, ...COMPANIAS].map((c, i) => (
                <li key={`${c}-${i}`} aria-hidden={i >= COMPANIAS.length}>
                  {c}
                </li>
              ))}
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
              dejamos la ficha rellena en tu área de clientes para que la revises.
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
            <p className="lead" style={{ color: 'inherit', opacity: 0.85 }}>
              No un comparador automático ni un centro de llamadas. La misma persona te coge el teléfono cuando pides
              presupuesto y cuando tienes un parte que dar.
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
          { valor: COMPANIAS.length, texto: 'Compañías con pólizas en cartera' },
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

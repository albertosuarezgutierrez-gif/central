// Layout del sitio público de Grupo ASegura.
//
// La identidad visual NO se escribe aquí: los colores salen de `@central/brand`
// (`MARCA_ASEGURA`), medidos del fuente de la app que ya existe en
// `app.grupoasegura.com`, y el sistema (escala, rejillas, movimiento) vive en
// `globals.css`, que reproduce el de su landing.
//
// La ficha JSON-LD del negocio va en el layout y no en la home a propósito: es
// la identidad del negocio, no de una página, y Google la quiere ver en todas.
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { MARCA_ASEGURA, emitirRootCss, emitirVariables, emitirVariablesOscuras } from '@central/brand'
import { MEDIADOR, lineaIdentificacion, telefonoLegible, whatsappUrl } from '@central/module-seguros'
import { HORARIO, NAV, SITIO_URL } from '@/lib/sitio'
import { fichaNegocio, fichaWebSite, jsonLd } from '@/lib/seo'
import Analitica from '@/components/Analitica'
import Cabecera from '@/components/Cabecera'
import Whatsapp from '@/components/Whatsapp'
import './globals.css'

/**
 * Tipografía del sitio (24/09/2026, decisión de Alberto).
 *
 * Titulares, menú y botones en **Quicksand**, la familia del logotipo «Grupo
 * ASegura» (`public/brand/logotipo-asegura.svg`), para que la web hable con la
 * letra del monograma. El texto corrido en **Nunito Sans**: redondeada como
 * ella pero hecha para leer párrafos, formularios y letra legal en el móvil.
 * Sustituye a Fraunces + Inter.
 *
 * Una sola petición para las dos familias, y SOLO esta: el Inter de
 * `@central/brand` ya no se pide aquí (sería un webfont descargado para nada).
 * El portal y los correos siguen con Inter; esto es de esta superficie.
 *
 * 🚨 Sin itálica: no se pide el eje `ital`, así que un `font-style: italic`
 * sobre estas familias saldría sintetizado. Lo vigila `lib/tipografia.test.ts`.
 */
const TIPOGRAFIA =
  'https://fonts.googleapis.com/css2?family=Quicksand:wght@300..700&family=Nunito+Sans:wght@400;600;700;800&display=swap'

/**
 * Hoja de tokens de la marca.
 *
 * Además del `:root` de siempre, emite los mismos tokens EN ÁMBITO para la
 * clase `.oscuro`. La página es CLARA (decisión de Alberto, 05/09/2026, y es
 * también lo que hace la landing de la correduría: clara casi entera con una
 * sola banda oscura). Ese contraste único es la banda de cifras, y con esto se
 * pinta sin un solo color escrito a mano en `globals.css`: cualquier
 * componente que entre en una sección `.oscuro` se re-tematiza solo, porque se
 * pinta con tokens y no con hex.
 *
 * 📌 Se deja emitido aunque hoy lo use una sola sección: el coste es una línea
 * de CSS y es lo que permite mover el contraste de sitio —o añadir una segunda
 * banda— sin volver a escribir colores a mano.
 *
 * ⚠️ Si la marca dejase de declarar paleta oscura, `emitirVariablesOscuras`
 * devuelve cadena vacía y la banda de cifras se vería clara: texto pensado
 * para fondo oscuro sobre fondo claro, sin que falle ningún build. Por eso lo
 * vigila `lib/oscuro.test.ts`.
 */
const OSCURAS = emitirVariablesOscuras(MARCA_ASEGURA)
const CSS_MARCA = [
  emitirRootCss(MARCA_ASEGURA),
  OSCURAS ? `.oscuro{${OSCURAS};color-scheme:dark}` : '',
  // Y el camino de vuelta. Lo pide una sola pieza, pero la pide de verdad: la
  // hoja del escáner es un PAPEL, y un papel dentro de una sección oscura
  // tiene que seguir siendo blanco o deja de leerse como documento. Con esto
  // se marca `.claro` y recupera los tokens de día sin un solo hex a mano.
  `.claro{${emitirVariables(MARCA_ASEGURA)};color-scheme:light}`,
].join('')

export const metadata: Metadata = {
  metadataBase: new URL(SITIO_URL),
  title: {
    default: 'Grupo ASegura · Correduría de seguros en toda España',
    template: '%s · Grupo ASegura',
  },
  description:
    'Correduría inscrita en la DGSFP que media en toda España. Analizamos varias compañías para tu seguro de hogar, comunidad, comercio, auto, vida y salud.',
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'Grupo ASegura',
    url: SITIO_URL,
  },
  // La imagen de la tarjeta la inyecta Next desde `app/opengraph-image.tsx`
  // (convención de fichero), así que no se declara aquí: declararla a mano
  // sería una segunda ruta que mantener. Lo que sí hay que decir es el FORMATO
  // de la tarjeta de X/Twitter: sin esto se pinta el recuadro pequeño y la
  // imagen de 1200×630 se ve recortada a un cuadrado.
  twitter: { card: 'summary_large_image' },
  // Verificación de Google Search Console.
  //
  // Por qué está aquí y no en un fichero suelto: GSC es la ÚNICA fuente de
  // tráfico sin sesgo que puede tener esta web. PostHog va detrás del
  // consentimiento de nuestro propio banner a propósito (`lib/analitica.ts`),
  // así que mide solo a quien acepta — y «cero visitas medidas» NO es cero
  // visitas, es el `NULL` que `CLAUDE.md` prohíbe colapsar. Sin GSC no hay
  // forma de saber por qué consultas entra nadie.
  //
  // 🚨 Es `undefined` cuando la env no está, no una cadena vacía: una etiqueta
  // `<meta content="">` es peor que no ponerla — Google la lee como un intento
  // de verificación fallido en vez de como una web sin verificar.
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } }
    : {}),
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={TIPOGRAFIA} />
        {/* Tokens de marca. Van en el head para que no haya un parpadeo con los
            colores por defecto antes de que cargue el CSS de la app. */}
        <style dangerouslySetInnerHTML={{ __html: CSS_MARCA }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(fichaNegocio()) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(fichaWebSite()) }} />
      </head>
      <body>
        {/* Gestor de consentimiento propio (vanilla-cookieconsent, vía
            @central/core-consent): monta el banner y, solo si el visitante
            acepta la categoría de estadística, arranca PostHog. Ya NO depende
            de una credencial de un CMP externo — la única forma
            de que esta web no pida consentimiento sería no montar este
            componente, y eso lo vigila el guardián de fuente
            `test/regression-analitica-fail-closed.test.ts`. */}
        <Analitica />

        <Cabecera marca={MEDIADOR.marca} />

        <main>{children}</main>

        {/* Flotante, en todas las páginas: el contacto directo no puede vivir
            solo al final de la portada. */}
        <Whatsapp />

        <footer className="pie">
          <div className="wrap pie-cols">
            <div>
              <h4>Grupo ASegura</h4>
              {/* Art. 19 Ley 16/2018: la identificación del mediador se ve
                  SIEMPRE, no solo si el visitante entra en una página aparte. */}
              <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>{lineaIdentificacion()}</p>
              <p className="tenue" style={{ margin: 0, fontSize: 14 }}>
                {MEDIADOR.identidad.domicilio}
                <br />
                <a href={`mailto:${MEDIADOR.identidad.email}`}>{MEDIADOR.identidad.email}</a>
                <br />
                {/* `tel:` y no solo texto: en un móvil, un teléfono que no se
                    pulsa obliga a copiarlo a mano. */}
                <a href={`tel:${MEDIADOR.identidad.telefono}`}>{telefonoLegible()}</a>
                {' · '}
                <a href={whatsappUrl(`Hola ${MEDIADOR.marca}, tengo una consulta.`)} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
                {/* El horario se pinta aquí Y va al `openingHours` del JSON-LD,
                    los dos desde `HORARIO`: publicar una hora en la web y otra
                    en los datos estructurados es la contradicción que Google
                    penaliza. Se omite entero mientras no esté confirmado —
                    `null` significa «no se sabe», no «no atendemos». */}
                {HORARIO ? (
                  <>
                    <br />
                    {HORARIO.texto}
                  </>
                ) : null}
              </p>
            </div>
            <div>
              <h4>Seguros</h4>
              <nav className="pie-lista" aria-label="Ramos">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href}>
                    {n.texto}
                  </Link>
                ))}
              </nav>
            </div>
            <div>
              <h4>Información legal</h4>
              <nav className="pie-lista" aria-label="Información legal">
                <Link href="/legal/informacion-mediador">Información del mediador</Link>
                <Link href="/legal/privacidad">Privacidad</Link>
                <Link href="/legal/aviso-legal">Aviso legal</Link>
                {/* 🚨 Sin este enlace la política de cookies queda huérfana —
                    solo se llegaba desde Google— y con ella el ÚNICO botón para
                    retirar el consentimiento. El art. 7.3 RGPD exige que
                    retirarlo sea tan fácil como darlo, y darlo son dos clics en
                    el banner. */}
                <Link href="/legal/cookies">Cookies</Link>
                <Link href="/quienes-somos">Quiénes somos</Link>
                {/* 🚨 El blog entra por el PIE, no por la cabecera: la cabecera
                    está llena (ver `NAV_CABECERA` en `lib/sitio.ts`, medido en
                    píxeles) y una sexta entrada devolvería el desbordamiento que
                    se echaba el botón «Área de clientes» fuera de la pantalla.
                    Sin este enlace los artículos existirían solo en el sitemap,
                    que es exactamente cómo `/seguros/responsabilidad-civil` pasó
                    meses sin un enlace entrante. */}
                <Link href="/blog">Guías y artículos</Link>
              </nav>
            </div>
          </div>
          <div className="wrap">
            <div className="pie-legal">
              Somos correduría: mediamos con varias compañías y la comisión la paga la aseguradora, no el cliente.
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}

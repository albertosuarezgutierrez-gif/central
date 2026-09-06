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
import { NAV, SITIO_URL } from '@/lib/sitio'
import { fichaNegocio, jsonLd } from '@/lib/seo'
import { COOKIEBOT_ID } from '@/lib/analitica'
import Analitica from '@/components/Analitica'
import Cabecera from '@/components/Cabecera'
import Whatsapp from '@/components/Whatsapp'
import './globals.css'

/**
 * Serif de titulares.
 *
 * Es la fuente display de la landing de la correduría (medida de su
 * `layout.tsx`: `Fraunces`, normal + itálica). Se pide aquí y no en
 * `@central/brand` porque es una decisión de ESTA superficie: el portal del
 * cliente la descarta a propósito, y cargarla allí sería un segundo webfont en
 * el móvil de alguien que solo viene a ver su póliza.
 *
 * `opsz` es el eje óptico de Fraunces: sin declararlo, Google sirve el corte
 * de 9 pt y a 67 px se ve endeble.
 */
const FRAUNCES =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;1,9..144,500&display=swap'

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
    default: 'Grupo ASegura · Correduría de seguros en Sevilla',
    template: '%s · Grupo ASegura',
  },
  description:
    'Correduría de seguros en Sevilla inscrita en la DGSFP. Analizamos entre varias compañías tu seguro de hogar, comunidad, comercio, auto, vida y salud.',
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'Grupo ASegura',
    url: SITIO_URL,
  },
  // Verificación de Google Search Console.
  //
  // Por qué está aquí y no en un fichero suelto: GSC es la ÚNICA fuente de
  // tráfico sin sesgo que puede tener esta web. PostHog va detrás del
  // consentimiento de Cookiebot a propósito (`lib/analitica.ts`), así que mide
  // solo a quien acepta — y «cero visitas medidas» NO es cero visitas, es el
  // `NULL` que `CLAUDE.md` prohíbe colapsar. Sin GSC no hay forma de saber por
  // qué consultas entra nadie.
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
        <link rel="stylesheet" href={MARCA_ASEGURA.tipografia.googleFontsHref} />
        <link rel="stylesheet" href={FRAUNCES} />
        {/* Tokens de marca. Van en el head para que no haya un parpadeo con los
            colores por defecto antes de que cargue el CSS de la app. */}
        <style dangerouslySetInnerHTML={{ __html: CSS_MARCA }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(fichaNegocio()) }} />
        {/* Gestor de consentimiento. Va en el <head> y no con `next/script`
            para que el banner salga antes de que React hidrate: un banner que
            aparece cuando la persona ya ha navegado llega tarde a lo único que
            tiene que hacer. Si falta el `data-cbid` no se monta NADA — y sin
            él tampoco arranca PostHog (`lib/analitica.ts`). */}
        {COOKIEBOT_ID ? (
          <script
            id="Cookiebot"
            src="https://consent.cookiebot.com/uc.js"
            data-cbid={COOKIEBOT_ID}
            data-blockingmode="auto"
            type="text/javascript"
            async
          />
        ) : null}
      </head>
      <body>
        {/* Solo escucha el consentimiento y, si lo hay, arranca la medición. */}
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

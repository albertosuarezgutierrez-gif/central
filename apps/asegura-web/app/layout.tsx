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
import { MEDIADOR, lineaIdentificacion } from '@central/module-seguros'
import { NAV, SITIO_URL } from '@/lib/sitio'
import { fichaNegocio, jsonLd } from '@/lib/seo'
import Cabecera from '@/components/Cabecera'
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
      </head>
      <body>
        <Cabecera marca={MEDIADOR.marca} />

        <main>{children}</main>

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

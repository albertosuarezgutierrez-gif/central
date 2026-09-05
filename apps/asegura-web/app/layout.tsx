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
import { MARCA_ASEGURA, emitirRootCss } from '@central/brand'
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
        <style dangerouslySetInnerHTML={{ __html: emitirRootCss(MARCA_ASEGURA) }} />
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

// Layout del sitio público de Grupo ASegura.
//
// La identidad visual NO se escribe aquí: se inyecta desde `@central/brand`
// (`MARCA_ASEGURA`), cuyos hex se MIDIERON del CSS fuente de la app que ya
// existe en `app.grupoasegura.com`. Poner colores a ojo en esta app haría que
// la web pública y el CRM del mismo negocio no se parecieran, que es peor que
// no tener web.
//
// El sistema visual (escala, rejillas, estados, roturas responsive) vive en
// `globals.css`. Antes estaba en un `<style>` incrustado aquí y todo lo demás
// en objetos `CSSProperties` inline — que no pueden declarar `:hover`, `@media`
// ni `::before`, y por eso la web se veía como un documento sin maquetar.
//
// La ficha JSON-LD del negocio va en el layout y no en la home a propósito: es
// la identidad del negocio, no de una página, y Google la quiere ver en todas.
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { MARCA_ASEGURA, emitirRootCss } from '@central/brand'
import { MEDIADOR, lineaIdentificacion } from '@central/module-seguros'
import { NAV, PORTAL_URL, SITIO_URL } from '@/lib/sitio'
import { fichaNegocio, jsonLd } from '@/lib/seo'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(SITIO_URL),
  title: {
    default: 'Grupo ASegura · Correduría de seguros en Sevilla',
    // Las páginas ponen su propio título; la marca se añade sola al final.
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
  // Sin `robots` explícito: el valor por defecto es indexable, y las páginas que
  // no deban indexarse lo dicen ellas. Un `noindex` global puesto «por si acaso»
  // en una web de captación es la forma más silenciosa de no existir en Google.
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={MARCA_ASEGURA.tipografia.googleFontsHref} />
        {/* Tokens de marca. Van en el head para que no haya un parpadeo con los
            colores por defecto antes de que cargue el CSS de la app. */}
        <style dangerouslySetInnerHTML={{ __html: emitirRootCss(MARCA_ASEGURA) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(fichaNegocio()) }} />
      </head>
      <body>
        <header className="hdr">
          <div className="wrap hdr-fila">
            <Link href="/" className="hdr-marca">
              <span className="marca-tile" aria-hidden="true">
                <span className="marca-mono" />
              </span>
              {MEDIADOR.marca}
            </Link>
            {/* Nav con scroll propio en móvil: seis secciones no caben en 320 px,
                y partirlas en dos filas deja la cabecera enorme. */}
            <nav className="hdr-nav" aria-label="Secciones">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href}>
                  {n.texto}
                </Link>
              ))}
            </nav>
            {/* Único acceso de la web: la intranet del CLIENTE. Es <a> y no
                <Link> porque es otro dominio. No hay «acceso corredor» a
                propósito: Alberto entra por plataforma. */}
            <a href={PORTAL_URL} className="btn btn-brand btn-hdr">
              Área de clientes
            </a>
          </div>
        </header>

        <main className="wrap" style={{ paddingTop: 32 }}>
          {children}
        </main>

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
          <div className="wrap pie-legal">
            Somos correduría: mediamos con varias compañías y la comisión la paga la aseguradora, no el cliente.
          </div>
        </footer>
      </body>
    </html>
  )
}

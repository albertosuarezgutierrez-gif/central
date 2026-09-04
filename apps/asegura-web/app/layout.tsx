// Layout del sitio público de Grupo ASegura.
//
// La identidad visual NO se escribe aquí: se inyecta desde `@central/brand`
// (`MARCA_ASEGURA`), cuyos hex se MIDIERON del CSS compilado de la app que ya
// existe en `app.grupoasegura.com`. Poner colores a ojo en esta app haría que
// la web pública y el CRM del mismo negocio no se parecieran, que es peor que
// no tener web.
//
// La ficha JSON-LD del negocio va en el layout y no en la home a propósito: es
// la identidad del negocio, no de una página, y Google la quiere ver en todas.
import type { Metadata } from 'next'
import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { MARCA_ASEGURA, emitirRootCss } from '@central/brand'
import { MEDIADOR, lineaIdentificacion } from '@central/module-seguros'
import { NAV, SITIO_URL } from '@/lib/sitio'
import { fichaNegocio, jsonLd } from '@/lib/seo'

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

const contenedor: CSSProperties = {
  maxWidth: 960,
  margin: '0 auto',
  // El padding lateral es lo que impide que el texto toque el borde en 320 px.
  padding: '0 16px',
  boxSizing: 'border-box',
}

const enlaceNav: CSSProperties = {
  // 44 px de alto táctil: regla de responsive del repo, y aquí importa porque
  // la mayoría del tráfico local de seguros entra desde el móvil.
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  padding: '0 10px',
  fontSize: 15,
  fontWeight: 600,
  color: 'var(--text)',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
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
        <style
          dangerouslySetInnerHTML={{
            __html: `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);line-height:1.55;
  -webkit-text-size-adjust:100%}
h1,h2,h3{font-family:var(--serif);line-height:1.2;margin:0 0 12px}
h1{font-size:clamp(26px,5vw,38px);font-weight:800;letter-spacing:-0.02em}
h2{font-size:clamp(20px,3.4vw,26px);font-weight:700}
p{margin:0 0 14px}
a{color:var(--brand)}
img{max-width:100%;height:auto}
/* Ningún bloque ancho puede empujar la página: la tabla o el bloque scrollea,
   no el body. Es la regla de responsive del repo, aplicada de raíz. */
main{overflow-wrap:anywhere}
:focus-visible{outline:3px solid var(--brand);outline-offset:2px;border-radius:4px}
`,
          }}
        />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(fichaNegocio()) }} />
      </head>
      <body>
        <header style={{ borderBottom: '1px solid var(--border)', background: 'var(--panel)' }}>
          <div style={{ ...contenedor, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingTop: 10, paddingBottom: 10 }}>
            <Link
              href="/"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, fontWeight: 800, fontSize: 17, color: 'var(--brand-ink)', textDecoration: 'none' }}
            >
              {MEDIADOR.marca}
            </Link>
            {/* Nav horizontal con scroll propio en móvil: seis secciones no caben
                en 320 px, y partirlas en dos filas deja la cabecera enorme. */}
            <nav
              aria-label="Secciones"
              style={{ display: 'flex', gap: 2, overflowX: 'auto', marginLeft: 'auto', maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}
            >
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} style={enlaceNav}>
                  {n.texto}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main style={{ ...contenedor, paddingTop: 24, paddingBottom: 48 }}>{children}</main>

        <footer style={{ borderTop: '1px solid var(--border)', background: 'var(--panel2)' }}>
          <div style={{ ...contenedor, paddingTop: 24, paddingBottom: 32, fontSize: 13, color: 'var(--muted)' }}>
            {/* Art. 19 Ley 16/2018: la identificación del mediador se ve SIEMPRE,
                no solo si el visitante entra en una página aparte. */}
            <p style={{ margin: '0 0 10px', fontWeight: 600, color: 'var(--text)' }}>{lineaIdentificacion()}</p>
            <p style={{ margin: '0 0 14px' }}>
              {MEDIADOR.identidad.domicilio} ·{' '}
              <a href={`mailto:${MEDIADOR.identidad.email}`}>{MEDIADOR.identidad.email}</a>
            </p>
            <nav aria-label="Información legal" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}>
              <Link href="/legal/informacion-mediador">Información del mediador</Link>
              <Link href="/legal/privacidad">Privacidad</Link>
              <Link href="/legal/aviso-legal">Aviso legal</Link>
              <Link href="/quienes-somos">Quiénes somos</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  )
}

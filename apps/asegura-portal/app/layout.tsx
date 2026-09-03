import { MARCA_ASEGURA, emitirRootCss } from '@central/brand'

import './globals.css'
import type { ReactNode } from 'react'
import { MarcaAsegura } from './MarcaAsegura'

// Marca activa del portal. Es la de `app.grupoasegura.com` medida del CSS
// compilado de la app de Manuel (ver `packages/brand/src/marcas/asegura.ts`):
// el asegurado tiene que reconocer a su correduría, no una plantilla índigo.
const MARCA = MARCA_ASEGURA

export const metadata = { title: 'Mis seguros — Grupo Asegura' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        {MARCA.tipografia.googleFontsHref && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            {/* Por <link> y NO con `next/font/google`: el build no tiene red y
                `next/font` descarga la fuente en tiempo de build. */}
            {/* eslint-disable-next-line @next/next/no-page-custom-font */}
            <link rel="stylesheet" href={MARCA.tipografia.googleFontsHref} />
          </>
        )}
        {/* Tema de marca. Va SIN capa a propósito: los valores por defecto de
            `globals.css` viven en `@layer portal-base`, y lo no-capado gana
            siempre a lo capado — así el override no depende del orden en que
            Next monte el <head>. */}
        <style dangerouslySetInnerHTML={{ __html: emitirRootCss(MARCA) }} />
      </head>
      <body>
        {/* Un portal que no dice de quién es parece de nadie — y el asegurado
            acaba de recibir un código por correo, así que lo primero que tiene
            que reconocer es la marca. */}
        <header className="marca-barra">
          <span className="marca-escudo">
            <MarcaAsegura alto={15} />
          </span>
          <span className="marca-nombre">{MARCA.logos.wordmark}</span>
          <span className="marca-coletilla">Correduría de seguros</span>
        </header>
        {children}
      </body>
    </html>
  )
}

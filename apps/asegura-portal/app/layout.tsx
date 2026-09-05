import { MARCA_ASEGURA, emitirRootCss } from '@central/brand'

import './globals.css'
import type { ReactNode } from 'react'
import { InterruptorTema } from './InterruptorTema'
import { MarcaAsegura } from './MarcaAsegura'
import { PieLegal } from './PieLegal'
import { SCRIPT_TEMA } from './tema'

// Marca activa del portal. Es la de `app.grupoasegura.com` medida del CSS
// compilado de la app de Manuel (ver `packages/brand/src/marcas/asegura.ts`):
// el asegurado tiene que reconocer a su correduría, no una plantilla índigo.
const MARCA = MARCA_ASEGURA

export const metadata = { title: 'Mis seguros — Grupo ASegura' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Antes que NADA: fija el tema leyendo la preferencia guardada, de
            forma síncrona, antes del primer pintado. Si esto se moviera más
            abajo o se volviera `defer`, quien tiene el tema oscuro vería un
            destello blanco a pantalla completa en cada carga. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
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
          {/* El interruptor va en la barra y no en un menú: es la única acción
              de la cabecera, y esconder una sola cosa detrás de un menú cuesta
              un toque más y un componente más. */}
          <InterruptorTema />
        </header>
        {children}
        {/* En el layout raíz y no en el del portal: quien todavía no ha metido
            el código tiene que poder identificar al mediador y leer la política
            de privacidad ANTES de escribir su correo, no después. */}
        <PieLegal />
      </body>
    </html>
  )
}

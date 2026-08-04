import type { Metadata } from 'next'
import { MARCA_JOAQUIN_JAEN, emitirRootCss } from '@central/brand'
import './globals.css'

// Marca activa de esta app. Multi-tenant en el futuro: se resolvería por cuenta.
const MARCA = MARCA_JOAQUIN_JAEN

export const metadata: Metadata = {
  title: 'Joaquín Jaén · Almacén',
  description: 'Almacén de materiales por familias (maestro editable desde oficina)',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        {MARCA.tipografia.googleFontsHref && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            {/* eslint-disable-next-line @next/next/no-page-custom-font */}
            <link rel="stylesheet" href={MARCA.tipografia.googleFontsHref} />
          </>
        )}
        {/* Tema de marca: sobreescribe los tokens base de globals.css */}
        <style dangerouslySetInnerHTML={{ __html: emitirRootCss(MARCA) }} />
      </head>
      <body>{children}</body>
    </html>
  )
}

import type { Metadata } from 'next'
import { emitirRootCss } from '@central/brand'
import { marcaActual } from '@/lib/marca-servidor'
import './globals.css'

export const metadata: Metadata = {
  title: 'Taller',
  description: 'Gestión de taller: recepción, órdenes y presupuestos',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Marca del taller de la sesión (o del despliegue, en el login): sus colores y logo, con fallback a los por defecto.
  const m = await marcaActual()
  return (
    <html lang="es">
      <head>
        {m.marca.tipografia.googleFontsHref && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            {/* eslint-disable-next-line @next/next/no-page-custom-font */}
            <link rel="stylesheet" href={m.marca.tipografia.googleFontsHref} />
          </>
        )}
        {m.sello?.fontsHref && (
          // eslint-disable-next-line @next/next/no-page-custom-font
          <link rel="stylesheet" href={m.sello.fontsHref} />
        )}
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style dangerouslySetInnerHTML={{ __html: emitirRootCss(m.marca) }} />
      </head>
      <body>{children}</body>
    </html>
  )
}

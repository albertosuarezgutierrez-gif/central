import type { Metadata, Viewport } from 'next'
import { Nunito_Sans, Quicksand } from 'next/font/google'
import { MARCA_ASEGURA, emitirRootCss } from '@central/brand'
import { leerContexto } from '@/lib/contexto'
import { cssAcento } from '@/lib/marca'
import './globals.css'

// Tipografía de marca Grupo ASegura: Quicksand 600-700 en titulares, menús y botones; Nunito Sans en el cuerpo. Sin cursivas.
const quicksand = Quicksand({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-quicksand', display: 'swap' })
const nunito = Nunito_Sans({ subsets: ['latin'], variable: '--font-nunito', display: 'swap' })

export const metadata: Metadata = { title: 'Mi empresa', description: 'Las herramientas de tu empresa, con Grupo ASegura' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Base Grupo ASegura + acento de la EMPRESA elegida (sin sesión: cobalto ASegura).
  const ctx = await leerContexto().catch(() => null)
  return (
    <html lang="es" className={`${quicksand.variable} ${nunito.variable}`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: emitirRootCss(MARCA_ASEGURA) + cssAcento(ctx?.cuenta?.acento) }} />
      </head>
      <body>{children}</body>
    </html>
  )
}

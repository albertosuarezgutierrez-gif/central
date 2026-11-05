import type { Metadata, Viewport } from 'next'
import { Nunito_Sans, Quicksand } from 'next/font/google'
import { MARCA_ASEGURA, emitirRootCss } from '@central/brand'
import { empresaActual } from '@/lib/marca-servidor'
import { cssAcento } from '@/lib/marca'
import './globals.css'

// Tipografía de marca Grupo ASegura (igual que rrhh y taller): Quicksand 600-700 en titulares, menús y botones; Nunito Sans en el cuerpo.
const quicksand = Quicksand({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-quicksand', display: 'swap' })
const nunito = Nunito_Sans({ subsets: ['latin'], variable: '--font-nunito', display: 'swap' })

export const metadata: Metadata = {
  title: 'Contabilidad',
  description: 'Contabilidad de tu empresa: panel, plan de cuentas, diario y mayor',
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Base Grupo ASegura + acento de la empresa de la sesión (sin sesión: cobalto ASegura).
  const e = await empresaActual().catch(() => null)
  return (
    <html lang="es" className={`${quicksand.variable} ${nunito.variable}`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: emitirRootCss(MARCA_ASEGURA) + cssAcento(e?.colorPrimario) }} />
      </head>
      <body>{children}</body>
    </html>
  )
}

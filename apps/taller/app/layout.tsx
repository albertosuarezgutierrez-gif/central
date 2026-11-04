import type { Metadata, Viewport } from 'next'
import { Nunito_Sans, Quicksand } from 'next/font/google'
import { MARCA_ASEGURA, emitirRootCss } from '@central/brand'
import { marcaActual } from '@/lib/marca-servidor'
import { cssAcentoTaller } from '@/lib/marca-css'
import './globals.css'

// Tipografía de marca Grupo ASegura (igual que rrhh): Quicksand 600-700 en titulares, menús y botones; Nunito Sans en el cuerpo; sin cursivas.
const quicksand = Quicksand({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-quicksand', display: 'swap' })
const nunito = Nunito_Sans({ subsets: ['latin'], variable: '--font-nunito', display: 'swap' })

export const metadata: Metadata = {
  title: 'Taller',
  description: 'Gestión de taller: recepción, órdenes y presupuestos',
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Base Grupo ASegura + acento del taller de la sesión (o del despliegue, en el login): su verde y su logo.
  const m = await marcaActual()
  return (
    <html lang="es" className={`${quicksand.variable} ${nunito.variable}`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: emitirRootCss(MARCA_ASEGURA) + cssAcentoTaller(m.marca) }} />
      </head>
      <body>{children}</body>
    </html>
  )
}

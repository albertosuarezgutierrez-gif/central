import { Inter } from 'next/font/google'

import './globals.css'
import type { ReactNode } from 'react'

// La misma fuente que `apps/plataforma`: el asegurado y el corredor tienen que
// ver el mismo producto. Self-hosted por `next/font`, sin llamada a Google en
// tiempo de carga.
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' })

export const metadata = { title: 'Mis seguros — Grupo Asegura' }

/**
 * El escudo de la cabecera. Va como SVG en línea y no como fichero porque el
 * único logo que existe hoy (`cropped-logo-bn-350x100-1.png`, en el Drive) está
 * en blanco y negro y lleva el reclamo «Low Cost», que ya no se usa. Poner un
 * logo caducado es peor que no poner ninguno.
 */
function Escudo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  )
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        {/* Un portal que no dice de quién es parece de nadie — y el asegurado
            acaba de recibir un código por correo, así que lo primero que tiene
            que reconocer es la marca. */}
        <header className="marca-barra">
          <span className="marca-escudo">
            <Escudo />
          </span>
          <span className="marca-nombre">Grupo Asegura</span>
          <span className="marca-coletilla">Correduría de seguros</span>
        </header>
        {children}
      </body>
    </html>
  )
}

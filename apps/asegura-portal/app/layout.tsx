import './globals.css'
import type { ReactNode } from 'react'

export const metadata = { title: 'Mis seguros — Grupo Asegura' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}

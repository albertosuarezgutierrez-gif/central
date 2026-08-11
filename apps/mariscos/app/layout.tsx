import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mariscos González — Trazabilidad',
  description: 'Recepción de partidas, trazabilidad por lote y etiquetado por canal',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}

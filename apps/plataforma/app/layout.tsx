import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ia plataforma',
  description: 'Cuadro de mando consolidado',
  manifest: '/manifest.json',
  themeColor: '#4f46e5',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}

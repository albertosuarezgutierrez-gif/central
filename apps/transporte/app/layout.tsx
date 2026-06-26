import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Transporte — Casa de marcas',
  description: 'Gestión de flota y servicios de transporte (interno y a terceros)',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}

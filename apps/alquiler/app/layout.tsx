import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Alquiler — Casa de marcas',
  description: 'Alquiler de materiales/menaje (interno al grupo y a terceros)',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}

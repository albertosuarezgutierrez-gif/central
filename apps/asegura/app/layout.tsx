import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Grupo Asegura — Correduría',
  description: 'CRM de correduría: clientes, pólizas, recibos y siniestros',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}

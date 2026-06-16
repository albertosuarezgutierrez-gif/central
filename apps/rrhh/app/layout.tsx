import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'RRHH',
  description: 'Vertical de RRHH (en construcción)',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}

import type { Metadata, Viewport } from 'next'
import './globals.css'
import CookieBanner from '@/components/CookieBanner'
import BrandingStyle from '@/components/BrandingStyle'
import { getEmpresaId } from '@/lib/tenant'
import { getBranding } from '@/lib/branding'

export const metadata: Metadata = {
  title: 'ialimp — Gestión de limpiezas',
  description: 'Software de coordinación de limpieza para empresas de apartamentos turísticos',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  // IALIMP es tema CLARO siempre: declara color-scheme light para que Android/
  // el navegador no aplique "forzar oscuro" e invierta la app (ver CLAUDE.md).
  colorScheme: 'light',
  themeColor: '#4f46e5',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Marca del panel admin según la empresa de la sesión (ialimp_session).
  // En login (sin sesión), /l y /propietario → default ialimp; esas superficies
  // inyectan su propia marca por dentro (limpiadora/propietario).
  const branding = await getBranding(await getEmpresaId())
  return (
    <html lang="es">
      <body>
        <BrandingStyle branding={branding}>
          {children}
        </BrandingStyle>
        <CookieBanner />
      </body>
    </html>
  )
}

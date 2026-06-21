import type { Metadata } from 'next'

// Metadatos propios de las propuestas: SIN precios (regla de propuestas) y sin
// indexar. Sobrescriben los del sitio (la landing lleva "Desde 59 €/mes", que no
// debe aparecer en la tarjeta de WhatsApp/redes al compartir una propuesta).
export const metadata: Metadata = {
  title: { absolute: 'Propuesta · ia.rest' },
  description:
    'Propuesta personalizada de ia.rest: una plataforma para conectar y unificar la gestión de tu negocio.',
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'ia.rest',
    title: 'Propuesta · ia.rest',
    description:
      'Una plataforma para conectar y unificar la gestión de tu negocio. Hecha contigo.',
    images: [{
      url: '/og-image.jpg', width: 1200, height: 630,
      alt: 'ia.rest', type: 'image/jpeg',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Propuesta · ia.rest',
    description:
      'Una plataforma para conectar y unificar la gestión de tu negocio. Hecha contigo.',
    images: ['/og-image.jpg'],
  },
}

export default function PropuestaLayout({ children }: { children: React.ReactNode }) {
  return children
}

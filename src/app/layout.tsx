import type { Metadata, Viewport } from 'next'
import './globals.css'

const BASE_URL = 'https://ia-rest.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'ia.rest · TPV por Voz para Hostelería | VeriFactu incluido · España',
    template: '%s · ia.rest',
  },
  description:
    'Software TPV con IA para restaurantes y bares en España. Comanda por voz en menos de 0,5 segundos. VeriFactu homologado, KDS, cobro con tarjeta y Bizum. Desde 39 €/mes. Sin comisiones. 14 días gratis.',
  keywords: [
    'tpv hosteleria','tpv restaurante','tpv bar','software tpv hosteleria españa',
    'tpv voz restaurante','verifactu tpv','verifactu hosteleria',
    'programa tpv restaurante','sistema comandas restaurante',
    'kds cocina','tpv tactil bar','tpv android hosteleria',
    'tpv sin comisiones','facturacion electronica restaurante','tpv inteligencia artificial',
  ],
  authors: [{ name: 'ia.rest', url: BASE_URL }],
  creator: 'ia.rest',
  publisher: 'ia.rest',
  category: 'software',
  applicationName: 'ia.rest',
  referrer: 'origin-when-cross-origin',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: BASE_URL,
    languages: { 'es-ES': BASE_URL },
  },
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    url: BASE_URL,
    siteName: 'ia.rest',
    title: 'ia.rest · TPV por Voz para Hostelería | VeriFactu incluido',
    description:
      'El camarero habla. Cocina ya tiene el ticket. TPV con IA para restaurantes y bares en España. VeriFactu, KDS, Bizum y Stripe. Desde 39 €/mes sin comisiones.',
    images: [{
      url: '/og-image.jpg', width: 1200, height: 630,
      alt: 'ia.rest · TPV por Voz para Hostelería en España', type: 'image/jpeg',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@ia_rest',
    title: 'ia.rest · TPV por Voz para Hostelería | VeriFactu incluido',
    description: 'El camarero habla. Cocina ya tiene el ticket. TPV con IA para hostelería española. Desde 39 €/mes sin comisiones.',
    images: ['/og-image.jpg'],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ia.rest',
  },
  icons: {
    apple: '/apple-touch-icon.png',
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: '#14110E',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

const jsonLdApp = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ia.rest',
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Point of Sale',
  operatingSystem: 'Web, Android, iOS PWA',
  description: 'Software TPV con inteligencia artificial para hostelería española. Comandas por voz en menos de 0,5 segundos, VeriFactu homologado, KDS, cobros con Stripe Terminal y Bizum.',
  url: BASE_URL,
  inLanguage: 'es-ES',
  softwareVersion: '1.0',
  datePublished: '2026-01-01',
  offers: [
    { '@type': 'Offer', name: 'Plan BARRA', price: '39', priceCurrency: 'EUR', url: `${BASE_URL}/registro`,
      priceSpecification: { '@type': 'UnitPriceSpecification', price: '39', priceCurrency: 'EUR', billingDuration: 'P1M' } },
    { '@type': 'Offer', name: 'Plan SERVICIO', price: '79', priceCurrency: 'EUR', url: `${BASE_URL}/registro`,
      priceSpecification: { '@type': 'UnitPriceSpecification', price: '79', priceCurrency: 'EUR', billingDuration: 'P1M' } },
    { '@type': 'Offer', name: 'Plan CASA', price: '129', priceCurrency: 'EUR', url: `${BASE_URL}/registro`,
      priceSpecification: { '@type': 'UnitPriceSpecification', price: '129', priceCurrency: 'EUR', billingDuration: 'P1M' } },
  ],
  featureList: [
    'Comandas por voz con IA (Whisper + Claude)',
    'VeriFactu homologado SHA-256',
    'KDS pantalla de cocina en tiempo real',
    'Cobros Stripe Terminal y Bizum MONEI',
    'Alérgenos EU Reglamento 1169/2011',
    'Sin comisiones por transacción',
    'Multi-tenant multi-local',
    'PWA sin instalación de apps',
  ],
  provider: {
    '@type': 'Organization',
    name: 'ia.rest',
    url: BASE_URL,
    email: 'alberto.suarez.gutierrez@gmail.com',
    areaServed: { '@type': 'Country', name: 'España' },
  },
}

const jsonLdFaq = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    { '@type': 'Question', name: '¿Qué hardware necesito para usar ia.rest?',
      acceptedAnswer: { '@type': 'Answer', text: 'Solo necesitas un smartphone Android (recomendamos el Samsung Galaxy A15 5G desde 180 €), una impresora térmica de cocina y una pantalla para el KDS. Sin terminales propietarios ni contratos de hardware.' } },
    { '@type': 'Question', name: '¿ia.rest cumple con VeriFactu?',
      acceptedAnswer: { '@type': 'Answer', text: 'Sí. Todos los planes generan facturas con hash encadenado SHA-256 y QR verificable por la AEAT. VeriFactu es obligatorio en España: para sociedades desde el 1 de enero de 2027 y para autónomos desde el 1 de julio de 2027. Multas de hasta 50.000 € por ejercicio.' } },
    { '@type': 'Question', name: '¿Funciona el reconocimiento de voz con acento andaluz o catalán?',
      acceptedAnswer: { '@type': 'Answer', text: 'Sí. BRAIN está entrenado con vocabulario hostelero real en español: marchar, 86, sin, para llevar... Funciona con todos los acentos regionales y mejora con cada servicio.' } },
    { '@type': 'Question', name: '¿Puedo financiar ia.rest con el Kit Digital?',
      acceptedAnswer: { '@type': 'Answer', text: 'Sí. ia.rest es compatible con las subvenciones Kit Digital del Gobierno de España para digitalización de pymes y autónomos.' } },
    { '@type': 'Question', name: '¿Hay comisión por cada pago con tarjeta o Bizum?',
      acceptedAnswer: { '@type': 'Answer', text: 'No. ia.rest no cobra comisión por transacción. Pagas la cuota mensual fija. Cero porcentaje sobre tus ventas.' } },
    { '@type': 'Question', name: '¿Puedo cancelar ia.rest cuando quiera?',
      acceptedAnswer: { '@type': 'Answer', text: 'Sí. Sin permanencia ni penalización. Cancelas desde el panel en cualquier momento. Datos exportables durante 30 días.' } },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="geo.region" content="ES" />
        <meta name="geo.placename" content="España" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <style>{`body { background: #14110E; }`}</style>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdApp) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFaq) }} />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .catch(function(e) { console.warn('[SW] register error:', e) })
            })
          }
        `}} />
      </body>
    </html>
  )
}

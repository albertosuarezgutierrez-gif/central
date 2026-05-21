import type { Metadata, Viewport } from 'next'
import React from 'react'
import './globals.css'
import AppBadge from '@/components/AppBadge'

const BASE_URL = 'https://www.iarest.es'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'ia.rest · TPV por Voz para Hostelería | VeriFactu incluido · España',
    template: '%s · ia.rest',
  },
  description:
    'Software TPV con IA para restaurantes y bares en España. Comanda por voz en menos de 0,5 segundos. VeriFactu homologado, KDS, cobro con tarjeta y Bizum. Desde 59 €/mes. Sin comisiones. 14 días gratis.',
  keywords: [
    'tpv hosteleria','tpv restaurante','tpv bar','software tpv hosteleria españa',
    'tpv voz restaurante','tpv comandas por voz','tpv inteligencia artificial hosteleria',
    'verifactu tpv','verifactu hosteleria','verifactu restaurante 2027', 'verifactu 2027',
    'programa tpv restaurante','sistema comandas restaurante',
    'kds cocina','tpv tactil bar','tpv android hosteleria',
    'tpv sin comisiones','facturacion electronica restaurante',
    'tpv sin instalacion','alta tpv sin instalador','tpv autoservicio',
    'tpv varios locales','tpv multilocal hosteleria','gestión varios restaurantes',
    'migrar tpv numier','alternativa numier','alternativa revo xef',
    'tpv bares españa','tpv desde 59 euros','kit digital hosteleria',
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
      'El camarero habla. Cocina ya tiene el ticket. TPV con IA para restaurantes y bares en España. VeriFactu, KDS, Bizum y Stripe. Desde 59 €/mes por local, sin comisiones.',
    images: [{
      url: '/og-image.jpg', width: 1200, height: 630,
      alt: 'ia.rest · TPV por Voz para Hostelería en España', type: 'image/jpeg',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@ia_rest',
    title: 'ia.rest · TPV por Voz para Hostelería | VeriFactu incluido',
    description: 'El camarero habla. Cocina ya tiene el ticket. TPV con IA para hostelería española. Desde 59 €/mes por local, sin comisiones.',
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

const jsonLdOrg = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'ia.rest',
  url: BASE_URL,
  logo: `${BASE_URL}/icon-512.png`,
  description: 'Software TPV con IA y comandas por voz para hostelería española. VeriFactu incluido.',
  email: 'hola@iarest.es',
  areaServed: { '@type': 'Country', name: 'España' },
  sameAs: [
    'https://www.linkedin.com/company/ia-rest',
  ],
}

const jsonLdWebSite = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'ia.rest',
  url: BASE_URL,
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${BASE_URL}/blog?q={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
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
    { '@type': 'Offer', name: '1 usuario · 59 €/mes', price: '59', priceCurrency: 'EUR', url: `${BASE_URL}/registro`,
      description: 'Local base con 1 usuario activo (camarero, cocina o jefe de sala). KDS, VeriFactu y Bizum incluidos.',
      priceSpecification: { '@type': 'UnitPriceSpecification', price: '59', priceCurrency: 'EUR', billingDuration: 'P1M' } },
    { '@type': 'Offer', name: '3 usuarios · 99 €/mes', price: '99', priceCurrency: 'EUR', url: `${BASE_URL}/registro`,
      description: 'Local con 3 usuarios activos. Ideal para restaurante con sala y cocina.',
      priceSpecification: { '@type': 'UnitPriceSpecification', price: '99', priceCurrency: 'EUR', billingDuration: 'P1M' } },
    { '@type': 'Offer', name: '6 usuarios · 159 €/mes', price: '159', priceCurrency: 'EUR', url: `${BASE_URL}/registro`,
      description: 'Local con 6 usuarios activos. Para casas grandes con varios salones o terraza.',
      priceSpecification: { '@type': 'UnitPriceSpecification', price: '159', priceCurrency: 'EUR', billingDuration: 'P1M' } },
  ],
  featureList: [
    'Comandas por voz con IA (Whisper + Claude)',
    'VeriFactu homologado SHA-256 — incluido en todos los perfiles',
    'KDS pantalla de cocina en tiempo real — incluido en todos los perfiles',
    'Cobros Stripe Terminal y Bizum MONEI',
    'Alérgenos EU Reglamento 1169/2011 con trazabilidad legal',
    'Sin comisiones por transacción',
    'Gestión multi-local nativa — varios restaurantes desde una cuenta',
    'Alta sin instalador en menos de 30 minutos',
    'PWA sin instalación de apps — cualquier Android desde 180 €',
    'Soporte WhatsApp directo incluido',
    'Kit Digital compatible — subvención para pymes y autónomos',
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
      acceptedAnswer: { '@type': 'Answer', text: 'Sí. Todos los perfiles generan facturas con hash encadenado SHA-256 y QR verificable por la AEAT. VeriFactu es obligatorio en España: para sociedades desde el 1 de enero de 2027 y para autónomos desde el 1 de julio de 2027 (Real Decreto-ley 15/2025, BOE 3-dic-2025). Multas de hasta 50.000 € por ejercicio.' } },
    { '@type': 'Question', name: '¿Funciona el reconocimiento de voz con acento andaluz o catalán?',
      acceptedAnswer: { '@type': 'Answer', text: 'Sí. BRAIN está entrenado con vocabulario hostelero real en español: marchar, 86, sin, para llevar... Funciona con todos los acentos regionales y mejora con cada servicio.' } },
    { '@type': 'Question', name: '¿Puedo financiar ia.rest con el Kit Digital?',
      acceptedAnswer: { '@type': 'Answer', text: 'Sí. ia.rest es compatible con las subvenciones Kit Digital del Gobierno de España para digitalización de pymes y autónomos.' } },
    { '@type': 'Question', name: '¿Cómo funciona el precio de ia.rest?',
      acceptedAnswer: { '@type': 'Answer', text: 'ia.rest usa tarificación por usuario activo: 59 €/mes por el local más 20 €/mes por cada usuario adicional (camarero, cocina o jefe de sala). A partir del séptimo usuario el precio baja a 15 €/mes. Un bar con 1 usuario paga 59 €/mes. Un restaurante con 6 usuarios paga 159 €/mes. Sin comisiones por cobro.' } },
    { '@type': 'Question', name: '¿Hay comisión por cada pago con tarjeta o Bizum?',
      acceptedAnswer: { '@type': 'Answer', text: 'No. ia.rest no cobra comisión por transacción. Pagas la cuota mensual fija. Cero porcentaje sobre tus ventas.' } },
    { '@type': 'Question', name: '¿Puedo migrar desde mi TPV actual (Numier, Ágora, Revo...)?',
      acceptedAnswer: { '@type': 'Answer', text: 'Sí. Si tienes carta en papel o en otro sistema, la importamos automáticamente desde una foto con IA en minutos. El alta completa (local, mesas, usuarios) lleva menos de 30 minutos, sin que venga nadie a instalar nada.' } },
    { '@type': 'Question', name: '¿Funciona ia.rest para gestionar varios locales?',
      acceptedAnswer: { '@type': 'Answer', text: 'Sí. ia.rest tiene gestión multicuenta nativa. Desde un único acceso puedes ver y gestionar todos tus locales de forma independiente, cada uno con su carta, mesas, personal y facturación.' } },
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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdOrg) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdWebSite) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdApp) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFaq) }} />
        {/* Google Analytics 4 — G-EN2YQLRLEX */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-EN2YQLRLEX" />
        <script dangerouslySetInnerHTML={{ __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-EN2YQLRLEX', { page_path: window.location.pathname });
        `}} />
      </head>
      <body>
        {children}
        <AppBadge />
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

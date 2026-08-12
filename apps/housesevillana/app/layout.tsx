import Script from 'next/script';

export const metadata = {
  title: 'House Sevillana - Alquiler Vacacional Sevilla Centro',
  description: 'Casa de 290m² con 6 dormitorios, parking privado y patio en el corazon de Sevilla. Reserva directa sin comisiones. VFT/SE/01179.',
  openGraph: {
    title: 'House Sevillana - Sevilla Centro',
    description: 'Casa completa 290m², 6 dorm, 4 baños, parking privado. 10 min Catedral.',
    locale: 'es_ES',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, fontFamily: "'Outfit', system-ui, sans-serif", color: '#111' }}>
        {children}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-N5CMQL9C4M"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-N5CMQL9C4M');
          `}
        </Script>
      </body>
    </html>
  );
}

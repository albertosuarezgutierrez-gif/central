import type { Metadata } from "next"
import { Syne } from "next/font/google"
import "./globals.css"
import { SessionProvider } from "next-auth/react"
import { auth } from "@/lib/auth"

const syne = Syne({ subsets: ["latin"], weight: ["400","600","700","800"], variable: "--font-syne" })

export const metadata: Metadata = {
  title: "SIVRA",
  description: "Gestión de alojamientos turísticos · Sevilla",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SIVRA",
  },
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#F4F6F9",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return (
    <html lang="es">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="SIVRA" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then(function(reg) { console.log('[SW] Registered', reg.scope); })
                .catch(function(err) { console.warn('[SW] Failed:', err); });
            });
          }
        `}} />
      </head>
      <body className={syne.variable} style={{ fontFamily: "var(--font-syne), 'Syne', sans-serif", background: "#F4F6F9" }}>
        <SessionProvider session={session}>{children}</SessionProvider>
      </body>
    </html>
  )
}

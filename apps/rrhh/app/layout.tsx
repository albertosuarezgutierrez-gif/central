import "./globals.css"
import type { Metadata, Viewport } from "next"
import { JetBrains_Mono, Quicksand, Nunito_Sans } from "next/font/google"
import { MARCA_ASEGURA, emitirRootCss } from "@central/brand"
import RegisterSW from "@/components/RegisterSW"
import { COBALTO_ASEGURA, ICONO_APPLE_ASEGURA, MANIFEST_PORTAL, TITULO_ASEGURA } from "@/lib/marca-asegura"

// Marca ÚNICA (26/10/2026): Grupo ASegura para todas las empresas. Tipografía de marca: Quicksand (titulares,
// menús, botones) + Nunito Sans (cuerpo), sin cursivas. El mono solo para códigos.
const quicksand = Quicksand({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-quicksand", display: "swap" })
const nunito = Nunito_Sans({ subsets: ["latin"], variable: "--font-nunito", display: "swap" })
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" })

export const metadata: Metadata = {
  title: TITULO_ASEGURA,
  manifest: MANIFEST_PORTAL,
  icons: { icon: "/brand/icono-asegura.svg", apple: ICONO_APPLE_ASEGURA },
  appleWebApp: { capable: true, title: "Grupo ASegura", statusBarStyle: "default" },
  // Datos personales: no indexar (ver también app/robots.ts y X-Robots-Tag en next.config.ts).
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: COBALTO_ASEGURA }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${quicksand.variable} ${nunito.variable} ${mono.variable}`}>
      <head>
        {/* Tokens de @central/brand (colores, radio, elevaciones). Sin hex a mano en la app. */}
        <style dangerouslySetInnerHTML={{ __html: emitirRootCss(MARCA_ASEGURA) }} />
      </head>
      <body>{children}<RegisterSW /></body>
    </html>
  )
}

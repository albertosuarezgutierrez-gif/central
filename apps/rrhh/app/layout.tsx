import "./globals.css"
import type { Metadata, Viewport } from "next"
import { Inter_Tight, Newsreader, JetBrains_Mono } from "next/font/google"
import RegisterSW from "@/components/RegisterSW"

const sans = Inter_Tight({ subsets: ["latin"], variable: "--font-sans", display: "swap" })
const serif = Newsreader({ subsets: ["latin"], variable: "--font-serif", display: "swap" })
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" })

export const metadata: Metadata = {
  title: "iarrhh · Portal del Empleado",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg" },
}

export const viewport: Viewport = { themeColor: "#2B6A6E" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>{children}<RegisterSW /></body>
    </html>
  )
}

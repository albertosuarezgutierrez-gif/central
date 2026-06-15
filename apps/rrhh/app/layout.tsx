import "./globals.css"
import type { Metadata, Viewport } from "next"
import RegisterSW from "@/components/RegisterSW"

export const metadata: Metadata = {
  title: "RR.HH. · Portal del Empleado",
  manifest: "/manifest.json",
}

export const viewport: Viewport = { themeColor: "#0f766e" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es"><body>{children}<RegisterSW /></body></html>
  )
}

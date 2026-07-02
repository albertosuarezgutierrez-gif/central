import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

// Tipografía del sistema de diseño (self-hosted por next/font: cero peticiones externas
// en runtime). Expuesta como var(--font-inter) y aplicada en globals.css.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'ia plataforma',
  description: 'Cuadro de mando consolidado',
  manifest: '/manifest.json',
}

// Next 15 exige themeColor en el export `viewport`, no en `metadata` (antes
// emitía «⚠ Unsupported metadata themeColor…» en cada render en producción).
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#4f46e5' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <body>
        {/* Anti-parpadeo: aplica el tema elegido (localStorage) antes del primer
            pintado; sin elección no pone data-theme y mandan las media queries. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  )
}

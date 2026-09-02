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
  // Renderiza <meta name="color-scheme">. "only light" es la señal que respetan
  // Chrome/Samsung Internet para NO aplicar su oscurecimiento forzado (ahorro de
  // batería). El tema por defecto es CLARO; el oscuro solo existe elegido a mano
  // (el script anti-parpadeo y el toggle reescriben la meta a "dark" en ese caso).
  colorScheme: 'only light',
  themeColor: '#4f46e5',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <body>
        {/* Anti-parpadeo: aplica el tema OSCURO elegido (localStorage) antes del
            primer pintado; sin elección (o con 'light') se queda el claro por defecto.
            En la misma pasada se aplica el modo «saldo oculto» (botón 👁 de /banca): tiene que
            entrar ANTES de pintar, porque un solo fotograma con la cifra a la vista ya delata el
            saldo, que es justo lo que el modo evita al enseñar el panel a alguien.
            Y el lateral plegado (botón « de UserSidebar): si se aplicara al hidratar, cada recarga
            pintaría el lateral abierto y luego lo plegaría, desplazando toda la pantalla. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('theme')==='dark'){document.documentElement.dataset.theme='dark';var m=document.querySelector('meta[name="color-scheme"]');if(m)m.setAttribute('content','dark');var c=document.querySelector('meta[name="theme-color"]');if(c)c.setAttribute('content','#0b1220')}}catch(e){}
try{if(localStorage.getItem('saldo-oculto')==='1'){document.documentElement.dataset.saldoOculto='1'}}catch(e){}
try{if(localStorage.getItem('nav-plegado')==='1'){document.documentElement.dataset.navPlegado='1'}}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  )
}

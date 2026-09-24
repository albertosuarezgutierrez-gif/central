import type { Metadata, Viewport } from 'next'
import { Nunito_Sans, Quicksand } from 'next/font/google'
import './globals.css'
import { RegistrarSW } from './RegistrarSW'

// Tipografía del sistema de diseño (self-hosted por next/font: cero peticiones externas
// en runtime). Desde el 24/09/2026 TODA plataforma usa el lenguaje visual de la correduría
// (decisión de Alberto: «para que todo sea igual»): titulares, menús y botones en Quicksand,
// cuerpo en Nunito Sans. Solo el lenguaje visual: el logo y el nombre «Grupo ASegura» siguen
// siendo exclusivos de /correduria. Variables aplicadas en globals.css.
const titulares = Quicksand({ subsets: ['latin'], weight: ['500', '600', '700'], display: 'swap', variable: '--font-marca-display' })
const cuerpo = Nunito_Sans({ subsets: ['latin'], weight: ['400', '600', '700', '800'], display: 'swap', variable: '--font-marca-sans' })

export const metadata: Metadata = {
  title: 'Mi grupo',
  description: 'Cuadro de mando consolidado',
  // El manifiesto lo publica `app/manifest.ts` (Next lo enlaza solo). Icono de pestaña e iOS:
  icons: { icon: '/icon.svg', apple: '/icono-app' },
}

// Next 15 exige themeColor en el export `viewport`, no en `metadata` (antes
// emitía «⚠ Unsupported metadata themeColor…» en cada render en producción).
export const viewport: Viewport = {
  // Renderiza <meta name="color-scheme">. "only light" es la señal que respetan
  // Chrome/Samsung Internet para NO aplicar su oscurecimiento forzado (ahorro de
  // batería). El tema por defecto es CLARO; el oscuro solo existe elegido a mano
  // (el script anti-parpadeo y el toggle reescriben la meta a "dark" en ese caso).
  colorScheme: 'only light',
  themeColor: '#3364ee',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${titulares.variable} ${cuerpo.variable}`} suppressHydrationWarning>
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
        <RegistrarSW />
      </body>
    </html>
  )
}

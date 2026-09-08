import { MARCA_ASEGURA, emitirRootCss } from '@central/brand'

import './globals.css'
import type { ReactNode } from 'react'
import { CampanaAvisos } from './CampanaAvisos'
import { InstalarEnBarra } from './InstalarEnBarra'
import { InterruptorTema } from './InterruptorTema'
import { MarcaAsegura } from './MarcaAsegura'
import { PieLegal } from './PieLegal'
import { RegistrarSW } from './RegistrarSW'
import { SalirDelPortal } from './SalirDelPortal'
import { SCRIPT_TEMA } from './tema'

// Marca activa del portal. Es la de `app.grupoasegura.com` medida del CSS
// compilado de la app de Manuel (ver `packages/brand/src/marcas/asegura.ts`):
// el asegurado tiene que reconocer a su correduría, no una plantilla índigo.
const MARCA = MARCA_ASEGURA

/**
 * La serif de TITULARES, la misma que la web pública.
 *
 * ── Por qué se añade (07/09/2026) ───────────────────────────────────────────
 * Alberto, mirando su portal: «el diseño no es muy parecido a la web… se puede
 * hacer mejor y más acorde». Y la distancia era exactamente esta: la paleta ya
 * era la MISMA (las dos apps inyectan `MARCA_ASEGURA`), pero la web pone su
 * titular en Fraunces a 41-67 px y el portal lo ponía a 24 px en Inter. Quien
 * llega desde `grupoasegura.es` no reconocía el sitio.
 *
 * ⚠️ Esto REVISA —no deroga— la nota de `packages/brand/src/marcas/asegura.ts`,
 * que dejó Fraunces fuera porque «en el portal el titular más grande es un h1
 * de 20 px, y a ese tamaño no aporta carácter». El argumento era bueno para
 * ese tamaño; la respuesta no es solo cargar la fuente, es que el titular suba
 * a 32 px. A 24 px la serif efectivamente no se distingue.
 *
 * 🚨 Y el coste sigue sin estar medido: el argumento en contra era «un segundo
 * webfont en el móvil de alguien que abre el portal después de un correo», y no
 * se ha podido pesar desde este entorno. Por eso se pide UN solo peso (500),
 * con `display=swap` y una serif de sistema de reserva: si tarda o falla, el
 * titular se ve en Georgia y no se rompe nada. Si algún día se mide y pesa de
 * más, se quita de aquí y solo de aquí.
 *
 * `opsz` es el eje óptico de Fraunces: sin declararlo, Google sirve el corte de
 * 9 pt y a 32 px se ve endeble.
 */
const FRAUNCES =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;1,9..144,500&display=swap'
const DISPLAY = "'Fraunces', ui-serif, Georgia, 'Times New Roman', serif"

export const metadata = { title: 'Mis seguros — Grupo ASegura' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Antes que NADA: fija el tema leyendo la preferencia guardada, de
            forma síncrona, antes del primer pintado. Si esto se moviera más
            abajo o se volviera `defer`, quien tiene el tema oscuro vería un
            destello blanco a pantalla completa en cada carga. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
        {MARCA.tipografia.googleFontsHref && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            {/* Por <link> y NO con `next/font/google`: el build no tiene red y
                `next/font` descarga la fuente en tiempo de build. */}
            {/* eslint-disable-next-line @next/next/no-page-custom-font */}
            <link rel="stylesheet" href={MARCA.tipografia.googleFontsHref} />
          </>
        )}
        <link rel="stylesheet" href={FRAUNCES} />
        {/* Tema de marca. Va SIN capa a propósito: los valores por defecto de
            `globals.css` viven en `@layer portal-base`, y lo no-capado gana
            siempre a lo capado — así el override no depende del orden en que
            Next monte el <head>. */}
        <style dangerouslySetInnerHTML={{ __html: emitirRootCss(MARCA) }} />
        {/* `--display` NO sale de `@central/brand` a propósito: la marca declara
            Inter para todo y esa decisión la comparten otras superficies. Cuál
            es la fuente del TITULAR es una decisión de ESTA app, igual que
            `asegura-web` pide Fraunces en su propio layout y no en el paquete. */}
        <style dangerouslySetInnerHTML={{ __html: `:root{--display:${DISPLAY}}` }} />
      </head>
      <body>
        {/* Un portal que no dice de quién es parece de nadie — y el asegurado
            acaba de recibir un código por correo, así que lo primero que tiene
            que reconocer es la marca. */}
        <header className="marca-barra">
          <span className="marca-escudo">
            <MarcaAsegura alto={15} />
          </span>
          <span className="marca-nombre">{MARCA.logos.wordmark}</span>
          <span className="marca-coletilla">Correduría de seguros</span>
          {/* Las acciones de la cabecera van sueltas y no en un menú:
              esconder cosas detrás de un botón cuesta un toque más, un
              componente más y, en esta pantalla, que gente de 50-70 años no
              encuentre la salida. Van dentro de UN contenedor con el único
              `margin-left:auto` de la derecha (`.marca-acciones`): con el
              `auto` repartido entre botones, cada uno que se añadía o se
              quitaba (instalar solo existe si el navegador lo ofrece) cambiaba
              el reparto del hueco y los separaba sin que nada fallara.
              Orden (Alberto, 08/09/2026): instalar «en el banner fijo de
              arriba» → avisos → tema → salir, que va «a la derecha del
              todo, es lo lógico».
              🚨 `InstalarEnBarra`, `SalirDelPortal` y `CampanaAvisos` devuelven
              `null` cuando no hay sesión: quien todavía no ha entrado no ve
              ni instalar, ni salir, ni avisos. */}
          <div className="marca-acciones">
            <InstalarEnBarra />
            <CampanaAvisos />
            <InterruptorTema />
            <SalirDelPortal />
          </div>
        </header>
        {children}
        {/* Registra el service worker que Chrome exige para ofrecer instalar la
            app. No cachea nada: ver `public/sw.js`. */}
        <RegistrarSW />
        {/* En el layout raíz y no en el del portal: quien todavía no ha metido
            el código tiene que poder identificar al mediador y leer la política
            de privacidad ANTES de escribir su correo, no después. */}
        <PieLegal />
      </body>
    </html>
  )
}

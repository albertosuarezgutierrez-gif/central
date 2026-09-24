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
import { SugerenciaBarra } from './SugerenciaBarra'
import { SCRIPT_TEMA } from './tema'
import { WhatsappFlotante } from './WhatsappFlotante'

// Marca activa del portal. Es la de `app.grupoasegura.com` medida del CSS
// compilado de la app de Manuel (ver `packages/brand/src/marcas/asegura.ts`):
// el asegurado tiene que reconocer a su correduría, no una plantilla índigo.
const MARCA = MARCA_ASEGURA

/**
 * Tipografía del portal: la MISMA que la web pública (24/09/2026).
 *
 * Alberto pidió que la intranet de clientes siguiera a `grupoasegura.es` al
 * pasar de Fraunces + Inter a **Quicksand** (titulares, la familia del
 * logotipo) + **Nunito Sans** (cuerpo). Es la continuación del criterio del
 * 07/09/2026 («el diseño no es muy parecido a la web»): quien llega desde la
 * web tiene que reconocer el sitio, y eso lo hace la letra antes que el color.
 *
 * Una sola petición para las dos familias, y SUSTITUYE a Inter + Fraunces:
 * sigue siendo el mismo número de hojas de fuente que antes en el móvil de
 * quien abre el portal desde un correo, no una más. `display=swap` y fuentes de
 * sistema de reserva: si tarda o falla, se lee igual.
 *
 * Solo esta app y la web: `@central/brand` sigue declarando Inter para los
 * correos y el resto de superficies, por eso `--sans` se pisa aquí.
 *
 * 🚨 Sin itálica: Quicksand no la tiene. Por eso `h1 em` ya no inclina (como
 * `.destaca` en la web): el acento lo lleva el color.
 */
const TIPOGRAFIA =
  'https://fonts.googleapis.com/css2?family=Quicksand:wght@300..700&family=Nunito+Sans:wght@400;600;700;800&display=swap'
const DISPLAY = "'Quicksand', ui-rounded, system-ui, sans-serif"
const SANS = "'Nunito Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

// 🚨 `noindex` para TODO el portal (23/09/2026). Search Console lo enseñaba:
// `clientes.grupoasegura.es` sumaba 72 impresiones en 28 días para «grupo
// asegurador» (posición ~85, 0 clics) y competía con la web pública por la
// propia marca («grup asecura»: portal 19,9, web 22,8). Es una pantalla de
// acceso: no tiene nada que posicionar, y lo que resta se lo resta a
// `grupoasegura.es`. Va en el layout RAÍZ para que no dependa de acordarse en
// cada página nueva. Lo vigila `lib/noindex.test.ts`.
export const metadata = { title: 'Mis seguros — Grupo ASegura', robots: { index: false, follow: false } }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Antes que NADA: fija el tema leyendo la preferencia guardada, de
            forma síncrona, antes del primer pintado. Si esto se moviera más
            abajo o se volviera `defer`, quien tiene el tema oscuro vería un
            destello blanco a pantalla completa en cada carga. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Por <link> y NO con `next/font/google`: el build no tiene red y
            `next/font` descarga la fuente en tiempo de build. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={TIPOGRAFIA} />
        {/* Tema de marca. Va SIN capa a propósito: los valores por defecto de
            `globals.css` viven en `@layer portal-base`, y lo no-capado gana
            siempre a lo capado — así el override no depende del orden en que
            Next monte el <head>. */}
        <style dangerouslySetInnerHTML={{ __html: emitirRootCss(MARCA) }} />
        {/* `--display` NO sale de `@central/brand` a propósito: la marca declara
            Inter para todo y esa decisión la comparten otras superficies. Cuál
            es la fuente del TITULAR es una decisión de ESTA app, igual que
            `asegura-web` pide Fraunces en su propio layout y no en el paquete. */}
        <style dangerouslySetInnerHTML={{ __html: `:root{--display:${DISPLAY};--sans:${SANS}}` }} />
      </head>
      <body>
        {/* Un portal que no dice de quién es parece de nadie — y el asegurado
            acaba de recibir un código por correo, así que lo primero que tiene
            que reconocer es la marca. */}
        <header className="marca-barra">
          {/* La puerta del ☰: vive aquí, en el layout RAÍZ, para que en el
              móvil el menú de secciones esté en la MISMA barra que la marca en
              vez de en una segunda franja debajo (que era la mitad de la
              pantalla vacía por dos veces el mismo alto de cabecera). El
              layout raíz no sabe si hay sesión ni qué secciones existen —
              `NavPortal` (dentro de `(portal)/layout.tsx`) porta su botón
              hasta aquí con `createPortal`; en las páginas públicas el `<span>`
              se queda vacío y sin tamaño (`display:contents`). */}
          <span id="portal-menu-slot" className="marca-menu-slot" />
          <span className="marca-escudo">
            <MarcaAsegura alto={15} />
          </span>
          <span className="marca-nombre">
            {/* Logotipo en trazo fino, con el «AS» oficial dentro (el mismo
                fichero que la web). El nombre en texto sigue ahí para el
                lector de pantalla. */}
            <span className="marca-palabra" aria-hidden="true" />
            <span className="sr-marca">{MARCA.logos.wordmark}</span>
          </span>
          <span className="marca-coletilla">Correduría de seguros</span>
          {/* Las acciones de la cabecera van sueltas y no en un menú:
              esconder cosas detrás de un botón cuesta un toque más, un
              componente más y, en esta pantalla, que gente de 50-70 años no
              encuentre la salida. Van dentro de UN contenedor con el único
              `margin-left:auto` de la derecha (`.marca-acciones`): con el
              `auto` repartido entre botones, cada uno que se añadía o se
              quitaba (instalar solo existe si el navegador lo ofrece, y la
              sugerencia y la campana solo con sesión) cambiaba el reparto
              del hueco y los separaba sin que nada fallara.
              Orden (Alberto, 08-09/09/2026): instalar «en el banner fijo de
              arriba» → sugerencia (junto a la campana, el otro desplegable)
              → avisos → tema → salir, que va «a la derecha del todo, es lo
              lógico».
              🚨 `InstalarEnBarra`, `SugerenciaBarra`, `SalirDelPortal` y
              `CampanaAvisos` devuelven `null` cuando no hay sesión: quien
              todavía no ha entrado no ve ni instalar, ni sugerencia, ni
              salir, ni avisos. */}
          <div className="marca-acciones">
            <InstalarEnBarra />
            <SugerenciaBarra />
            <CampanaAvisos />
            <InterruptorTema />
            <SalirDelPortal />
          </div>
        </header>
        {children}
        {/* Como en `asegura-web`: "clic para chatear", visible con o sin
            sesión. No es el canal de login (ese sigue sin WABA). */}
        <WhatsappFlotante />
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

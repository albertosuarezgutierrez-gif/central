'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { pestanasPortal, vistaDeBoveda } from '@central/module-seguros-portal'

/**
 * La navegación del portal: **un solo `<nav>` con dos formas**.
 *
 * 🚨 El mismo DOM se pinta como cajón (drawer) en el móvil y como lateral
 * vertical en el escritorio; lo decide `globals.css` (`.portal-nav`), no dos
 * componentes ni dos listas. Dos árboles distintos para la misma navegación es
 * cómo se llega a que una sección exista en una pantalla y no en la otra sin
 * que nada falle — y encima duplica el marcado en cada carga.
 *
 * 📱 **Hamburguesa en el móvil desde el 19/09/2026, y esto REVIERTE la decisión
 * anterior.** Hasta hoy aquí ponía que no había hamburguesa a propósito: «son
 * cuatro secciones, y un botón que las esconde las hace menos visibles». La
 * decisión era correcta con su premisa y la premisa ya no se cumple:
 * `pestanasPortal()` devuelve **ocho** entradas (Seguros, Mi QR, Recibos,
 * Siniestros, Recordatorios, Contactos, Datos). Con siete, el carril horizontal
 * no enseñaba las secciones: las amontonaba y las cortaba — que es justo lo que
 * Alberto vio en su móvil, y lo que ya había obligado a bajar de cuatro a tres
 * en su día. Un enlace que hay que descubrir arrastrando por casualidad está
 * más escondido que uno detrás de un botón que se ve. Pidió el patrón de
 * `apps/plataforma` (☰ + cajón), y es el que se replica.
 *
 * ⚠️ Lo que se PIERDE y conviene tener escrito: el carril era CSS puro, así que
 * funcionaba sin JavaScript. El cajón se abre con un `onClick`. Por eso va el
 * `<noscript>` de más abajo, que devuelve la navegación a su forma de carril
 * cuando no hay JS: sin él, un fallo de script dejaría a esta persona sin
 * ninguna forma de cambiar de sección.
 *
 * 🔀 **El botón ☰ vive en la barra de MARCA, no en una segunda franja debajo
 * (19/09/2026).** Alberto, mirando su propio móvil: «no se podría unificar la
 * parte de arriba? Hay mucho espacio libre» — dos barras de 56/53px apiladas
 * (marca + «☰ Menú · Seguros») por debajo de la cual empezaba el contenido de
 * verdad. La marca vive en el layout RAÍZ (`app/layout.tsx`, fuera de sesión)
 * y este componente en el del portal (dentro de sesión), así que el botón no
 * puede ser sencillamente el mismo JSX en el mismo sitio: se porta con
 * `createPortal` a un `<span id="portal-menu-slot">` que el layout raíz deja
 * vacío. `mounted` existe porque `document.getElementById` no existe en el
 * servidor: sin él, la primera pasada de SSR reventaría.
 *
 * 📌 **Y la etiqueta «en qué sección estás» se queda solo en el `aria-label`,
 * no visible.** Con el botón metido en la barra de marca ya no hay sitio para
 * un texto al lado, y cada pantalla del portal ya lo dice con su propio
 * `<h1>` — pintar «Seguros» otra vez sería el mismo eco que ya se quitó del
 * par pestaña/h1 el 12/09/2026.
 *
 * Siguen siendo ENLACES, no botones con estado ni un `tablist`: la sección vive
 * en la URL (ver `vista-portal.ts` del módulo). Por eso la activa se deriva aquí
 * de la ruta y del parámetro, y no baja como prop desde cada página — así el
 * `layout` puede pintar la navegación una sola vez para todas.
 */
export function NavPortal({ llamar }: { llamar?: { tel: string; numero: string } }) {
  const ruta = usePathname()
  const params = useSearchParams()
  // `/autorizaciones` es otra RUTA, no un panel de la bóveda; por eso la ruta
  // manda sobre el parámetro y no al revés.
  const enBoveda = ruta === '/boveda'
  const activa = enBoveda ? vistaDeBoveda(params.get('vista') ?? undefined) : null
  const pestanas = pestanasPortal()
  // Las pestañas que son otra RUTA (Contactos, Mensajes) se casan por su href: con dos,
  // «no estoy en la bóveda» encendería las dos a la vez.
  const esActivaDe = (p: { vista: string | null; href: string }) =>
    p.vista === null ? ruta === p.href || ruta.startsWith(`${p.href}/`) : enBoveda && p.vista === activa

  // 🚨 El cajón se DERIVA de en qué pantalla se abrió, no es un booleano suelto:
  // se guarda la ruta+parámetro del momento en que se abrió y está abierto solo
  // mientras siguen siendo los mismos. Así cambiar de sección lo cierra sin un
  // efecto que sincronice dos estados —y cubre el caso que un `onClick` en cada
  // enlace NO cubre: el gesto de «atrás» de Android, que navega sin tocar
  // ninguno de ellos y dejaba el menú abierto sobre la pantalla nueva.
  const clave = `${ruta}?${params.toString()}`
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null)
  const abierto = abiertoEn === clave
  const cerrar = () => setAbiertoEn(null)
  const idNav = useId()
  const botonRef = useRef<HTMLButtonElement>(null)
  const cerrarRef = useRef<HTMLButtonElement>(null)
  // Para devolver el foco al ☰ SOLO cuando el cajón estaba abierto: sin esta
  // marca, el primer render robaría el foco al cargar la página.
  const estuvoAbierto = useRef(false)

  // Escape cierra. Va en el documento y no en el `<nav>` porque el foco puede
  // estar en el fondo oscuro o en el propio botón, y un Escape que solo
  // funciona si acertaste dónde pulsar no es una salida.
  useEffect(() => {
    if (!abierto) return
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar()
    }
    document.addEventListener('keydown', alPulsar)
    return () => document.removeEventListener('keydown', alPulsar)
  }, [abierto])

  // El foco entra al cajón al abrirlo y vuelve al ☰ al cerrarlo. Sin esto, quien
  // navega con teclado abre el menú y sigue tabulando por la página de detrás.
  useEffect(() => {
    if (abierto) {
      estuvoAbierto.current = true
      cerrarRef.current?.focus()
    } else if (estuvoAbierto.current) {
      estuvoAbierto.current = false
      botonRef.current?.focus()
    }
  }, [abierto])

  const etiquetaActiva = pestanas.find((p) => esActivaDe(p))?.etiqueta ?? null

  // El slot vive en el layout RAÍZ (`app/layout.tsx`), fuera del árbol de este
  // componente. `document.getElementById` no existe en el servidor, así que
  // sin `mounted` la primera pasada (SSR + primer render de cliente) tiraría.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const slot = mounted ? document.getElementById('portal-menu-slot') : null

  const boton = (
    <button
      ref={botonRef}
      type="button"
      className="marca-menu-boton"
      // La sección activa ya no se pinta al lado (no hay sitio en la barra de
      // marca): viaja en el `aria-label` para que un lector de pantalla la
      // siga diciendo.
      aria-label={
        abierto
          ? 'Cerrar el menú de secciones'
          : etiquetaActiva !== null
            ? `Abrir el menú de secciones — estás en ${etiquetaActiva}`
            : 'Abrir el menú de secciones'
      }
      aria-expanded={abierto}
      aria-controls={idNav}
      onClick={() => setAbiertoEn(abierto ? null : clave)}
    >
      <span aria-hidden="true">☰</span>
    </button>
  )

  return (
    <>
      {/* 19/09/2026: el ☰ ya no abre su propia franja debajo de la marca — se
          porta a la barra de marca del layout raíz, que es la misma franja
          para las dos cosas. En escritorio el botón se sigue portando igual,
          es indiferente: lleva su propio `display:none` a partir de 1024px. */}
      {slot && createPortal(boton, slot)}

      {/* El fondo oscuro cierra al tocar fuera. `aria-hidden` porque no aporta
          nada a un lector de pantalla: la salida accesible es el botón de
          cerrar y la tecla Escape. */}
      {abierto && (
        <div className="portal-nav-fondo" aria-hidden="true" onClick={cerrar} />
      )}

      <nav
        id={idNav}
        className="portal-nav"
        data-abierto={abierto ? 'si' : undefined}
        aria-label="Secciones"
      >
        {/* Cabecera del cajón, invisible en escritorio. El botón de cerrar es el
            primer elemento enfocable de dentro, que es donde entra el foco. */}
        <div className="portal-nav-cabecera">
          <span className="portal-nav-titulo">Secciones</span>
          <button
            ref={cerrarRef}
            type="button"
            className="portal-nav-cerrar"
            aria-label="Cerrar el menú de secciones"
            onClick={cerrar}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {pestanas.map((p) => {
          const esActiva = esActivaDe(p)
          return (
            <Link
              key={p.href}
              href={p.href}
              className="portal-nav-item"
              // `aria-current="page"` y no `aria-selected`: esto es navegación
              // entre páginas, no un widget de pestañas. Decirle a un lector de
              // pantalla que es un tablist cuando cada clic recarga sería
              // describir algo que no está pasando.
              aria-current={esActiva ? 'page' : undefined}
              data-activa={esActiva ? 'si' : undefined}
              onClick={cerrar}
            >
              {p.etiqueta}
            </Link>
          )
        })}
        {/* Llamar al corredor, a un toque desde cualquier sección (24/09/2026). El
            número llega del servidor (`MEDIADOR`): importar `@central/module-seguros`
            aquí arrastraría la cartera entera al bundle del navegador. */}
        {llamar && (
          <a className="portal-nav-llamar" href={`tel:${llamar.tel}`}>
            <span>Llamar a tu corredor</span>
            <span className="portal-nav-llamar-numero">{llamar.numero}</span>
          </a>
        )}
      </nav>

      {/* 📱 Barra inferior (26/09/2026, a lo Smoobu; Alberto: «me gustó el diseño de Smoobu para
          la app de cliente»). Lo que el asegurado viene a hacer, a un toque del pulgar; el resto
          sigue en el cajón, que abre «Más» (y el ☰ de arriba, que se queda: esta pantalla la abre
          gente de 50-70 años y dos puertas al mismo menú no confunden, una escondida sí). Solo por
          debajo de 1024 px: en escritorio el lateral ya enseña todas. Son ENLACES, como el cajón,
          así que funcionan sin JavaScript; solo «Más» lo necesita. */}
      <nav className="portal-tabbar" aria-label="Accesos rápidos">
        {TABBAR.map(({ href, Icono }) => {
          const p = pestanas.find((x) => x.href === href)
          if (!p) return null
          const esActiva = !abierto && esActivaDe(p)
          return (
            <Link
              key={href}
              href={href}
              className="portal-tabbar-item"
              aria-current={esActiva ? 'page' : undefined}
              data-activa={esActiva ? 'si' : undefined}
            >
              <Icono />
              <span className="portal-tabbar-rotulo">{p.etiqueta}</span>
            </Link>
          )
        })}
        <button
          type="button"
          className="portal-tabbar-item"
          aria-label="Más secciones"
          aria-expanded={abierto}
          aria-controls={idNav}
          data-activa={abierto ? 'si' : undefined}
          onClick={() => setAbiertoEn(abierto ? null : clave)}
        >
          <IconoMas />
          <span className="portal-tabbar-rotulo">Más</span>
        </button>
      </nav>

      {/* 🚨 Sin JavaScript no hay `createPortal` ni ☰ que abrir (el botón ni
          siquiera se renderiza: `mounted` se queda en `false`), así que la
          navegación vuelve a ser el carril horizontal que era hasta el
          19/09/2026: se ve peor con siete pestañas, pero se ve. Un cajón que
          no se puede abrir es una pantalla sin salida. */}
      <noscript>
        <style>{`
          @media (max-width: 1023px) {
            .portal-nav-cabecera { display: none; }
            .portal-nav {
              position: static;
              visibility: visible;
              transform: none;
              width: auto;
              max-width: none;
              flex-direction: row;
              overflow-x: auto;
              padding: 0;
              border-right: 0;
              border-bottom: 1px solid var(--border);
              box-shadow: none;
            }
            .portal-nav-item { flex: 1 1 0; min-width: 76px; justify-content: center; text-align: center; }
            .portal-nav-llamar { margin-top: 0; border-top: 0; }
          }
        `}</style>
      </noscript>
    </>
  )
}

// ── Iconos de la barra inferior ─────────────────────────────────────────────
// SVG en línea y no una librería: el portal no carga ninguna de iconos y una
// dependencia nueva por cinco dibujos no compensa. `currentColor` para que
// hereden el color del enlace (activo/inactivo), igual que el texto.
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg className="portal-tabbar-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}
const IconoSeguros = () => <Svg><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z" /><path d="m9 12 2 2 4-4" /></Svg>
const IconoRecibos = () => <Svg><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></Svg>
const IconoSiniestros = () => <Svg><path d="M12 4 2.8 20h18.4L12 4Z" /><path d="M12 10v4.5M12 17.5v.01" /></Svg>
const IconoMensajes = () => <Svg><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4A8 8 0 1 1 20 12Z" /></Svg>
const IconoMas = () => <Svg><circle cx="6" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18" cy="12" r="1.2" /></Svg>

/**
 * Las cuatro de la barra inferior, por `href` contra `pestanasPortal()` — la
 * etiqueta y la ruta salen de ahí, no se teclean dos veces: renombrar una
 * sección en el módulo la renombra también aquí, y una que desaparezca del
 * módulo desaparece de la barra en vez de quedar como enlace roto.
 */
const TABBAR = [
  { href: '/boveda', Icono: IconoSeguros },
  { href: '/boveda?vista=recibos', Icono: IconoRecibos },
  { href: '/boveda?vista=siniestro', Icono: IconoSiniestros },
  { href: '/mensajes', Icono: IconoMensajes },
] as const

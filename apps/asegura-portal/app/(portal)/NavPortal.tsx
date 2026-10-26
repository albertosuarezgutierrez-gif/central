'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { pestanasPortal, seccionActiva, type SeccionPortal } from '@central/module-seguros-portal'

import { WHATSAPP_PATH } from '../whatsapp-icono'
import { CargandoEnlace } from './CargandoEnlace'

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
 * 📱 **Y desde el 26/09/2026 ya no hay ☰: la puerta al cajón es «Más», en la
 * barra inferior** (a lo Smoobu; Alberto: «quita el ☰ de arriba también»).
 * El ☰ vivía en la barra de marca, portado con `createPortal` a un hueco del
 * layout raíz; con la barra inferior eran dos botones para el mismo menú.
 * La sección activa, que el ☰ decía en su `aria-label`, la dice ahora la
 * pestaña activa de la barra (`aria-current`) y el `<h1>` de cada pantalla.
 *
 * Siguen siendo ENLACES, no botones con estado ni un `tablist`: la sección vive
 * en la URL (ver `vista-portal.ts` del módulo). Por eso la activa se deriva aquí
 * de la ruta y del parámetro, y no baja como prop desde cada página — así el
 * `layout` puede pintar la navegación una sola vez para todas.
 */
export function NavPortal({ visibles, llamar, whatsapp }: {
  /** Las entradas que se ofrecen a esta sesión (`menuDeSesion`). Sin ella, las cinco. Solo visibilidad. */
  visibles?: readonly SeccionPortal[]
  llamar?: { tel: string; numero: string }
  /** El enlace `wa.me` ya compuesto en el servidor (ver `llamar`: aquí no se importa `MEDIADOR`). */
  whatsapp?: string
}) {
  const ruta = usePathname()
  // El «AS» flotante solo para enlaces a la MISMA ruta (`?vista=`): en un cambio de ruta ya lo pinta
  // `loading.tsx`, y los dos a la vez serían dos indicadores para una sola espera.
  const mismaRuta = (href: string) => href.split('?')[0] === ruta
  const params = useSearchParams()
  // 26/10/2026: la entrada activa la decide `seccionActiva` (la misma regla que la cabecera): la ruta manda y, en
  // `/boveda`, el `?vista=` dice a cuál de las cinco pertenece (Recibos y Siniestros son «Seguros»; Datos, «Cuenta»).
  const activa = seccionActiva(ruta, params.get('vista'))
  const pestanas = pestanasPortal().filter((p) => visibles === undefined || visibles.includes(p.id))

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
  // Para devolver el foco a «Más» SOLO cuando el cajón estaba abierto: sin esta
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

  // El foco entra al cajón al abrirlo y vuelve a «Más» al cerrarlo. Sin esto, quien
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

  return (
    <>
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
          const esActiva = activa === p.id
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
              {mismaRuta(p.href) && <CargandoEnlace />}
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
        {/* «Salir» en el cajón, SOLO en el móvil (26/09/2026). En la cabecera ya no cabía con el
            logotipo «Grupo ASegura» en lugar del monograma: a 320-390 px la barra se salía ~55 px
            (medido). Es el sitio de las apps (Smoobu lo tiene en «Menú»). En escritorio sigue en la
            cabecera y este se oculta (globals.css). Mismo POST que `SalirDelPortal`: un GET cerraría
            la sesión con la precarga de enlaces. Aquí siempre hay sesión: es el layout `(portal)`. */}
        <form className="portal-nav-salir" action="/api/salir" method="post">
          <button type="submit" className="portal-nav-item">Salir</button>
        </form>
      </nav>

      {/* 📱 Barra inferior (26/09/2026, a lo Smoobu; Alberto: «me gustó el diseño de Smoobu para
          la app de cliente»). Lo que el asegurado viene a hacer, a un toque del pulgar; el resto
          sigue en el cajón, que abre «Más» (la ÚNICA puerta al cajón en el móvil desde que se
          quitó el ☰ de arriba, 26/09/2026). Solo por debajo de 1024 px: en escritorio el lateral
          ya enseña todas. Son ENLACES, como el cajón,
          así que funcionan sin JavaScript; solo «Más» lo necesita. */}
      <nav className="portal-tabbar" aria-label="Accesos rápidos">
        {TABBAR.map(({ href, Icono }) => {
          const p = pestanas.find((x) => x.href === href)
          if (!p) return null
          const esActiva = !abierto && activa === p.id
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
              {mismaRuta(href) && <CargandoEnlace />}
            </Link>
          )
        })}
        {/* WhatsApp en vez de «Mensajes» (Alberto, 26/09/2026: «es más directo»). «Mensajes»
            no desaparece: sigue en el cajón. En el móvil sustituye al botón flotante, que se
            oculta mientras esta barra existe (ver globals.css): dos botones de WhatsApp en la
            misma pantalla es uno de más. */}
        {whatsapp && (
          <a
            className="portal-tabbar-item portal-tabbar-wsp"
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg className="portal-tabbar-icono" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d={WHATSAPP_PATH} />
            </svg>
            <span className="portal-tabbar-rotulo">WhatsApp</span>
          </a>
        )}
        <button
          ref={botonRef}
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

      {/* 🚨 Sin JavaScript «Más» no abre nada (el cajón se abre con un
          `onClick`), así que la
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
const IconoInicio = () => <Svg><path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5h4v5" /></Svg>
const IconoHerramientas = () => <Svg><path d="M14.5 6.5a4 4 0 0 0 4.9 4.9L20 12l-8 8a2.1 2.1 0 0 1-3-3l8-8-.5-.5a4 4 0 0 0-4.9-4.9l2.4 2.4-1.8 1.8-2.4-2.4Z" /></Svg>
const IconoMas = () => <Svg><circle cx="6" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18" cy="12" r="1.2" /></Svg>

/**
 * 26/10/2026 (decisión de Alberto, menú de cinco): `Inicio · Seguros · Herramientas · WhatsApp · Más`. «Siniestros»,
 * «Recibos» y «Mi QR» ya no son entradas: viven DENTRO de «Seguros» (sub-navegación de la bóveda). «Más» abre el cajón
 * con las cinco (Contactos y Cuenta incluidas) y «Llamar»/«Salir». Cinco huecos es el máximo a 320 px (44 px cada uno).
 *
 * Las tres secciones de la barra inferior (la cuarta es WhatsApp), por `href` contra `pestanasPortal()` — la
 * etiqueta y la ruta salen de ahí, no se teclean dos veces: renombrar una
 * sección en el módulo la renombra también aquí, y una que desaparezca del
 * módulo desaparece de la barra en vez de quedar como enlace roto.
 */
const TABBAR = [
  { href: '/inicio', Icono: IconoInicio },
  { href: '/boveda', Icono: IconoSeguros },
  { href: '/herramientas', Icono: IconoHerramientas },
] as const

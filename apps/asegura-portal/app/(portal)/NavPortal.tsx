'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'

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
 * `pestanasPortal()` devuelve **siete** entradas (Seguros, Mi QR, Recibos,
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
 * Siguen siendo ENLACES, no botones con estado ni un `tablist`: la sección vive
 * en la URL (ver `vista-portal.ts` del módulo). Por eso la activa se deriva aquí
 * de la ruta y del parámetro, y no baja como prop desde cada página — así el
 * `layout` puede pintar la navegación una sola vez para todas.
 */
export function NavPortal() {
  const ruta = usePathname()
  const params = useSearchParams()
  // `/autorizaciones` es otra RUTA, no un panel de la bóveda; por eso la ruta
  // manda sobre el parámetro y no al revés.
  const enBoveda = ruta === '/boveda'
  const activa = enBoveda ? vistaDeBoveda(params.get('vista') ?? undefined) : null
  const pestanas = pestanasPortal()
  const esActivaDe = (vista: string | null) =>
    vista === null ? !enBoveda : enBoveda && vista === activa

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

  const etiquetaActiva = pestanas.find((p) => esActivaDe(p.vista))?.etiqueta ?? null

  return (
    <>
      {/* La barra del móvil. En escritorio no existe (`display:none`): allí la
          navegación entera está a la vista y un botón para abrirla sobraría. */}
      <div className="portal-nav-barra">
        <button
          ref={botonRef}
          type="button"
          className="portal-nav-boton"
          aria-label={abierto ? 'Cerrar el menú de secciones' : 'Abrir el menú de secciones'}
          aria-expanded={abierto}
          aria-controls={idNav}
          onClick={() => setAbiertoEn(abierto ? null : clave)}
        >
          <span className="portal-nav-icono" aria-hidden="true">
            ☰
          </span>
          <span>Menú</span>
        </button>
        {/* En qué sección estás, al lado del botón: con el cajón cerrado, la
            barra sería una hamburguesa sola y la pantalla dejaría de decir
            dónde está quien la mira. */}
        {etiquetaActiva !== null && <span className="portal-nav-donde">{etiquetaActiva}</span>}
      </div>

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
          const esActiva = esActivaDe(p.vista)
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
      </nav>

      {/* 🚨 Sin JavaScript el ☰ no abre nada, así que la navegación vuelve a ser
          el carril horizontal que era hasta el 19/09/2026: se ve peor con siete
          pestañas, pero se ve. Un cajón que no se puede abrir es una pantalla
          sin salida. */}
      <noscript>
        <style>{`
          @media (max-width: 1023px) {
            .portal-nav-barra, .portal-nav-cabecera { display: none; }
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
          }
        `}</style>
      </noscript>
    </>
  )
}

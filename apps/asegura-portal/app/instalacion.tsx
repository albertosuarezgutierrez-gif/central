'use client'
import { useEffect, useState } from 'react'

/**
 * Lo que la instalación de la app tiene de COMPARTIDO entre la franja «Tenlo a
 * mano» (retirada el 08/09/2026) y la entrada «Instalar» de la campana
 * (`Campana.tsx`).
 *
 * ── Por qué un almacén de módulo y no un hook con su propio `useEffect` ──────
 * Chrome dispara `beforeinstallprompt` UNA vez por carga, y el evento solo se
 * puede `prompt()`-ear UNA vez. Con dos componentes escuchando cada uno por su
 * cuenta pasan dos cosas malas y las dos son mudas: el que se monta después
 * del disparo no se entera nunca (no hay botón, no hay error), y si los dos lo
 * guardan, el segundo `prompt()` rechaza con un `InvalidStateError` que nadie
 * pinta. Aquí el evento vive UNA vez, quien lo consume lo anula para todos, y
 * los suscriptores se repintan.
 *
 * 🚨 LOS DOS MUNDOS NO SE PARECEN, y dar por hecho que sí es el fallo caro:
 *  · **Chrome/Edge/Android** disparan `beforeinstallprompt`. Se intercepta, se
 *    guarda, y el botón lo lanza cuando el usuario quiera.
 *  · **iPhone y iPad** NO. Safari no implementa ese evento y no lo va a hacer:
 *    ahí la instalación es Compartir → «Añadir a pantalla de inicio», a mano.
 *    Si esto solo escuchara el evento, **la mitad de los clientes no vería
 *    nada** y nadie se enteraría — no falla, simplemente no aparece. Por eso
 *    en iOS el estado es `ios` y quien pinta enseña las instrucciones.
 *
 * Y nunca se ofrece a quien ya la tiene (`display-mode: standalone`, o
 * `navigator.standalone` en iOS).
 */

interface EventoInstalacion extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * `indeterminado` = todavía no se ha mirado (servidor, o antes del primer
 * efecto). `no_ofrecida` = el navegador no ha ofrecido instalar (aún, o nunca:
 * Firefox de escritorio, o ya instalada en otro perfil). Son estados distintos
 * a propósito: el primero es «no lo sé» y el segundo «no hay».
 */
export type EstadoInstalacion = 'indeterminado' | 'instalada' | 'ios' | 'instalable' | 'no_ofrecida'

function esIOS(): boolean {
  const ua = navigator.userAgent
  // iPadOS se anuncia como Macintosh desde iOS 13; lo delata el táctil.
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

function yaInstalada(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

let evento: EventoInstalacion | null = null
let estado: EstadoInstalacion = 'indeterminado'
let escuchando = false
const oyentes = new Set<() => void>()

function avisar() {
  for (const o of oyentes) o()
}

function arrancar() {
  if (escuchando) return
  escuchando = true
  if (yaInstalada()) {
    estado = 'instalada'
    return
  }
  if (esIOS()) {
    estado = 'ios'
    return
  }
  estado = 'no_ofrecida'
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    // Sin esto, Chrome enseña SU banner cuando le parece. Interceptarlo es lo
    // que permite ofrecerlo aquí, con las palabras de la correduría.
    e.preventDefault()
    evento = e as EventoInstalacion
    estado = 'instalable'
    avisar()
  })
  window.addEventListener('appinstalled', () => {
    evento = null
    estado = 'instalada'
    avisar()
  })
}

/** Lanza el diálogo del navegador. El evento se consume UNA vez, salga como salga. */
export async function instalar(): Promise<void> {
  const e = evento
  if (!e) return
  evento = null
  estado = 'no_ofrecida'
  avisar()
  try {
    await e.prompt()
    await e.userChoice
  } catch {
    // Un evento ya usado rechaza. Ya está anulado arriba: no hay nada que pintar.
  }
}

/**
 * Se decide en el cliente y después de montar: en el servidor no hay navegador
 * que preguntar, y pintarlo en el HTML haría que parpadeara para quien ya tiene
 * la app. Por eso durante la hidratación devuelve `indeterminado` en los dos
 * lados y solo cambia en el efecto.
 */
export function useInstalacion(): EstadoInstalacion {
  const [vista, setVista] = useState<EstadoInstalacion>('indeterminado')
  useEffect(() => {
    arrancar()
    const o = () => setVista(estado)
    oyentes.add(o)
    o()
    return () => {
      oyentes.delete(o)
    }
  }, [])
  return vista
}

/**
 * El glifo de «Compartir» de iOS, dibujado.
 *
 * 🚨 No es decoración: en iPhone el aviso no puede hacer nada, solo EXPLICAR un
 * gesto, y «toca Compartir» a secas no le dice nada a quien no sabe cómo se
 * llama ese botón. Esta pantalla la abre gente de 50-70 años; enseñarles el
 * dibujo que van a buscar es la diferencia entre que lo encuentren o no.
 *
 * Va en línea y no como imagen: es un icono de 14 px que tiene que seguir el
 * color del texto y estar cuando el texto está, sin una petición de por medio.
 */
export function IconoCompartir() {
  return (
    <svg
      className="instalar-app-glifo"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {/* La flecha hacia arriba saliendo de la caja: eso es lo que se reconoce. */}
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  )
}

/** Las instrucciones de iPhone/iPad, las mismas palabras en la franja y en la campana. */
export function InstruccionesIOS() {
  return (
    <>
      Añade «Mis seguros» a la pantalla de inicio: toca <IconoCompartir /> <strong>Compartir</strong> en
      la barra de tu navegador y elige <strong>«Añadir a pantalla de inicio»</strong>.
    </>
  )
}

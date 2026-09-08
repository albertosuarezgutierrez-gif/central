'use client'
import { useEffect, useId, useRef, useState } from 'react'

/**
 * El botón de instalar el portal como app, en la barra de marca.
 *
 * ── Por qué existe (07/09/2026, idea de Alberto) ────────────────────────────
 * El asegurado llega aquí desde un enlace del correo. Cuando quiera mirar su
 * póliza dentro de tres meses, tendrá que rebuscar ese correo. Instalado, es un
 * icono en su pantalla de inicio y entra directo (la sesión dura 30 días).
 *
 * ── Por qué es un BOTÓN de la cabecera y no un aviso (08/09/2026) ───────────
 * Fue un banner encima de las pólizas. Alberto: «yo subiría el instalador
 * arriba al lado de salir, queda más limpio». Un botón junto a «Salir» está en
 * todas las pantallas, no tapa nada y no pide descartarlo: quien no quiera
 * instalar sencillamente no lo pulsa. Por eso ya no hay «Ahora no» ni
 * `localStorage` que lo recuerde.
 *
 * 🚨 LOS DOS MUNDOS NO SE PARECEN, y dar por hecho que sí es el fallo caro:
 *  · **Chrome/Edge/Android** disparan `beforeinstallprompt`. Se intercepta, se
 *    guarda, y el botón lo lanza cuando el usuario quiera. Instalación de un
 *    clic. Hasta que el evento llega el botón NO se pinta: sin evento no hay
 *    nada que lanzar.
 *  · **iPhone y iPad** NO. Safari no implementa ese evento y no lo va a hacer:
 *    ahí la instalación es Compartir → «Añadir a pantalla de inicio», a mano.
 *    Si esto solo escuchara el evento, **la mitad de los clientes no vería
 *    nada** y nadie se enteraría — no falla, simplemente no aparece. Por eso en
 *    iOS el botón abre un globo con las instrucciones en vez de instalar.
 *
 * Desaparece solo cuando la app YA está instalada (`display-mode: standalone`,
 * o `navigator.standalone` en iOS) y, en Chrome, en cuanto llega `appinstalled`.
 * ⚠️ En iPhone eso solo se sabe cuando la abren DESDE el icono: si vuelven a
 * entrar por Safari después de instalarla, el botón sigue ahí — Safari no da
 * forma de preguntarlo.
 */

/**
 * El glifo de «Compartir» de iOS, dibujado.
 *
 * 🚨 No es decoración: en iPhone el globo no puede hacer nada, solo EXPLICAR un
 * gesto, y «toca Compartir» a secas no le dice nada a quien no sabe cómo se
 * llama ese botón. Esta pantalla la abre gente de 50-70 años; enseñarles el
 * dibujo que van a buscar es la diferencia entre que lo encuentren o no.
 *
 * Va en línea y no como imagen: es un icono de 14 px que tiene que seguir el
 * color del texto y estar cuando el texto está, sin una petición de por medio.
 */
function IconoCompartir() {
  return (
    <svg
      className="instalar-glifo"
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

/** El icono del botón: una flecha entrando en un dispositivo. Trazo con
 * `currentColor`, como los del interruptor de tema, para seguir al tema. En
 * pantallas estrechas es lo único que queda del botón (ver `globals.css`). */
function IconoInstalar() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 3v11" />
      <path d="M8 10l4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}

interface EventoInstalacion extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

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

type Modo = 'oculto' | 'chrome' | 'ios'

export function InstalarApp() {
  const [modo, setModo] = useState<Modo>('oculto')
  const [evento, setEvento] = useState<EventoInstalacion | null>(null)
  const [ayudaAbierta, setAyudaAbierta] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const idAyuda = useId()

  useEffect(() => {
    // Se decide en el cliente y después de montar: en el servidor no hay
    // navegador que preguntar, y pintarlo en el HTML haría que parpadeara para
    // quien ya tiene la app.
    if (yaInstalada()) return

    if (esIOS()) {
      setModo('ios')
      return
    }

    const alPoder = (e: Event) => {
      // Sin esto, Chrome enseña SU banner cuando le parece. Interceptarlo es lo
      // que permite ofrecerlo aquí, con las palabras de la correduría.
      e.preventDefault()
      setEvento(e as EventoInstalacion)
      setModo('chrome')
    }
    const alInstalar = () => setModo('oculto')

    window.addEventListener('beforeinstallprompt', alPoder)
    window.addEventListener('appinstalled', alInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', alPoder)
      window.removeEventListener('appinstalled', alInstalar)
    }
  }, [])

  // El globo de iOS se cierra al pulsar fuera o con Escape, como cualquier
  // desplegable: si solo se cerrara con «Entendido», quien pulse en otra parte
  // de la pantalla lo vería quedarse encima del contenido.
  useEffect(() => {
    if (!ayudaAbierta) return
    const fuera = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAyudaAbierta(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAyudaAbierta(false)
    }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [ayudaAbierta])

  if (modo === 'oculto') return null

  const instalar = async () => {
    if (!evento) return
    await evento.prompt()
    await evento.userChoice
    // El navegador solo deja usar el evento UNA vez, salga como salga: sin
    // evento el botón ya no puede hacer nada, así que se retira.
    setEvento(null)
    setModo('oculto')
  }

  if (modo === 'chrome') {
    return (
      <button
        type="button"
        className="instalar-boton"
        onClick={instalar}
        title="Instala «Mis seguros» en tu dispositivo y entra sin buscar el correo"
        aria-label="Instalar la aplicación"
      >
        <IconoInstalar />
        <span className="instalar-boton-texto">Instalar</span>
      </button>
    )
  }

  return (
    <div className="instalar-app" ref={raiz}>
      <button
        type="button"
        className="instalar-boton"
        onClick={() => setAyudaAbierta((v) => !v)}
        aria-expanded={ayudaAbierta}
        aria-controls={idAyuda}
        aria-label="Cómo instalar la aplicación"
        title="Añade «Mis seguros» a tu pantalla de inicio"
      >
        <IconoInstalar />
        <span className="instalar-boton-texto">Instalar</span>
      </button>
      {ayudaAbierta && (
        <div id={idAyuda} className="instalar-ayuda" role="dialog" aria-label="Cómo instalar en iPhone">
          <strong>Tenlo a mano</strong>
          <p>
            Añade «Mis seguros» a la pantalla de inicio: toca{' '}
            <IconoCompartir /> <strong>Compartir</strong> en la barra de tu
            navegador y elige <strong>«Añadir a pantalla de inicio»</strong>.
          </p>
          <button type="button" className="instalar-ayuda-cerrar" onClick={() => setAyudaAbierta(false)}>
            Entendido
          </button>
        </div>
      )}
    </div>
  )
}

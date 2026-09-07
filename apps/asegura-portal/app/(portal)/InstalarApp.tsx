'use client'
import { useEffect, useState } from 'react'

/**
 * La oferta de instalar el portal como app.
 *
 * ── Por qué existe (07/09/2026, idea de Alberto) ────────────────────────────
 * El asegurado llega aquí desde un enlace del correo. Cuando quiera mirar su
 * póliza dentro de tres meses, tendrá que rebuscar ese correo. Instalado, es un
 * icono en su pantalla de inicio y entra directo (la sesión dura 30 días).
 *
 * 🚨 LOS DOS MUNDOS NO SE PARECEN, y dar por hecho que sí es el fallo caro:
 *  · **Chrome/Edge/Android** disparan `beforeinstallprompt`. Se intercepta, se
 *    guarda, y el botón lo lanza cuando el usuario quiera. Instalación de un
 *    clic.
 *  · **iPhone y iPad** NO. Safari no implementa ese evento y no lo va a hacer:
 *    ahí la instalación es Compartir → «Añadir a pantalla de inicio», a mano.
 *    Si esto solo escuchara el evento, **la mitad de los clientes no vería
 *    nada** y nadie se enteraría — no falla, simplemente no aparece. Por eso en
 *    iOS se enseñan las instrucciones en vez del botón.
 *
 * Y no se enseña nunca a quien ya la tiene instalada (`display-mode:
 * standalone`, o `navigator.standalone` en iOS) ni a quien lo descartó.
 */

const DESCARTADO = 'asegura-portal:instalar-descartado'

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

export function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalacion | null>(null)
  const [ayudaIOS, setAyudaIOS] = useState(false)
  const [oculto, setOculto] = useState(true)

  useEffect(() => {
    // Se decide en el cliente y después de montar: en el servidor no hay
    // navegador que preguntar, y pintarlo en el HTML haría que parpadeara para
    // quien ya tiene la app.
    let descartado = false
    try {
      descartado = localStorage.getItem(DESCARTADO) === '1'
    } catch {
      // Modo privado o cookies bloqueadas: se ofrece igual, no se rompe nada.
    }
    if (descartado || yaInstalada()) return

    if (esIOS()) {
      setAyudaIOS(true)
      setOculto(false)
      return
    }

    const alPoder = (e: Event) => {
      // Sin esto, Chrome enseña SU banner cuando le parece. Interceptarlo es lo
      // que permite ofrecerlo aquí, con las palabras de la correduría.
      e.preventDefault()
      setEvento(e as EventoInstalacion)
      setOculto(false)
    }
    const alInstalar = () => setOculto(true)

    window.addEventListener('beforeinstallprompt', alPoder)
    window.addEventListener('appinstalled', alInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', alPoder)
      window.removeEventListener('appinstalled', alInstalar)
    }
  }, [])

  if (oculto) return null

  const descartar = () => {
    setOculto(true)
    try {
      localStorage.setItem(DESCARTADO, '1')
    } catch {
      // Que no se pueda recordar el descarte no es motivo para dejar el aviso.
    }
  }

  const instalar = async () => {
    if (!evento) return
    await evento.prompt()
    await evento.userChoice
    // El navegador solo deja usar el evento UNA vez, salga como salga.
    setEvento(null)
    setOculto(true)
  }

  return (
    <aside className="instalar-app" aria-label="Instalar la aplicación">
      <div className="instalar-app-texto">
        <strong>Tenlo a mano</strong>
        <p>
          {ayudaIOS
            ? 'Puedes añadir «Mis seguros» a la pantalla de inicio: toca Compartir y luego «Añadir a pantalla de inicio».'
            : 'Instala «Mis seguros» en tu dispositivo y entra sin buscar el correo.'}
        </p>
      </div>
      <div className="instalar-app-acciones">
        {!ayudaIOS && (
          <button type="button" className="instalar-app-si" onClick={instalar}>
            Instalar
          </button>
        )}
        <button type="button" className="instalar-app-no" onClick={descartar}>
          {ayudaIOS ? 'Entendido' : 'Ahora no'}
        </button>
      </div>
    </aside>
  )
}

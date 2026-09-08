'use client'
import { useEffect, useId, useRef, useState } from 'react'

import { instalar, InstruccionesIOS, useInstalacion } from './instalacion'

/**
 * El botón «Instalar» de la barra de marca.
 *
 * ── Por qué está AQUÍ y no en el contenido (08/09/2026) ─────────────────────
 * La primera versión fue una franja «Tenlo a mano» encima de las pólizas, y la
 * segunda añadió una entrada dentro de la campana. Alberto, viendo las dos en
 * producción: «esto no va aquí… el instalador moverlo en el banner fijo de
 * arriba». La barra es fija, se ve en todas las pantallas y no compite con el
 * contenido; y un solo sitio para instalar es uno menos que se descoordina.
 *
 * Qué se puede instalar y cómo lo decide `app/instalacion.tsx`:
 *  · `instalable` (Chrome/Edge/Android): el botón lanza el diálogo del navegador.
 *  · `ios` (iPhone/iPad): NO hay diálogo que lanzar, así que el botón abre un
 *    globo con el gesto —Compartir → «Añadir a pantalla de inicio», con el
 *    glifo dibujado— que se cierra con «Entendido», pulsando fuera o Escape.
 *  · en cualquier otro estado (ya instalada, navegador que no ofrece instalar,
 *    antes de saberlo) NO se pinta: un botón que no puede hacer nada es peor
 *    que ninguno.
 *
 * Sin «Ahora no» ni `localStorage`: quien no quiere instalar no lo pulsa, y el
 * botón sigue ahí el día que quiera. Desaparece solo al instalar.
 *
 * Por debajo de 480 px el texto se esconde y queda el icono (44×44, con
 * `aria-label`): a 320 px «Instalar» + «Salir» + campana + tema no caben en una
 * fila con la marca, y la barra se saldría de la pantalla sin que ninguna
 * medida de alto lo delatara.
 */
export function InstalarBoton() {
  const estado = useInstalacion()
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const idGlobo = useId()

  // Cerrar al pulsar fuera o con Escape: un globo que solo se cierra con su
  // propio botón se queda tapando la póliza.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  if (estado !== 'instalable' && estado !== 'ios') return null
  const ios = estado === 'ios'

  return (
    <div className="instalar" ref={raiz}>
      <button
        type="button"
        className="instalar-boton"
        // El nombre accesible completo: por debajo de 480 px el texto visible
        // desaparece y el lector de pantalla solo tiene esto.
        aria-label="Instalar «Mis seguros» en este dispositivo"
        title="Instalar la app"
        aria-expanded={ios ? abierto : undefined}
        aria-controls={ios ? idGlobo : undefined}
        onClick={() => {
          if (ios) setAbierto((a) => !a)
          else void instalar()
        }}
      >
        <IconoInstalar />
        <span className="instalar-texto">Instalar</span>
      </button>
      {ios && abierto && (
        <div className="instalar-globo" id={idGlobo} role="dialog" aria-label="Cómo instalar en iPhone o iPad">
          <strong>Tenlo a mano</strong>
          <p>
            <InstruccionesIOS />
          </p>
          <button type="button" className="instalar-globo-cerrar" onClick={() => setAbierto(false)}>
            Entendido
          </button>
        </div>
      )}
    </div>
  )
}

// En línea, no de una librería: es un icono, y el portal lo abre gente desde el
// móvil con datos. Trazo con `currentColor` para que siga al tema. La flecha
// hacia abajo entrando en la bandeja: «bajar a este dispositivo».
function IconoInstalar() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="M8 11l4 4 4-4" />
      <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}

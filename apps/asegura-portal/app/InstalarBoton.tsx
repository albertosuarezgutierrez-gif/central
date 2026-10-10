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
 * El globo se abre solo UNA vez por visita y «Ahora no»/«Entendido»/Escape recuerdan el descarte en
 * `localStorage` (sin él, modo privado, se ofrece en cada visita); pulsar fuera lo cierra sin recordarlo. El
 * botón de la barra sigue ahí siempre: en iOS abre/cierra el globo; en Android/escritorio lanza la
 * instalación (con el globo abierto también: no es un botón muerto). Desaparece solo al instalar.
 *
 * Por debajo de 480 px el texto se esconde y queda el icono (44×44, con
 * `aria-label`): a 320 px «Instalar» + «Salir» + campana + tema no caben en una
 * fila con la marca, y la barra se saldría de la pantalla sin que ninguna
 * medida de alto lo delatara.
 */
const CLAVE_DESCARTADO = 'instalar-descartado'

export function InstalarBoton() {
  const estado = useInstalacion()
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const idGlobo = useId()
  const visto = useRef(false)

  // Al entrar, UNA vez: el globo se abre solo (iOS no tiene aviso automático y
  // nadie busca un botón que no sabe que existe). Descartarlo se recuerda; sin
  // `localStorage` (modo privado) simplemente se ofrece en cada visita.
  useEffect(() => {
    if (visto.current || (estado !== 'instalable' && estado !== 'ios')) return
    visto.current = true
    try {
      if (localStorage.getItem(CLAVE_DESCARTADO) === '1') return
    } catch {}
    setAbierto(true)
  }, [estado])

  const cerrar = () => {
    setAbierto(false)
    try {
      localStorage.setItem(CLAVE_DESCARTADO, '1')
    } catch {}
  }

  const cerrarSinPersistir = () => {
    setAbierto(false)
  }

  // Cerrar al pulsar fuera o con Escape: un globo que solo se cierra con su
  // propio botón se queda tapando la póliza.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) cerrarSinPersistir()
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar()
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
        aria-expanded={abierto}
        aria-controls={idGlobo}
        onClick={() => {
          if (ios) {
            if (abierto) cerrar()
            else setAbierto(true)
          } else {
            // Con el globo abierto también instala (antes no hacía nada): el globo se cierra sin
            // persistir el descarte, porque quien pulsa «Instalar» no lo está descartando.
            cerrarSinPersistir()
            void instalar()
          }
        }}
      >
        <IconoInstalar />
        <span className="instalar-texto">Instalar</span>
      </button>
      {abierto && (
        <div className="instalar-globo" id={idGlobo} role="dialog" aria-label={ios ? 'Cómo instalar en iPhone o iPad' : 'Instalar la app'}>
          <strong>Tenlo a mano</strong>
          <div className="instalar-globo-cuerpo">
            {ios ? (
              <>
                <p>Añade «Mis seguros» a la pantalla de inicio:</p>
                <InstruccionesIOS />
              </>
            ) : (
              <>
                <p>Instala «Mis seguros» y ábrela desde un icono, sin buscar el correo.</p>
                <button type="button" className="instalar-copiar" onClick={() => { cerrar(); void instalar(); }}>
                  Instalar ahora
                </button>
              </>
            )}
          </div>
          <button type="button" className="instalar-globo-cerrar" onClick={cerrar}>
            {ios ? 'Entendido' : 'Ahora no'}
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

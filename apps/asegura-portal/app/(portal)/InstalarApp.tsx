'use client'
import { useEffect, useState } from 'react'

import { instalar, InstruccionesIOS, useInstalacion } from '../instalacion'

/**
 * La oferta de instalar el portal como app.
 *
 * ── Por qué existe (07/09/2026, idea de Alberto) ────────────────────────────
 * El asegurado llega aquí desde un enlace del correo. Cuando quiera mirar su
 * póliza dentro de tres meses, tendrá que rebuscar ese correo. Instalado, es un
 * icono en su pantalla de inicio y entra directo (la sesión dura 30 días).
 *
 * Qué se puede instalar y cómo (Chrome con su evento, iPhone con sus
 * instrucciones, ya instalada) lo decide `app/instalacion.tsx`, que es el MISMO
 * almacén que usa la entrada «Instalar» de la campana. Esta franja solo añade
 * el descarte: se enseña UNA vez, y quien la cierra la sigue teniendo a mano en
 * la campana — que es donde va a buscarla el día que quiera instalarla.
 */

const DESCARTADO = 'asegura-portal:instalar-descartado'

export function InstalarApp() {
  const estado = useInstalacion()
  const [descartado, setDescartado] = useState(true)

  useEffect(() => {
    // Se decide en el cliente y después de montar: en el servidor no hay
    // `localStorage`, y pintarla en el HTML haría que parpadeara para quien ya
    // la descartó.
    let d = false
    try {
      d = localStorage.getItem(DESCARTADO) === '1'
    } catch {
      // Modo privado o cookies bloqueadas: se ofrece igual, no se rompe nada.
    }
    setDescartado(d)
  }, [])

  if (descartado) return null
  if (estado !== 'ios' && estado !== 'instalable') return null
  const ayudaIOS = estado === 'ios'

  const descartar = () => {
    setDescartado(true)
    try {
      localStorage.setItem(DESCARTADO, '1')
    } catch {
      // Que no se pueda recordar el descarte no es motivo para dejar el aviso.
    }
  }

  return (
    <aside className="instalar-app" aria-label="Instalar la aplicación">
      <div className="instalar-app-texto">
        <strong>Tenlo a mano</strong>
        {ayudaIOS ? (
          <p>
            <InstruccionesIOS />
          </p>
        ) : (
          <p>Instala «Mis seguros» en tu dispositivo y entra sin buscar el correo.</p>
        )}
      </div>
      <div className="instalar-app-acciones">
        {!ayudaIOS && (
          <button type="button" className="instalar-app-si" onClick={() => void instalar()}>
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

'use client'
import { useEffect, useState } from 'react'
import Aviso from '@/components/ui/Aviso'
import Boton from '@/components/ui/Boton'

const CLAVE = 'rrhh_aviso_seguros_visto'

/**
 * Aviso pequeño, SOLO la primera vez: «Mis seguros» ya no es una tarjeta del cuerpo, está en la cabecera («Seguros»).
 * El recuerdo vive en localStorage (conveniencia por dispositivo): si no está disponible, se muestra y se cierra igual.
 */
export default function AvisoSeguros() {
  const [ver, setVer] = useState(false)
  useEffect(() => { try { if (!localStorage.getItem(CLAVE)) setVer(true) } catch { setVer(true) } }, [])
  if (!ver) return null
  function cerrar() { try { localStorage.setItem(CLAVE, '1') } catch { /* sin almacenamiento: solo se cierra */ } setVer(false) }
  return (
    <Aviso tono="info" titulo="Novedad: «Seguros» está arriba" className="my-3">
      <p className="mt-1 text-ink-2">
        Con el botón «Seguros» de la cabecera puedes guardar tus pólizas (coche, hogar…) gratis con Grupo ASegura. Es voluntario y tu empresa no ve nada.
      </p>
      <Boton variante="secundario" onClick={cerrar} className="mt-2">Entendido</Boton>
    </Aviso>
  )
}

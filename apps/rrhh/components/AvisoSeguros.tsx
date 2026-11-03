'use client'
import { useEffect, useState } from 'react'

const CLAVE = 'rrhh_aviso_seguros_visto'

/**
 * Banner de UNA línea, SOLO la primera vez: «Mis seguros» ya no es una tarjeta del cuerpo, está en la cabecera («Seguros»).
 * El recuerdo vive en localStorage (conveniencia por dispositivo): si no está disponible, se muestra y se cierra igual.
 */
export default function AvisoSeguros() {
  const [ver, setVer] = useState(false)
  useEffect(() => { try { if (!localStorage.getItem(CLAVE)) setVer(true) } catch { setVer(true) } }, [])
  if (!ver) return null
  function cerrar() { try { localStorage.setItem(CLAVE, '1') } catch { /* sin almacenamiento: solo se cierra */ } setVer(false) }
  return (
    <div role="status" className="my-2 flex items-center gap-2 rounded-[12px] border border-accent/30 bg-accent-soft py-1 pl-3 pr-1 text-sm text-ink">
      <p className="min-w-0 flex-1 truncate"><strong className="font-bold">Seguros</strong> está arriba: tus pólizas, gratis y en privado.</p>
      <button type="button" onClick={cerrar} aria-label="Cerrar aviso de seguros"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-transparent p-0 text-lg leading-none text-ink-2 hover:bg-card hover:text-ink">×</button>
    </div>
  )
}

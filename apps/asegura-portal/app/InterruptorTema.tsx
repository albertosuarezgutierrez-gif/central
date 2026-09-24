'use client'

import { useEffect, useState } from 'react'

import { aplicarTema, temaEnPantalla, type Tema } from './tema'

/**
 * Interruptor claro/oscuro de la barra de marca.
 *
 * 🚨 No se pinta hasta que el componente monta. Motivo: el servidor no sabe qué
 * tema tiene esta persona —lo decide el script del `<head>` leyendo su
 * `localStorage`—, así que cualquier cosa que se renderice en el servidor sería
 * una suposición, y React la marcaría como desajuste de hidratación. Se reserva
 * el hueco con `aria-hidden` para que la cabecera no dé un salto al aparecer.
 */
export function InterruptorTema() {
  const [tema, setTema] = useState<Tema | null>(null)

  useEffect(() => {
    setTema(temaEnPantalla())
  }, [])

  if (tema === null) {
    return <span className="tema-boton tema-boton-hueco" aria-hidden="true" />
  }

  const siguiente: Tema = tema === 'oscuro' ? 'claro' : 'oscuro'

  return (
    <button
      type="button"
      className="tema-boton"
      // El nombre accesible dice lo que VA A PASAR al pulsar, no el estado
      // actual: «Tema oscuro» a secas deja a quien usa lector de pantalla sin
      // saber si le informa o le ofrece.
      aria-label={siguiente === 'oscuro' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
      title={siguiente === 'oscuro' ? 'Tema oscuro' : 'Tema claro'}
      onClick={() => {
        aplicarTema(siguiente)
        setTema(siguiente)
      }}
    >
      {tema === 'oscuro' ? <IconoSol /> : <IconoLuna />}
    </button>
  )
}

// Iconos en línea, no una librería: son dos, y el portal lo abre gente desde el
// móvil con datos. Trazo con `currentColor` para que sigan al tema.
function IconoSol() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function IconoLuna() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

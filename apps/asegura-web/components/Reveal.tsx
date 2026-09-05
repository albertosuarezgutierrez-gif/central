'use client'
// Aparición de sección al entrar en pantalla.
//
// Copia el gesto de su landing: sube 28 px, entra de opacidad **y se
// desenfoca de 8 px a 0**. El desenfoque es la parte que se suele olvidar y es
// justo la que hace que se lea «editorial» en vez de «página que carga a
// trompicones».
//
// Con IntersectionObserver y no con `animation-timeline: view()` porque esa
// propiedad todavía no existe en Safari, que es medio tráfico de una web local.
// Y si el observer no existiera, el contenido se queda VISIBLE: un fallo aquí
// no puede dejar la página en blanco.
import { useEffect, useRef, useState, type ReactNode } from 'react'

export default function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) {
            setVisible(true)
            obs.disconnect()
          }
        }
      },
      // Su margen: la sección empieza a aparecer 70 px antes de entrar.
      { rootMargin: '-70px 0px', threshold: 0 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={[className, 'reveal', visible ? 'visible' : ''].filter(Boolean).join(' ')}
      style={delay ? { transitionDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  )
}

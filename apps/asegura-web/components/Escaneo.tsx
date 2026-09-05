'use client'
// Ilustración animada de «sube tu póliza y la leemos».
//
// La landing de la correduría usa aquí una animación Lottie
// (`illustrations/document-scan.json`). Esto hace lo mismo con CSS y un SVG:
// una hoja, una línea de barrido que la recorre, y los campos que se van
// rellenando detrás. Sin Lottie ni su reproductor — son ~60 KB de JS para una
// ilustración que se puede dibujar.
//
// 🚨 Lo que cuenta la animación TIENE que ser lo que el portal hace de verdad
// (`apps/asegura-portal/lib/extraer-poliza.ts`): lee el documento y deja la
// ficha rellena para que la persona la revise. El campo `confirmadaPorUsuario`
// nace en `false` y la procedencia es `declarado` — o sea, la IA propone y el
// cliente confirma. Una animación que enseñe la póliza guardándose sola estaría
// prometiendo algo que el código no hace.
import { useEffect, useRef, useState } from 'react'

const CAMPOS = ['Compañía', 'Nº de póliza', 'Vencimiento', 'Coberturas'] as const

export default function Escaneo() {
  const ref = useRef<HTMLDivElement>(null)
  const [activo, setActivo] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setActivo(true)
      return
    }
    const obs = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          // Igual que en `Reveal`: llegar de un salto no puede dejar la
          // ilustración congelada a medias.
          if (e.isIntersecting || e.boundingClientRect.top < 0) {
            setActivo(true)
            obs.disconnect()
          }
        }
      },
      { rootMargin: '-70px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div ref={ref} className={activo ? 'escaneo activo' : 'escaneo'} aria-hidden>
      {/* `claro`: la hoja es un PAPEL. La sección donde vive es oscura, y una
          hoja oscura sobre fondo oscuro deja de leerse como documento — que es
          justo lo único que esta ilustración tiene que comunicar. */}
      <div className="escaneo-hoja claro">
        <div className="escaneo-cabecera">
          <span className="escaneo-logo" />
          <span className="escaneo-titulo" />
        </div>
        {CAMPOS.map((c, i) => (
          <div key={c} className="escaneo-campo" style={{ transitionDelay: `${600 + i * 260}ms` }}>
            <span className="escaneo-etiqueta">{c}</span>
            <span className="escaneo-valor" />
          </div>
        ))}
        <span className="escaneo-linea" />
      </div>
    </div>
  )
}

'use client'
// Banda oscura con cifras.
//
// Copia dos gestos de su landing: el titular que aparece PALABRA A PALABRA, y
// un foco radial que sigue al puntero sobre el fondo casi negro. Los números
// cuentan desde cero cuando la banda entra en pantalla.
//
// Las cifras son MEDIDAS, no de relleno: el número de compañías sale de las
// pólizas vivas de la cartera (Mapfre, Allianz, Occident y Reale, medido el
// 05/09/2026), y los ramos, de `lib/ramos.ts`. Una cifra inventada en una
// banda que grita es la forma más cara de mentir.
import { useEffect, useRef, useState, type ReactNode } from 'react'

export type Cifra = { valor: number; sufijo?: string; texto: string; estatico?: string }

function Contador({ hasta, sufijo, activo }: { hasta: number; sufijo?: string; activo: boolean }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!activo) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(hasta)
      return
    }
    const inicio = performance.now()
    const DUR = 1300
    let raf = 0
    const paso = (t: number) => {
      const p = Math.min(1, (t - inicio) / DUR)
      // easeOutCubic, como el suyo.
      setN(Math.round(hasta * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [activo, hasta])
  return (
    <>
      {n}
      {sufijo}
    </>
  )
}

export default function Cifras({ titular, cifras }: { titular: ReactNode; cifras: readonly Cifra[] }) {
  const ref = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)
  const [foco, setFoco] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const obs = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          // Ver la nota de `Reveal.tsx`: llegar de un salto deja la banda por
          // encima del viewport sin haber intersectado, y los contadores se
          // quedarían clavados en cero — que aquí además se lee como un dato.
          if (e.isIntersecting || e.boundingClientRect.top < 0) {
            setVisible(true)
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
    <section
      ref={ref}
      className={visible ? 'seccion banda-oscura visible' : 'seccion banda-oscura'}
      aria-labelledby="dispersos-t"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setFoco({ x: e.clientX - r.left, y: e.clientY - r.top })
      }}
      onMouseLeave={() => setFoco(null)}
    >
      <div className="banda-oscura-mancha a" aria-hidden />
      <div className="banda-oscura-mancha b" aria-hidden />
      {/* El foco que sigue al puntero. Su radio y su opacidad, literales. */}
      {foco && (
        <div
          className="foco"
          aria-hidden
          style={{
            background: `radial-gradient(540px circle at ${foco.x}px ${foco.y}px, color-mix(in oklab, var(--brand) 14%, transparent), transparent 70%)`,
          }}
        />
      )}
      <div className="wrap">
        <h2 className="display palabras" id="dispersos-t">
          {titular}
        </h2>
        <div className="cifras">
          {cifras.map((c) => (
            <div className="cifra" key={c.texto}>
              <strong>
                {c.estatico ?? <Contador hasta={c.valor} sufijo={c.sufijo} activo={visible} />}
              </strong>
              <span>{c.texto}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

'use client'
// Panel VIVO de la portada.
//
// Junta las dos referencias que Alberto señaló:
//
//  · De la landing de la correduría (`app.grupoasegura.com`): la ventana con
//    inclinación 3D que sigue al puntero y las cápsulas encendibles.
//  · De la landing de ia.rest (`apps/ia-rest/src/app/page.tsx`): lo que de
//    verdad la hace impactante — un GUION TEMPORIZADO que se ejecuta solo y
//    cuenta la propuesta de valor en unos segundos, sin que el visitante tenga
//    que tocar nada. Su terminal de voz usa 900 ms de espera, 38 ms por
//    carácter, 280 ms entre ítems y 3.400 ms de reposo; aquí se conservan esos
//    tiempos porque están bien elegidos.
//
// Y arregla lo que allí falta: aquel bucle es infinito e ininterrumpible, corre
// también con la pestaña de fondo y no mira `prefers-reduced-motion`. Este para
// al salir de pantalla, se cancela al primer clic del visitante (el guion es
// para enseñar, no para pelearse con quien ya está jugando) y con movimiento
// reducido pinta el estado final sin animar nada.
//
// 🚨 Lo que enseña NO es un dato: es un EJEMPLO, y lo dice en la propia
// ventana. Un panel de portada con pólizas, compañías y vencimientos de
// aspecto real es justo lo que alguien puede leer como su situación.
import { useCallback, useEffect, useRef, useState } from 'react'

/** Filas de ejemplo. Las compañías son las que de verdad hay en cartera. */
const FILAS = [
  { slug: 'hogar', ramo: 'Hogar', compania: 'Mapfre', vence: '12 mar', prima: 312 },
  { slug: 'auto', ramo: 'Auto', compania: 'Allianz', vence: '04 jun', prima: 468 },
  { slug: 'vida-y-salud', ramo: 'Salud', compania: 'Occident', vence: '28 sep', prima: 690 },
  { slug: 'comunidades', ramo: 'Comunidad', compania: 'Mapfre', vence: '15 ene', prima: 1140 },
  { slug: 'comercio', ramo: 'Comercio', compania: 'Reale', vence: '02 nov', prima: 540 },
] as const

/** Las tres que entran solas en el guion. Las otras dos las enciende quien mire. */
const GUION = ['hogar', 'auto', 'vida-y-salud'] as const

const eur = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`

const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export default function PanelDemo() {
  const [on, setOn] = useState<string[]>([])
  const [fase, setFase] = useState<'reuniendo' | 'listo'>('reuniendo')
  const [inclina, setInclina] = useState({ x: 0, y: 0 })
  const caja = useRef<HTMLDivElement>(null)
  const cancelado = useRef(false)
  const tocado = useRef(false)
  const reduce = useRef(false)

  /** El primer clic manda: el guion se calla y no vuelve. */
  const tomarElMando = useCallback(() => {
    tocado.current = true
    cancelado.current = true
    setFase('listo')
  }, [])

  useEffect(() => {
    reduce.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce.current) {
      setOn([...GUION])
      setFase('listo')
      return
    }

    const el = caja.current
    let corriendo = false

    async function guion() {
      if (corriendo) return
      corriendo = true
      while (!cancelado.current) {
        setOn([])
        setFase('reuniendo')
        await espera(900)
        if (cancelado.current) break
        for (const slug of GUION) {
          setOn((prev) => [...prev, slug])
          await espera(280)
          if (cancelado.current) break
        }
        if (cancelado.current) break
        await espera(250)
        setFase('listo')
        await espera(3400)
      }
      corriendo = false
      // Si se canceló a media pasada, que no se quede el panel vacío.
      if (tocado.current) return
      setOn([...GUION])
      setFase('listo')
    }

    // Solo corre mientras se ve. El bucle de ia.rest gira también con la
    // pestaña de fondo; eso es batería del visitante a cambio de nada.
    if (typeof IntersectionObserver === 'undefined' || !el) {
      void guion()
    } else {
      const obs = new IntersectionObserver(
        (es) => {
          for (const e of es) {
            if (tocado.current) return
            if (e.isIntersecting) {
              cancelado.current = false
              void guion()
            } else {
              cancelado.current = true
            }
          }
        },
        { threshold: 0.25 },
      )
      obs.observe(el)
      return () => {
        cancelado.current = true
        obs.disconnect()
      }
    }
    return () => {
      cancelado.current = true
    }
  }, [])

  function mover(e: React.MouseEvent<HTMLDivElement>) {
    if (reduce.current || !caja.current) return
    const r = caja.current.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    // 4 grados, como el suyo: más parece un truco, menos no se nota.
    setInclina({ x: -py * 4, y: px * 4 })
  }

  const activas = FILAS.filter((f) => on.includes(f.slug))
  const total = activas.reduce((s, f) => s + f.prima, 0)

  return (
    <div>
      <div className="chips" role="group" aria-label="Enciende los seguros que tengas">
        {FILAS.map((f) => {
          const encendida = on.includes(f.slug)
          return (
            <button
              key={f.slug}
              type="button"
              className={encendida ? 'chip-sel on' : 'chip-sel'}
              aria-pressed={encendida}
              onClick={() => {
                tomarElMando()
                setOn((prev) => (encendida ? prev.filter((s) => s !== f.slug) : [...prev, f.slug]))
              }}
            >
              {f.ramo}
            </button>
          )
        })}
      </div>

      <div className="mock-marco">
        {/* Distintivo «En vivo», con el punto que late — el de ia.rest, con su
            onda de `box-shadow` de 1,8 s. */}
        <span className="mock-vivo">
          <span className="mock-latido" />
          {fase === 'reuniendo' ? 'Reuniendo pólizas…' : 'En vivo'}
        </span>
        <div
          ref={caja}
          className="mock"
          onMouseMove={mover}
          onMouseLeave={() => setInclina({ x: 0, y: 0 })}
          style={{ transform: `perspective(900px) rotateX(${inclina.x}deg) rotateY(${inclina.y}deg)` }}
        >
          <div className="mock-barra">
            <span className="mock-punto" style={{ background: 'var(--danger)' }} />
            <span className="mock-punto" style={{ background: 'var(--warn)' }} />
            <span className="mock-punto" style={{ background: 'var(--ok)' }} />
            <span className="mock-url">Área de clientes · Mis seguros</span>
            {/* 🚨 No se quita: lo de dentro es inventado. */}
            <span className="mock-ejemplo">Ejemplo</span>
          </div>

          <div className="mock-cuerpo">
            <div className="mock-tiles">
              <div className="mock-tile">
                <span>Pólizas</span>
                <strong>{activas.length}</strong>
              </div>
              <div className="mock-tile">
                <span>Al año</span>
                <strong>{eur(total)}</strong>
              </div>
              <div className="mock-tile">
                <span>Próximo</span>
                <strong>{activas[0]?.vence ?? '—'}</strong>
              </div>
            </div>

            {activas.length === 0 ? (
              <p className="mock-vacio">Enciende arriba los seguros que tengas.</p>
            ) : (
              <ul className="mock-lista">
                {activas.map((f) => (
                  <li key={f.slug}>
                    <span className="mock-ramo">{f.ramo}</span>
                    <span className="mock-cia">{f.compania}</span>
                    <span className="mock-vence">vence {f.vence}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className={fase === 'listo' && activas.length > 0 ? 'mock-pie visible' : 'mock-pie'}>
              <span className="mock-ok">● Todo en tu área de clientes</span>
              <span className="mock-coste">0,00€ de coste</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

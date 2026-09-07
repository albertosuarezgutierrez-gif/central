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
// aspecto real es justo lo que alguien puede leer como su situación. Por eso la
// barra de la ventana ya NO dice «En vivo» junto a la insignia «Ejemplo»: las
// dos etiquetas convivían a dos centímetros y la que late gana.
//
// ⚠️ Y las filas y la cuenta viven en `lib/panel-demo.ts`, no aquí, porque aquí
// no se pueden comprobar. La baldosa «Próximo» enseñaba `activas[0]` —la
// primera fila del array— y con las filas en el orden en que están escritas eso
// llegaba a decir «12 mar» teniendo «15 ene» encendida.
import { useCallback, useEffect, useRef, useState } from 'react'

import { FILAS, GUION, etiquetaVence, eur, proximaEnVencer } from '@/lib/panel-demo'

const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export default function PanelDemo() {
  const [on, setOn] = useState<string[]>([])
  const [fase, setFase] = useState<'reuniendo' | 'listo'>('reuniendo')
  const [hoy, setHoy] = useState<Date | null>(null)
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
    setHoy(new Date())
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
  // 🚨 `hoy` se resuelve DESPUÉS de montar y no durante el render: el servidor y
  // el navegador darían dos fechas distintas y React avisaría de desajuste de
  // hidratación. Hasta que llega, la baldosa dice «—», que es lo que
  // corresponde a un dato que aún no se tiene.
  const proxima = hoy ? proximaEnVencer(activas, hoy) : null

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
        {/* El punto que late — el de ia.rest, con su onda de `box-shadow` de
            1,8 s. 🚨 El texto NO dice «En vivo»: lo de dentro son cinco pólizas
            inventadas y la insignia de la barra ya lo declara. Un distintivo que
            late diciendo «en vivo» pesa más que una etiqueta quieta. */}
        <span className="mock-vivo">
          <span className="mock-latido" />
          {fase === 'reuniendo' ? 'Reuniendo pólizas…' : 'Así se ve'}
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
                <strong>{proxima ? etiquetaVence(proxima) : '—'}</strong>
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
                    <span className="mock-vence">vence {etiquetaVence(f)}</span>
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

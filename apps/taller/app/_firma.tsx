'use client'
// Lienzo de firma táctil (mismo trazo que la firma de la recepción, app/recepcion/RecepcionCliente.tsx): se usa en la entrega.
import { useRef, useState } from 'react'

export function useFirma() {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const dibujando = useRef(false)
  const [firmado, setFirmado] = useState(false)

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height }
  }
  function trazo(e: React.PointerEvent<HTMLCanvasElement>, empieza: boolean) {
    const ctx = e.currentTarget.getContext('2d')!
    const p = punto(e)
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#111'
    if (empieza) { ctx.beginPath(); ctx.moveTo(p.x, p.y) } else { ctx.lineTo(p.x, p.y); ctx.stroke() }
  }
  const limpiar = () => {
    const c = lienzo.current
    if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setFirmado(false)
  }
  /** PNG de la firma, o null si no se ha firmado. */
  const aPng = async (): Promise<Blob | null> =>
    firmado && lienzo.current ? new Promise<Blob | null>((ok) => lienzo.current!.toBlob(ok, 'image/png')) : null

  const eventos = {
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => { e.currentTarget.setPointerCapture(e.pointerId); dibujando.current = true; trazo(e, true) },
    onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => { if (dibujando.current) { trazo(e, false); setFirmado(true) } },
    onPointerUp: () => { dibujando.current = false },
  }
  return { lienzo, firmado, limpiar, aPng, eventos }
}

export function FirmaLienzo({ f, etiqueta }: { f: ReturnType<typeof useFirma>; etiqueta: string }) {
  return (
    <>
      <canvas ref={f.lienzo} className="firma-lienzo" width={800} height={360} aria-label={etiqueta} {...f.eventos} />
      <button type="button" className="btn btn-sec" onClick={f.limpiar}>Borrar firma</button>
    </>
  )
}

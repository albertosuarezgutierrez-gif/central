'use client'
import { useRef, useState, useEffect } from 'react'

const C = { primary: 'var(--brand-primary)', ok: '#16a34a', okBg: '#f0fdf4', border: '#e2e8f0', muted: '#64748b', text: '#1e293b' }

interface Props {
  onFirmar: (svg: string, nombre: string) => void
  onCancelar: () => void
}

export default function FirmaPad({ onFirmar, onCancelar }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasLines, setHasLines] = useState(false)
  const [nombre, setNombre]   = useState('')
  const [saved, setSaved]     = useState(false)
  const lastPos = useRef<{x:number,y:number}|null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.strokeStyle = C.text
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function getPos(e: any, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const touch = e.touches?.[0] || e
    return { x: (touch.clientX - rect.left) * (canvas.width / rect.width), y: (touch.clientY - rect.top) * (canvas.height / rect.height) }
  }

  function start(e: any) {
    e.preventDefault()
    setDrawing(true)
    const canvas = canvasRef.current!
    lastPos.current = getPos(e, canvas)
  }

  function draw(e: any) {
    e.preventDefault()
    if (!drawing) return
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const pos = getPos(e, canvas)
    if (lastPos.current) {
      ctx.beginPath()
      ctx.moveTo(lastPos.current.x, lastPos.current.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      setHasLines(true)
    }
    lastPos.current = pos
  }

  function stop(e: any) { e.preventDefault(); setDrawing(false); lastPos.current = null }

  function limpiar() {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setHasLines(false)
  }

  function firmar() {
    if (!hasLines || !nombre.trim()) return
    const canvas = canvasRef.current!
    const imgData = canvas.toDataURL('image/png')
    setSaved(true)
    setTimeout(() => onFirmar(imgData, nombre.trim()), 300)
  }

  if (saved) return (
    <div style={{ textAlign: 'center', padding: '32px 24px' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
      <div style={{ fontWeight: 800, fontSize: 18, color: C.ok }}>Firmado correctamente</div>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{nombre}</div>
    </div>
  )

  return (
    <div style={{ padding: '20px' }}>
      <h3 style={{ fontWeight: 800, fontSize: 17, color: C.text, marginBottom: 16 }}>✍️ Firmar conformidad</h3>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 5 }}>
          Nombre del firmante
        </label>
        <input value={nombre} onChange={e => setNombre(e.target.value)}
          placeholder="Nombre completo"
          style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
      </div>

      <div style={{ marginBottom: 4 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 5 }}>
          Firma aquí
        </label>
        <canvas ref={canvasRef} width={400} height={160}
          onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseLeave={stop}
          onTouchStart={start} onTouchMove={draw} onTouchEnd={stop}
          style={{ width: '100%', height: 160, border: `2px solid ${C.border}`, borderRadius: 10, background: '#fafafa', cursor: 'crosshair', touchAction: 'none', display: 'block' }} />
      </div>

      {!hasLines && <p style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>Dibuja tu firma con el dedo o el ratón</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onCancelar} style={{ flex: 1, padding: 11, background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancelar
        </button>
        <button onClick={limpiar} style={{ padding: '11px 16px', background: '#f1f5f9', border: 'none', borderRadius: 10, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          🗑️
        </button>
        <button onClick={firmar} disabled={!hasLines || !nombre.trim()}
          style={{ flex: 2, padding: 11, background: C.ok, color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (hasLines && nombre.trim()) ? 1 : 0.4, fontFamily: 'inherit' }}>
          ✅ Firmar
        </button>
      </div>
    </div>
  )
}

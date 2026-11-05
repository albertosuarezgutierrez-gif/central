'use client'
import { useState } from 'react'
import { formatearCentimos, parsearImporte } from '@/lib/importes'

const MEDIOS = [['transferencia', 'Transferencia'], ['tarjeta', 'Tarjeta'], ['bizum', 'Bizum'], ['efectivo', 'Efectivo (caja)'], ['otro', 'Otro']] as const

/** Registrar el pago (total o parcial) de una factura recibida pendiente. */
export function Pagar({ documento, cuenta, pendiente }: { documento: string; cuenta: string; pendiente: number }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [abierto, setAbierto] = useState(false)
  const [importe, setImporte] = useState(formatearCentimos(pendiente).replace('€', ''))
  const [fecha, setFecha] = useState(hoy)
  const [medio, setMedio] = useState('transferencia')
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function pagar(ev: React.FormEvent) {
    ev.preventDefault()
    const c = parsearImporte(importe)
    if (c === null || c <= 0) { setMsg({ ok: false, texto: 'Importe no válido (usa 1.234,56)' }); return }
    setEnviando(true); setMsg(null)
    const r = await fetch('/api/pagos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documento, cuenta, importe: c, fecha, medio }) })
    const j = (await r.json().catch(() => ({}))) as { errores?: string[]; error?: string }
    setEnviando(false)
    if (!r.ok) { setMsg({ ok: false, texto: (j.errores ?? [j.error ?? 'No se pudo registrar']).join(' · ') }); return }
    setMsg({ ok: true, texto: 'Pago asentado.' })
    setTimeout(() => window.location.reload(), 700)
  }

  if (!abierto) return <button type="button" className="btn btn-sec" onClick={() => setAbierto(true)}>Registrar pago</button>
  return (
    <form className="pago-form" onSubmit={pagar} noValidate>
      <label className="campo">Importe (€)<input inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} /></label>
      <label className="campo">Fecha<input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} /></label>
      <label className="campo">Medio<select value={medio} onChange={(e) => setMedio(e.target.value)}>{MEDIOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
      <button type="submit" className="btn" disabled={enviando}>{enviando ? 'Guardando…' : 'Confirmar pago'}</button>
      <button type="button" className="btn btn-sec" onClick={() => setAbierto(false)}>Cancelar</button>
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.texto}</p>}
    </form>
  )
}

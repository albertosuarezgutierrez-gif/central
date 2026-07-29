'use client'
import { useEffect, useRef, useState } from 'react'
import { eur } from '@/lib/dinero'

// 🛒 Tickets de súper (bajo demanda). Sube la foto del ticket → POST /api/banca/ticket (OCR con IA) →
// muestra las líneas leídas y lo guarda para el comparador de precios (F5b). Panel plegado por defecto.
type Linea = { productoRaw: string; cantidad: number | null; precioUnit: number | null; precioTotal: number | null }
type Parsed = { super: string; superNorm: string; fecha: string | null; total: number | null; lineas: Linea[] }
type Ticket = { id: string; super: string; fecha: string | null; total: number | null; nLineas: number }

export default function TicketsSuper() {
  const [abierto, setAbierto] = useState(false)
  const [estado, setEstado] = useState<'idle' | 'subiendo' | 'listo'>('idle')
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [nota, setNota] = useState('')
  const [guardado, setGuardado] = useState(false)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  async function cargarTickets() {
    try {
      const r = await fetch('/api/banca/ticket')
      const d = await r.json().catch(() => ({})) as { tickets?: Ticket[] }
      setTickets(Array.isArray(d.tickets) ? d.tickets : [])
    } catch { /* silencio */ }
  }
  useEffect(() => { if (abierto) cargarTickets() }, [abierto])

  async function subir(file: File) {
    setEstado('subiendo'); setParsed(null); setNota(''); setGuardado(false)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/banca/ticket', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({})) as { ok?: boolean; guardado?: boolean; parsed?: Parsed; nota?: string; error?: string }
      if (d.parsed) setParsed(d.parsed)
      setGuardado(!!d.guardado)
      setNota(d.nota || d.error || '')
      if (d.guardado) cargarTickets()
    } catch {
      setNota('No se pudo procesar el ticket. Inténtalo de nuevo.')
    } finally {
      setEstado('listo')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <section style={{ marginBottom: '32px' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <strong style={{ fontSize: '15px' }}>🛒 Tickets de súper</strong>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Sube la foto del ticket y la IA lee las líneas (para el comparador de precios)</div>
          </div>
          <button onClick={() => setAbierto(o => !o)}
            style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer', background: abierto ? 'var(--surface)' : 'var(--primary)', color: abierto ? 'var(--text)' : '#fff', fontSize: '13px', fontWeight: 600 }}>
            {abierto ? 'Cerrar' : '🛒 Subir ticket'}
          </button>
        </div>

        {abierto && (
          <div style={{ marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            <input ref={fileRef} type="file" accept="image/*" capture="environment"
              onChange={e => { const f = e.target.files?.[0]; if (f) subir(f) }}
              disabled={estado === 'subiendo'}
              style={{ fontSize: '13px' }} />
            {estado === 'subiendo' && <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '10px' }}>Leyendo el ticket…</div>}

            {nota && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '10px' }}>{nota}</div>}

            {parsed && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '13px', marginBottom: '8px' }}>
                  <strong>{parsed.super}</strong>
                  {parsed.fecha ? ` · ${parsed.fecha}` : ''}
                  {parsed.total != null ? ` · total ${eur(parsed.total)}` : ''}
                  {guardado ? <span style={{ color: 'var(--positive)', marginLeft: '8px' }}>✅ guardado</span> : <span style={{ color: 'var(--muted)', marginLeft: '8px' }}>· no guardado</span>}
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                  {parsed.lineas.map((l, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 12px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', fontSize: '13px' }}>
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.productoRaw}</span>
                      {l.cantidad != null && <span style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0 }}>×{l.cantidad}</span>}
                      <span style={{ fontWeight: 600, flexShrink: 0, width: '76px', textAlign: 'right' }}>{l.precioTotal != null ? eur(l.precioTotal) : l.precioUnit != null ? eur(l.precioUnit) : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tickets.length > 0 && (
              <div style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600, marginBottom: '6px' }}>Últimos tickets</div>
                {tickets.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: '13px' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>{t.super}<span style={{ color: 'var(--muted)' }}>{t.fecha ? ` · ${t.fecha}` : ''} · {t.nLineas} líneas</span></span>
                    <span style={{ fontWeight: 600, flexShrink: 0 }}>{t.total != null ? eur(t.total) : '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

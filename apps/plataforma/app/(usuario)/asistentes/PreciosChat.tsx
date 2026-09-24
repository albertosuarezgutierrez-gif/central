'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Bot } from 'lucide-react'
import { PageHeader } from '@/components/ui'

const PISOS = [
  { id: '', label: 'Todos los pisos' },
  { id: 'prop_house_sevillana', label: 'House Sevillana' },
  { id: 'prop_busto_reform', label: 'Busto Reform' },
  { id: 'prop_duplex_center', label: 'Duplex Center' },
  { id: 'prop_luxury_busto', label: 'Luxury Busto' },
]

const SUGERENCIAS = [
  '¿Por qué pusiste esos precios la última vez?',
  'Sé más agresivo en Semana Santa',
  'No bajes Busto Reform de 120€',
  '¿Qué fechas calientes vienen?',
]

type Msg = { rol: 'tu' | 'agente'; texto: string; guardado?: { temporada: string; insight: string } | null }

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
}

/**
 * `cabecera` la pone /asistentes (la barra de pestañas). Se pinta DENTRO del <main> a
 * propósito: este chat calcula su alto con `calc(100vh - 8px)`, así que cualquier cosa
 * puesta por encima desde fuera lo desbordaría.
 */
export default function PreciosChat({ cabecera }: { cabecera?: React.ReactNode } = {}) {
  const [piso, setPiso] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs, loading])

  const enviar = useCallback(async (texto: string) => {
    const mensaje = texto.trim()
    if (!mensaje || loading) return
    setInput('')
    setMsgs(m => [...m, { rol: 'tu', texto: mensaje }])
    setLoading(true)
    try {
      const r = await fetch('/api/agente/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje, property_id: piso || undefined }),
      })
      const data = await r.json().catch(() => ({}))
      setMsgs(m => [...m, { rol: 'agente', texto: data?.respuesta || data?.error || 'Sin respuesta.', guardado: data?.guardado || null }])
    } catch {
      setMsgs(m => [...m, { rol: 'agente', texto: 'No se pudo conectar con el agente.' }])
    } finally {
      setLoading(false)
    }
  }, [piso, loading])

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '28px 20px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 8px)' }}>
      {cabecera}
      <PageHeader titulo="Agente de precios" icono={<Bot size={20} strokeWidth={1.75} />} />
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0, marginBottom: 14 }}>
        Pregúntale por qué puso un precio o dale instrucciones (“sé más agresivo en Semana Santa”). Las reglas
        se guardan y el agente las respeta en su próximo ciclo, siempre con los raíles (suelo de coste, tope diario, pausa).
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: 'var(--muted)' }}>Piso:</label>
        <select value={piso} onChange={e => setPiso(e.target.value)} style={{
          padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
        }}>
          {PISOS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>

      <div ref={scrollRef} style={{ ...card, flex: 1, overflowY: 'auto', padding: 16, marginBottom: 12 }}>
        {msgs.length === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>
            <p style={{ marginTop: 0 }}>Empieza con una de estas:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SUGERENCIAS.map(s => (
                <button key={s} onClick={() => enviar(s)} style={{
                  padding: '7px 12px', borderRadius: 16, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer',
                }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.rol === 'tu' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <div style={{
              maxWidth: '78%', padding: '10px 13px', borderRadius: 12, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
              background: m.rol === 'tu' ? 'var(--primary)' : 'var(--primary-light)',
              color: m.rol === 'tu' ? '#fff' : 'var(--text)',
            }}>
              {m.texto}
              {m.guardado && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--positive)', fontWeight: 600 }}>
                  ✓ Guardado como regla ({m.guardado.temporada}): “{m.guardado.insight}”
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <div style={{ color: 'var(--muted)', fontSize: 13 }}>El agente está pensando…</div>}
      </div>

      <form onSubmit={e => { e.preventDefault(); enviar(input) }} style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Escribe a tu agente de precios…"
          disabled={loading} style={{
            flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
          }} />
        <button type="submit" disabled={loading || !input.trim()} style={{
          padding: '11px 20px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 14,
          background: 'var(--primary)', color: '#fff', cursor: loading || !input.trim() ? 'default' : 'pointer',
          opacity: loading || !input.trim() ? 0.6 : 1,
        }}>Enviar</button>
      </form>
    </main>
  )
}

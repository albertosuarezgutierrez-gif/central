'use client'
import { C, SE, SN, SM, SC } from '@/lib/colors'
import { useState, useRef, useEffect, useCallback } from 'react'


interface Msg { role: 'user' | 'assistant'; content: string }

const SUGERENCIAS = [
  '¿Cuál fue mi producto más vendido?',
  '¿Cuántas comandas tuve este mes?',
  '¿Qué stock me falta pedir?',
  '¿Cómo están mis márgenes?',
]

function getHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return { 'Content-Type': 'application/json' }
  try {
    const session = localStorage.getItem('ia_rest_session') ?? ''
    return { 'Content-Type': 'application/json', 'x-ia-session': session }
  } catch { return { 'Content-Type': 'application/json' } }
}

export default function OwnerCopiloto() {
  const [abierto, setAbierto] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])
  useEffect(() => { if (abierto) setTimeout(() => inputRef.current?.focus(), 100) }, [abierto])

  const enviar = useCallback(async (texto?: string) => {
    const pregunta = texto ?? input
    if (!pregunta.trim() || loading) return
    setInput('')
    const nuevos: Msg[] = [...msgs, { role: 'user', content: pregunta }]
    setMsgs(nuevos)
    setLoading(true)
    try {
      const res = await fetch('/api/owner/copiloto', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ pregunta, historial: msgs }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setMsgs(prev => [...prev, { role: 'assistant', content: err.error ?? `Error ${res.status}.` }])
        return
      }
      const data = await res.json()
      setMsgs(prev => [...prev, { role: 'assistant', content: data.respuesta ?? 'Sin respuesta.' }])
    } catch {
      setMsgs(prev => [...prev, { role: 'assistant', content: 'Error de conexión.' }])
    } finally { setLoading(false) }
  }, [input, loading, msgs])

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setAbierto(v => !v)}
        title="Copiloto IA"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
          width: 50, height: 50, borderRadius: '50%', border: 'none',
          background: C.red, color: C.paper, fontSize: 20,
          cursor: 'pointer', boxShadow: '0 4px 16px rgba(217,68,43,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform .15s', transform: abierto ? 'rotate(45deg)' : 'none',
        }}
      >
        {abierto ? '×' : '🧠'}
      </button>

      {/* Panel */}
      {abierto && (
        <div style={{
          position: 'fixed', bottom: 86, right: 24, zIndex: 999,
          width: 320, height: 460, background: C.dark,
          border: `1px solid ${C.rule}`, borderRadius: 14,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          {/* Header */}
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.rule}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>🧠</span>
            <div>
              <div style={{ fontFamily: SN, color: C.paper, fontSize: 13, fontWeight: 600 }}>Copiloto</div>
              <div style={{ fontFamily: SN, color: C.dkFg3, fontSize: 10 }}>Datos últimos 30 días</div>
            </div>
          </div>

          {/* Mensajes */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, scrollbarWidth: 'none' }}>
            {msgs.length === 0 && (
              <div>
                <p style={{ fontFamily: SN, fontSize: 12, color: C.dkFg3, marginBottom: 10 }}>Pregúntame sobre tu negocio</p>
                {SUGERENCIAS.map(s => (
                  <button key={s} onClick={() => enviar(s)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      background: C.dark1, border: `1px solid ${C.rule}`,
                      borderRadius: 8, padding: '7px 10px', marginBottom: 5,
                      fontFamily: SN, color: '#C9BFAA', fontSize: 12, cursor: 'pointer',
                    }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                <div style={{
                  maxWidth: '86%', padding: '8px 11px', borderRadius: 10,
                  background: m.role === 'user' ? C.red : C.dark1,
                  border: m.role === 'assistant' ? `1px solid ${C.rule}` : 'none',
                  fontFamily: SN, color: C.paper, fontSize: 13, lineHeight: 1.5,
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ fontFamily: SN, color: C.dkFg3, fontSize: 12, padding: '4px 0' }}>pensando…</div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.rule}`, display: 'flex', gap: 6 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
              placeholder="Pregunta algo…"
              style={{
                flex: 1, background: C.dark1, border: `1px solid ${C.rule}`,
                borderRadius: 8, padding: '8px 10px',
                fontFamily: SN, color: C.paper, fontSize: 13, outline: 'none',
              }}
            />
            <button
              onClick={() => enviar()} disabled={loading || !input.trim()}
              style={{
                background: C.red, border: 'none', borderRadius: 8,
                padding: '8px 12px', color: C.paper, cursor: 'pointer',
                fontSize: 15, opacity: (loading || !input.trim()) ? 0.4 : 1,
              }}
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  )
}

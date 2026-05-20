'use client'
import { useState, useRef, useEffect } from 'react'

const K = {
  bg:    '#14110E',
  bg2:   '#1E1A16',
  bg3:   '#2A2420',
  fg:    '#F6F1E7',
  fg2:   '#D8CDB6',
  fg3:   '#8A7D6E',
  red:   '#D9442B',
  redD:  '#A8311E',
  amb:   '#E8A33B',
  gr:    '#3F7D44',
  rule:  '#3A332C',
}

type Mensaje = {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

type EstadoEnvio = 'idle' | 'loading' | 'error'

interface Props {
  open: boolean
  onClose: () => void
  sessionToken?: string
}

export default function AsistenteCocinaPanel({ open, onClose, sessionToken }: Props) {
  const [mensajes, setMensajes]     = useState<Mensaje[]>([])
  const [input, setInput]           = useState('')
  const [estado, setEstado]         = useState<EstadoEnvio>('idle')
  const [errorMsg, setErrorMsg]     = useState<string | null>(null)
  const [stats, setStats]           = useState<{ comandas: number; items: number } | null>(null)
  const bottomRef                   = useRef<HTMLDivElement>(null)
  const inputRef                    = useRef<HTMLTextAreaElement>(null)

  // Scroll al final cuando llegan mensajes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  // Focus al abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      // Mensaje de bienvenida si está vacío
      if (mensajes.length === 0) {
        setMensajes([{
          role: 'assistant',
          content: '¡Listo! Pregúntame lo que quieras sobre las comandas activas. Por ejemplo: "¿Cuántos solomillos hay pendientes?", "¿La mesa 4 tiene alérgicos?", "¿Qué lleva más tiempo en cocina?"',
          timestamp: new Date().toISOString(),
        }])
      }
    }
  }, [open])

  async function enviar() {
    const texto = input.trim()
    if (!texto || estado === 'loading') return

    const nuevaPregunta: Mensaje = {
      role: 'user',
      content: texto,
      timestamp: new Date().toISOString(),
    }

    setMensajes(prev => [...prev, nuevaPregunta])
    setInput('')
    setEstado('loading')
    setErrorMsg(null)

    try {
      const historial = mensajes.filter(m => m.role !== 'assistant' || mensajes.indexOf(m) > 0)

      const res = await fetch('/api/kds/asistente', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          pregunta: texto,
          historial: historial.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error ?? 'Error al consultar')
        setEstado('error')
        return
      }

      setStats({ comandas: data.comandas_activas, items: data.items_activos })
      setMensajes(prev => [...prev, {
        role: 'assistant',
        content: data.respuesta,
        timestamp: data.timestamp ?? new Date().toISOString(),
      }])
      setEstado('idle')

    } catch {
      setErrorMsg('Sin conexión. Revisa la red.')
      setEstado('error')
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  if (!open) return null

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          zIndex: 1000, backdropFilter: 'blur(2px)',
        }}
      />

      {/* Panel lateral */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(420px, 100vw)',
        background: K.bg,
        borderLeft: `1px solid ${K.rule}`,
        zIndex: 1001,
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${K.rule}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: K.bg3,
              border: `1px solid ${K.rule}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
            }}>
              🍳
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: K.fg }}>
                Asistente cocina
              </div>
              {stats && (
                <div style={{ fontSize: 11, color: K.fg3, marginTop: 1 }}>
                  {stats.comandas} comandas · {stats.items} ítems activos
                </div>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: K.fg3, fontSize: 20, padding: '4px 8px',
              borderRadius: 6,
            }}
          >
            ✕
          </button>
        </div>

        {/* Mensajes */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '16px 20px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {mensajes.map((m, i) => (
            <div key={i} style={{
              display: 'flex',
              flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
              gap: 8, alignItems: 'flex-end',
            }}>
              {/* Avatar */}
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: m.role === 'user' ? K.red : K.bg3,
                border: `1px solid ${m.role === 'user' ? K.redD : K.rule}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12,
              }}>
                {m.role === 'user' ? '👨‍🍳' : '🤖'}
              </div>

              {/* Burbuja */}
              <div style={{
                maxWidth: '78%',
                background: m.role === 'user' ? K.red : K.bg2,
                border: `1px solid ${m.role === 'user' ? K.redD : K.rule}`,
                borderRadius: m.role === 'user'
                  ? '12px 12px 2px 12px'
                  : '12px 12px 12px 2px',
                padding: '10px 14px',
              }}>
                <p style={{
                  margin: 0, fontSize: 13, lineHeight: 1.5,
                  color: m.role === 'user' ? '#fff' : K.fg,
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.content}
                </p>
                <div style={{
                  fontSize: 10, color: m.role === 'user' ? 'rgba(255,255,255,0.6)' : K.fg3,
                  marginTop: 4, textAlign: 'right',
                }}>
                  {new Date(m.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {/* Loader */}
          {estado === 'loading' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: K.bg3, border: `1px solid ${K.rule}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
              }}>🤖</div>
              <div style={{
                background: K.bg2, border: `1px solid ${K.rule}`,
                borderRadius: '12px 12px 12px 2px',
                padding: '12px 16px', display: 'flex', gap: 4, alignItems: 'center',
              }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: K.fg3,
                    animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {estado === 'error' && errorMsg && (
            <div style={{
              background: 'rgba(217,68,43,0.1)',
              border: `1px solid ${K.red}`,
              borderRadius: 8, padding: '8px 12px',
              fontSize: 12, color: K.red,
            }}>
              ⚠️ {errorMsg}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Sugerencias rápidas */}
        {mensajes.length <= 1 && (
          <div style={{
            padding: '0 20px 12px',
            display: 'flex', flexWrap: 'wrap', gap: 6, flexShrink: 0,
          }}>
            {[
              '¿Qué comandas llevan más tiempo?',
              '¿Cuántos solomillos pendientes?',
              '¿Hay alguna mesa con alérgicos?',
              '¿Qué plato sale más hoy?',
            ].map(sugerencia => (
              <button
                key={sugerencia}
                onClick={() => { setInput(sugerencia); inputRef.current?.focus() }}
                style={{
                  background: K.bg3,
                  border: `1px solid ${K.rule}`,
                  borderRadius: 20, padding: '5px 10px',
                  fontSize: 11, color: K.fg2, cursor: 'pointer',
                  transition: 'border-color .15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = K.fg3)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = K.rule)}
              >
                {sugerencia}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: '12px 20px 20px',
          borderTop: `1px solid ${K.rule}`,
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-end',
            background: K.bg2,
            border: `1px solid ${K.rule}`,
            borderRadius: 12, padding: '8px 12px',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Pregunta algo sobre las comandas..."
              rows={1}
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: K.fg, fontSize: 13, resize: 'none',
                fontFamily: 'inherit', lineHeight: 1.5,
                maxHeight: 80, overflowY: 'auto',
              }}
            />
            <button
              onClick={enviar}
              disabled={!input.trim() || estado === 'loading'}
              style={{
                background: input.trim() && estado !== 'loading' ? K.red : K.bg3,
                border: 'none', borderRadius: 8,
                width: 32, height: 32, cursor: input.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, flexShrink: 0,
                transition: 'background .15s',
                color: '#fff',
              }}
            >
              {estado === 'loading' ? '⏳' : '↑'}
            </button>
          </div>
          <div style={{ fontSize: 10, color: K.fg3, marginTop: 6, textAlign: 'center' }}>
            Enter para enviar · Shift+Enter para nueva línea
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </>
  )
}

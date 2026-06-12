'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { C, SN, SM } from '@/lib/colors'

interface Msg { role: 'user' | 'assistant'; content: string }

interface Props {
  titulo: string
  emoji: string
  sugerencias: string[]
  apiRoute: string
  sh: () => Record<string, string>
  restauranteId: string
}

export default function AgenteModuloChat({ titulo, emoji, sugerencias, apiRoute, sh, restauranteId }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])
  useEffect(() => { if (abierto) setTimeout(() => inputRef.current?.focus(), 100) }, [abierto])

  const enviar = useCallback(async (texto?: string) => {
    const pregunta = (texto ?? input).trim()
    if (!pregunta || loading) return
    setInput('')
    const nuevos: Msg[] = [...msgs, { role: 'user', content: pregunta }]
    setMsgs(nuevos)
    setLoading(true)
    try {
      const res = await fetch(apiRoute, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ pregunta, historial: msgs }),
      })
      const data = await res.json()
      setMsgs(prev => [...prev, { role: 'assistant', content: data.respuesta ?? data.error ?? 'Sin respuesta.' }])
    } catch {
      setMsgs(prev => [...prev, { role: 'assistant', content: 'Error de conexión.' }])
    } finally { setLoading(false) }
  }, [input, loading, msgs, apiRoute, sh])

  return (
    <>
      <button
        onClick={() => setAbierto(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 13px', borderRadius: 8,
          background: abierto ? C.red + '14' : C.paper,
          border: `1.5px solid ${abierto ? C.red : C.rule}`,
          color: abierto ? C.ink : C.ink3,
          fontFamily: SM, fontSize: 11, cursor: 'pointer',
          letterSpacing: '.06em',
          transition: 'all .15s',
        }}
      >
        <span>{emoji}</span>
        <span>ASISTENTE IA</span>
      </button>

      {abierto && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
          width: 340, height: 460,
          background: C.bg2, border: `1px solid ${C.rule}`,
          borderRadius: 12, display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,.45)',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${C.rule}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, boxShadow: `0 0 6px ${C.red}` }} />
              <span style={{ fontFamily: SM, fontSize: 11, letterSpacing: '.08em', color: C.ink2 }}>
                {titulo.toUpperCase()}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {msgs.length > 0 && (
                <button onClick={() => setMsgs([])} style={{
                  background: 'none', border: `1px solid ${C.rule}`,
                  borderRadius: 5, color: C.ink4, padding: '2px 7px',
                  fontSize: 10, fontFamily: SM, cursor: 'pointer',
                }}>LIMPIAR</button>
              )}
              <button onClick={() => setAbierto(false)} style={{
                background: 'none', border: 'none', color: C.ink4, cursor: 'pointer', fontSize: 17, lineHeight: 1,
              }}>×</button>
            </div>
          </div>

          {/* Mensajes */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {msgs.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, color: C.ink4, fontFamily: SM, letterSpacing: '.05em', marginBottom: 4 }}>
                  SUGERENCIAS
                </div>
                {sugerencias.map(s => (
                  <button key={s} onClick={() => enviar(s)} style={{
                    background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 7,
                    color: C.ink2, fontSize: 12, padding: '7px 10px', cursor: 'pointer',
                    textAlign: 'left', fontFamily: SN,
                  }}>{s}</button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '90%', padding: '8px 11px',
                  borderRadius: m.role === 'user' ? '9px 9px 2px 9px' : '9px 9px 9px 2px',
                  background: m.role === 'user' ? C.red + '16' : C.paper,
                  border: `1px solid ${m.role === 'user' ? C.red + '30' : C.rule}`,
                  color: C.ink, fontSize: 12, lineHeight: 1.6, fontFamily: SN,
                  whiteSpace: 'pre-wrap',
                }}>{m.content}</div>
              </div>
            ))}
            {loading && (
              <div style={{ fontSize: 12, color: C.ink3, fontFamily: SN }}>procesando...</div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '8px 10px', borderTop: `1px solid ${C.rule}`, display: 'flex', gap: 6 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') enviar() }}
              placeholder={`Pregunta sobre ${titulo.toLowerCase()}...`}
              style={{
                flex: 1, background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 7,
                color: C.ink, fontSize: 12, padding: '7px 9px', outline: 'none', fontFamily: SN,
              }}
            />
            <button onClick={() => enviar()} disabled={!input.trim() || loading} style={{
              background: !input.trim() || loading ? C.rule : C.red,
              border: 'none', borderRadius: 7, color: '#fff', width: 32,
              cursor: !input.trim() || loading ? 'default' : 'pointer', fontSize: 14,
            }}>↑</button>
          </div>
        </div>
      )}
    </>
  )
}

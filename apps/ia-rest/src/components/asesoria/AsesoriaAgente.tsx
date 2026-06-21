'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'

interface Msg { role: 'user' | 'assistant'; content: string }

interface Props {
  sh: () => Record<string, string>
}

export default function AsesoriaAgente({ sh }: Props) {
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
      const res = await fetch('/api/asesoria/agente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ messages: nuevos }),
      })
      const data = await res.json()
      setMsgs(prev => [...prev, { role: 'assistant', content: data.reply ?? data.error ?? 'Sin respuesta.' }])
    } catch {
      setMsgs(prev => [...prev, { role: 'assistant', content: 'Error de conexión.' }])
    } finally { setLoading(false) }
  }, [input, loading, msgs, sh])

  const SUGERENCIAS = [
    '¿Cuánto IVA hay que pagar este trimestre?',
    '¿Cómo exporto los datos a A3?',
    '¿Qué son los asientos PGC?',
    '¿Cómo añado un nuevo restaurante?',
  ]

  const T = {
    bg: '#14110E', bg2: '#1E1A15', ink: '#F6F1E7',
    ink2: '#D8CDB6', ink3: '#9C8E7E', ink4: '#6B5F52',
    red: '#D9442B', rule: '#2E2720', paper: '#2A221A',
  }

  if (!abierto) return (
    <button
      onClick={() => setAbierto(true)}
      title="Asistente contable IA"
      style={{
        width: 36, height: 36, borderRadius: '50%',
        background: T.red, border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, color: '#fff', flexShrink: 0,
        boxShadow: `0 0 0 2px ${T.rule}`,
      }}
    >🤖</button>
  )

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
      width: 320, height: 440,
      background: T.bg2, border: `1px solid ${T.rule}`,
      borderRadius: 12, display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 32px rgba(0,0,0,.5)',
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${T.rule}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.red, boxShadow: `0 0 6px ${T.red}` }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: T.ink2, fontFamily: 'var(--font-mono,monospace)' }}>ASISTENTE CONTABLE</span>
        </div>
        <button onClick={() => setAbierto(false)} style={{ background: 'none', border: 'none', color: T.ink4, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {msgs.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, color: T.ink3, marginBottom: 4 }}>Preguntas frecuentes:</div>
            {SUGERENCIAS.map(s => (
              <button key={s} onClick={() => enviar(s)} style={{
                background: T.paper, border: `1px solid ${T.rule}`, borderRadius: 7,
                color: T.ink2, fontSize: 12, padding: '7px 10px', cursor: 'pointer',
                textAlign: 'left', fontFamily: 'inherit',
              }}>{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '90%', padding: '8px 11px', borderRadius: 9,
              background: m.role === 'user' ? `${T.red}18` : T.paper,
              border: `1px solid ${m.role === 'user' ? T.red + '30' : T.rule}`,
              color: T.ink, fontSize: 12, lineHeight: 1.55,
            }}>{m.content}</div>
          </div>
        ))}
        {loading && (
          <div style={{ fontSize: 12, color: T.ink3, padding: '4px 0' }}>consultando...</div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: '8px 10px', borderTop: `1px solid ${T.rule}`, display: 'flex', gap: 6 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') enviar() }}
          placeholder="Pregunta sobre contabilidad..."
          style={{
            flex: 1, background: T.bg, border: `1px solid ${T.rule}`, borderRadius: 7,
            color: T.ink, fontSize: 12, padding: '7px 9px', outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <button onClick={() => enviar()} disabled={!input.trim() || loading} style={{
          background: !input.trim() || loading ? T.rule : T.red,
          border: 'none', borderRadius: 7, color: '#fff', width: 32,
          cursor: !input.trim() || loading ? 'default' : 'pointer', fontSize: 14,
        }}>↑</button>
      </div>
    </div>
  )
}

'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { C, SN } from '@/lib/colors'
import { getPromptForPath } from './help-prompts'

interface Msg { role: 'user' | 'assistant'; content: string }

interface HelpContext {
  turnoActivo?: boolean
  mesaSeleccionada?: string | null
  comandaAbierta?: boolean
  turnoFichado?: boolean
}

function HelpPanel({
  prompt,
  context,
  onClose,
}: {
  prompt: string
  context: HelpContext
  onClose: () => void
}) {
  const pathname = usePathname()
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'assistant', content: '¿En qué te puedo ayudar?' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [escalated, setEscalated] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      inputRef.current?.focus()
    }, 80)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  async function send(text?: string) {
    const t = text || input.trim()
    if (!t || loading) return
    setInput('')
    const next: Msg[] = [...msgs, { role: 'user', content: t }]
    setMsgs(next)
    setLoading(true)
    try {
      const res = await fetch('/api/help/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          systemPrompt: prompt,
          context: { ...context, pathname },
        }),
      })
      const data = await res.json()
      setMsgs(p => [...p, { role: 'assistant', content: data.reply || 'Sin respuesta.' }])
      if (data.escalated) setEscalated(true)
    } catch {
      setMsgs(p => [...p, { role: 'assistant', content: 'Error de conexión. Inténtalo de nuevo.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 8px)', right: 0,
      width: 320, height: 460,
      background: C.bg2, border: `1px solid ${C.rule}`,
      borderRadius: 14, display: 'flex', flexDirection: 'column',
      boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
      overflow: 'hidden', zIndex: 9999,
      animation: 'helpDrop 0.18s ease',
    }}>
      {/* Header */}
      <div style={{
        padding: '11px 14px', borderBottom: `1px solid ${C.rule}`,
        display: 'flex', alignItems: 'center', gap: 8,
        background: C.bg3, flexShrink: 0,
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%', background: C.green,
          animation: 'helpPulse 2s infinite',
        }} />
        <span style={{ color: C.ink2, fontSize: 13, fontWeight: 500, fontFamily: SN }}>
          Ayuda ia.rest
        </span>
        <button onClick={onClose} style={{
          marginLeft: 'auto', background: 'none', border: 'none',
          color: C.ink4, cursor: 'pointer', fontSize: 16, lineHeight: 1,
          padding: '2px 4px', fontFamily: SN,
        }}>✕</button>
      </div>

      {/* Banner escalado */}
      {escalated && (
        <div style={{
          padding: '8px 14px', background: '#1f1500',
          borderBottom: `1px solid ${C.amber}`,
          fontSize: 11.5, color: C.amber, fontFamily: SN, flexShrink: 0,
        }}>
          ⚡ He avisado al operador — te contactará pronto.
        </div>
      )}

      {/* Mensajes */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 4px' }}>
        {msgs.map((m, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            marginBottom: 7,
          }}>
            <div style={{
              maxWidth: '85%', padding: '8px 11px', borderRadius: 10,
              borderBottomRightRadius: m.role === 'user' ? 3 : 10,
              borderBottomLeftRadius: m.role === 'user' ? 10 : 3,
              background: m.role === 'user' ? C.red : C.bg3,
              color: C.paper, fontSize: 12.5, lineHeight: 1.55,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: SN,
            }}>{m.content}</div>
          </div>
        ))}
        {loading && (
          <div style={{
            display: 'flex', gap: 4, padding: '8px 11px',
            background: C.bg3, borderRadius: 10, width: 'fit-content', marginBottom: 7,
          }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 5, height: 5, borderRadius: '50%', background: C.ink3,
                animation: `helpBounce 1.2s infinite`,
                animationDelay: `${i * 0.2}s`,
              }} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '8px 10px 10px', borderTop: `1px solid ${C.rule}`, flexShrink: 0 }}>
        <div style={{
          display: 'flex', gap: 7, alignItems: 'flex-end',
          background: C.bg3, borderRadius: 9, padding: '7px 9px',
          border: `1px solid ${C.rule}`,
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Escribe tu duda..."
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: C.paper, fontSize: 12.5, resize: 'none',
              fontFamily: SN, lineHeight: 1.4, maxHeight: 64,
            }}
            onInput={(e: React.FormEvent<HTMLTextAreaElement>) => {
              const t = e.currentTarget
              t.style.height = 'auto'
              t.style.height = Math.min(t.scrollHeight, 64) + 'px'
            }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            style={{
              width: 26, height: 26, borderRadius: 6, background: C.red, border: 'none',
              color: C.paper, cursor: 'pointer', fontSize: 13, flexShrink: 0,
              opacity: (!input.trim() || loading) ? 0.35 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >↑</button>
        </div>
      </div>
    </div>
  )
}

export function HelpChat(context: HelpContext = {}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const { label, prompt } = getPromptForPath(pathname)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => { setOpen(false) }, [pathname])

  return (
    <>
      <style>{`
        @keyframes helpDrop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes helpBounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
        @keyframes helpPulse{0%,100%{opacity:1}50%{opacity:0.4}}
      `}</style>
      <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setOpen(o => !o)}
          title={`Ayuda ${label}`}
          style={{
            width: 30, height: 30, borderRadius: 8,
            background: open ? C.bg3 : 'transparent',
            border: `1px solid ${open ? C.red : C.rule}`,
            color: open ? C.paper : C.ink3,
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', transition: 'all 0.15s',
            fontSize: 14, fontWeight: 700, fontFamily: SN, flexShrink: 0,
          }}
        >?</button>
        {open && (
          <HelpPanel
            prompt={prompt}
            context={context}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    </>
  )
}

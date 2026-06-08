'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

interface ToolLog {
  tool: string
  input: any
  result: string
}

interface Propuesta {
  id: string
  tipo: string
  archivo: string
  problema: string
  cambio_propuesto: string
  impacto: 'alto' | 'medio' | 'bajo'
  tokens_ahorro?: string
  estado: 'pendiente' | 'aprobada' | 'rechazada'
}

// Parsea bloques ---PROPUESTA--- del texto del agente
function parsePropuestas(text: string): Propuesta[] {
  const regex = /---PROPUESTA---([\s\S]*?)---FIN---/g
  const result: Propuesta[] = []
  let match
  while ((match = regex.exec(text)) !== null) {
    const block = match[1]
    const get = (key: string) => {
      const m = block.match(new RegExp(`${key}:\\s*(.+)`))
      return m ? m[1].trim() : ''
    }
    result.push({
      id: Math.random().toString(36).slice(2),
      tipo: get('tipo'),
      archivo: get('archivo'),
      problema: get('problema'),
      cambio_propuesto: get('cambio_propuesto'),
      impacto: (get('impacto') as any) || 'medio',
      tokens_ahorro: get('tokens_ahorro') || undefined,
      estado: 'pendiente',
    })
  }
  return result
}

// Quita los bloques ---PROPUESTA--- del texto visible
function stripPropuestas(text: string): string {
  return text.replace(/---PROPUESTA---([\s\S]*?)---FIN---/g, '').trim()
}

function renderMd(text: string): string {
  text = text.replace(/\*\*(.+?)\*\*/g, `<strong style="color:${C.ink}">$1</strong>`)
  text = text.replace(/`([^`]+)`/g, `<code style="background:${C.paper3};color:${C.red};padding:1px 5px;border-radius:3px;font-size:11px;font-family:monospace">$1</code>`)
  text = text.replace(/^### (.+)$/gm, `<div style="font-weight:700;margin:10px 0 4px;font-size:13px;color:${C.ink2}">$1</div>`)
  text = text.replace(/^## (.+)$/gm, `<div style="font-weight:700;margin:12px 0 6px;font-size:14px;color:${C.ink}">$1</div>`)
  text = text.replace(/^[-•] (.+)$/gm, `<div style="display:flex;gap:6px;margin:2px 0"><span style="color:${C.red}">▸</span><span>$1</span></div>`)
  text = text.split('\n\n').map(p => {
    if (p.startsWith('<')) return p
    return `<p style="margin:5px 0;line-height:1.65">${p.replace(/\n/g, '<br/>')}</p>`
  }).join('')
  return text
}

const IMPACTO_COLOR: Record<string, string> = { alto: '#D9442B', medio: '#E8A33B', bajo: '#3F7D44' }
const TIPO_ICON: Record<string, string> = {
  optimizacion_tokens: '⚡',
  refactor: '🔧',
  doc_update: '📄',
  patron_codigo: '🏗️',
}

const QUICK_ACTIONS = [
  { label: '🔍 Analizar estructura', prompt: 'Analiza la estructura del proyecto: lista los directorios principales, lee los archivos clave (ai-client.ts, colors.ts, el SKILL de Drive) e identifica redundancias y problemas de optimización de tokens.' },
  { label: '⚡ Optimizar system prompts', prompt: 'Lee el archivo src/components/AgentesIATab.tsx y analiza los system prompts de los 6 agentes. Identifica repeticiones, contexto redundante y propón versiones condensadas estimando el ahorro de tokens.' },
  { label: '📄 Actualizar MASTER', prompt: 'Lee el documento MASTER de Drive y el archivo src/app/super/page.tsx. Identifica qué partes del MASTER están desactualizadas respecto al código real y propón las actualizaciones.' },
  { label: '🏗️ Patrones inconsistentes', prompt: 'Lista los directorios src/app/api y src/components, luego lee algunos archivos de API routes. Detecta patrones de auth, manejo de errores o queries Supabase que sean inconsistentes entre archivos.' },
]

interface Props { session: any; C: typeof import('@/lib/colors').C; SE: string; SN: string; SM: string }

export default function AgenteArquitectoTab({ session }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [propuestas, setPropuestas] = useState<Propuesta[]>([])
  const [toolLog, setToolLog] = useState<ToolLog[]>([])
  const [showTools, setShowTools] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, loading])

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    const newMsgs: Msg[] = [...msgs, { role: 'user', content: msg }]
    setMsgs(newMsgs)
    setLoading(true)

    try {
      const res = await fetch('/api/super/agente-arquitecto', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ia-session': JSON.stringify(session),
        },
        body: JSON.stringify({
          messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()

      if (data.toolLog) setToolLog(prev => [...prev, ...data.toolLog])

      const rawText = data.text || data.error || 'Sin respuesta.'
      const nuevasPropuestas = parsePropuestas(rawText)
      if (nuevasPropuestas.length > 0) {
        setPropuestas(prev => [...prev, ...nuevasPropuestas])
      }
      const textoLimpio = stripPropuestas(rawText)
      setMsgs(prev => [...prev, { role: 'assistant', content: textoLimpio }])
    } catch (err: any) {
      setMsgs(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [input, loading, msgs, session])

  async function aprobarPropuesta(p: Propuesta) {
    setPropuestas(prev => prev.map(x => x.id === p.id ? { ...x, estado: 'aprobada' } : x))
    await send(`Aprobado. Aplica esta propuesta: tipo=${p.tipo}, archivo=${p.archivo}. Cambio: ${p.cambio_propuesto}`)
  }

  function rechazarPropuesta(id: string) {
    setPropuestas(prev => prev.map(x => x.id === id ? { ...x, estado: 'rechazada' } : x))
  }

  const pendientes = propuestas.filter(p => p.estado === 'pendiente')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div>
        <div style={{ fontFamily: SM, fontSize: 11, color: C.red, letterSpacing: '.12em', marginBottom: 8 }}>
          AGENTE ARQUITECTO · ANÁLISIS Y OPTIMIZACIÓN
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: SE, fontSize: 32, fontWeight: 500, margin: '0 0 4px', color: C.ink }}>
              Agente Arquitecto
            </h1>
            <p style={{ fontFamily: SN, fontSize: 13, color: C.ink3, margin: 0 }}>
              Lee el repo + Drive en tiempo real. Analiza, propone y aplica cambios con tu aprobación.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {toolLog.length > 0 && (
              <button onClick={() => setShowTools(!showTools)} style={{
                background: 'none', border: `1px solid ${C.rule}`, borderRadius: 6,
                padding: '5px 10px', cursor: 'pointer', fontFamily: SM,
                fontSize: 10, color: C.ink4, letterSpacing: '.06em',
              }}>
                🔧 {toolLog.length} TOOLS {showTools ? '▲' : '▼'}
              </button>
            )}
            {(msgs.length > 0 || propuestas.length > 0) && (
              <button onClick={() => { setMsgs([]); setPropuestas([]); setToolLog([]) }} style={{
                background: 'none', border: `1px solid ${C.rule}`, borderRadius: 6,
                padding: '5px 10px', cursor: 'pointer', fontFamily: SM,
                fontSize: 10, color: C.ink4, letterSpacing: '.06em',
              }}>
                LIMPIAR
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tool log colapsable */}
      {showTools && toolLog.length > 0 && (
        <div style={{
          background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 8,
          padding: 14, display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.1em', marginBottom: 4 }}>
            LOG DE HERRAMIENTAS
          </div>
          {toolLog.map((t, i) => (
            <div key={i} style={{ fontFamily: SM, fontSize: 11, color: C.ink3, display: 'flex', gap: 10 }}>
              <span style={{ color: C.red, minWidth: 140 }}>{t.tool}</span>
              <span style={{ color: C.ink4 }}>{JSON.stringify(t.input).slice(0, 60)}</span>
              <span style={{ color: C.green }}>→ {t.result.slice(0, 60)}...</span>
            </div>
          ))}
        </div>
      )}

      {/* Acciones rápidas */}
      {msgs.length === 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {QUICK_ACTIONS.map((a, i) => (
            <button key={i} onClick={() => send(a.prompt)} style={{
              padding: '9px 14px', borderRadius: 8,
              border: `1px solid ${C.rule}`,
              background: C.bone, color: C.ink2,
              fontFamily: SN, fontSize: 12, cursor: 'pointer',
              transition: 'border-color .15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = C.red)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = C.rule)}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Propuestas pendientes */}
      {pendientes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: SM, fontSize: 11, color: C.amber, letterSpacing: '.1em' }}>
            ⚡ {pendientes.length} PROPUESTA{pendientes.length > 1 ? 'S' : ''} PENDIENTE{pendientes.length > 1 ? 'S' : ''} DE APROBACIÓN
          </div>
          {pendientes.map(p => (
            <div key={p.id} style={{
              background: C.bone, border: `1.5px solid ${IMPACTO_COLOR[p.impacto]}40`,
              borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 18 }}>{TIPO_ICON[p.tipo] || '📋'}</span>
                <span style={{ fontFamily: SM, fontSize: 10, color: IMPACTO_COLOR[p.impacto], letterSpacing: '.08em' }}>
                  {p.impacto.toUpperCase()}
                </span>
                <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>{p.tipo}</span>
                <span style={{ fontFamily: SN, fontSize: 12, color: C.ink2, fontWeight: 600 }}>{p.archivo}</span>
                {p.tokens_ahorro && (
                  <span style={{ fontFamily: SM, fontSize: 10, color: C.green, marginLeft: 'auto' }}>
                    ⚡ -{p.tokens_ahorro} tokens
                  </span>
                )}
              </div>
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>
                <strong style={{ color: C.ink2 }}>Problema:</strong> {p.problema}
              </div>
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>
                <strong style={{ color: C.ink2 }}>Cambio:</strong> {p.cambio_propuesto}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => aprobarPropuesta(p)} style={{
                  padding: '6px 16px', borderRadius: 6, border: 'none',
                  background: C.green, color: '#fff',
                  fontFamily: SM, fontSize: 11, cursor: 'pointer', letterSpacing: '.06em',
                }}>
                  ✓ APROBAR
                </button>
                <button onClick={() => rechazarPropuesta(p.id)} style={{
                  padding: '6px 16px', borderRadius: 6,
                  border: `1px solid ${C.rule}`, background: 'none',
                  color: C.ink4, fontFamily: SM, fontSize: 11, cursor: 'pointer', letterSpacing: '.06em',
                }}>
                  ✗ RECHAZAR
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chat */}
      <div style={{
        background: C.bone, border: `1px solid ${C.rule}`,
        borderRadius: 12, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        minHeight: 400,
      }}>
        {/* Header panel */}
        <div style={{
          padding: '10px 16px', borderBottom: `1px solid ${C.rule}`,
          background: C.paper, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 18 }}>🏗️</span>
          <span style={{ fontFamily: SM, fontSize: 11, color: C.ink3, letterSpacing: '.08em' }}>
            ARQUITECTO · GitHub + Drive + Análisis
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: loading ? C.amber : '#3F7D44',
              boxShadow: `0 0 5px ${loading ? C.amber : '#3F7D44'}`,
            }} />
            <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>
              {loading ? 'leyendo repo...' : 'listo'}
            </span>
          </div>
        </div>

        {/* Mensajes */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {msgs.length === 0 && !loading && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 10, opacity: 0.4, padding: '30px 0',
            }}>
              <div style={{ fontSize: 40 }}>🏗️</div>
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, textAlign: 'center' }}>
                Usa las acciones rápidas o escribe qué analizar
              </div>
            </div>
          )}

          {msgs.map((msg, i) => (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '92%',
                background: msg.role === 'user' ? C.red + '12' : C.paper,
                border: `1px solid ${msg.role === 'user' ? C.red + '30' : C.rule}`,
                borderRadius: msg.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                padding: '9px 13px', color: C.ink, fontSize: 13, fontFamily: SN,
              }}>
                {msg.role === 'user'
                  ? <span>{msg.content}</span>
                  : <div dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }} />
                }
              </div>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, marginTop: 2, padding: '0 4px' }}>
                {msg.role === 'user' ? 'tú' : 'arquitecto'}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: '50%', background: '#E8A33B',
                  animation: `agDot 1.2s ${i * 0.2}s ease-in-out infinite`,
                }} />
              ))}
              <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>
                leyendo repositorio y analizando...
              </span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: '10px 12px', borderTop: `1px solid ${C.rule}`,
          background: C.paper, display: 'flex', gap: 8,
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Ej: Analiza ai-client.ts y propón optimizaciones..."
            rows={2}
            style={{
              flex: 1, background: C.bone, border: `1px solid ${C.rule}`,
              borderRadius: 7, color: C.ink, fontSize: 12,
              padding: '7px 10px', fontFamily: SN, resize: 'none', outline: 'none',
            }}
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            style={{
              width: 38, height: 38, borderRadius: 7, border: 'none',
              background: loading || !input.trim() ? C.rule : C.red,
              color: loading || !input.trim() ? C.ink4 : '#fff',
              cursor: loading || !input.trim() ? 'default' : 'pointer',
              fontSize: 16, alignSelf: 'flex-end', transition: 'background .15s',
            }}
          >↑</button>
        </div>
      </div>

      <style>{`
        @keyframes agDot {
          0%, 100% { opacity: .3; transform: scale(.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        textarea:focus { border-color: ${C.red}60 !important; }
        textarea::placeholder { color: ${C.ink4}; }
      `}</style>
    </div>
  )
}

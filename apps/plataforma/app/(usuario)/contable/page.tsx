// apps/plataforma/app/(usuario)/contable/page.tsx
'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

const SUGERENCIAS = [
  '¿Cuánto llevo gastado en luz este año?',
  '¿Qué facturas de proveedor tengo pendientes?',
  '¿Cómo van mis gastos de pisos vs correduría?',
  'Clasifica el recibo de Endesa como pisos',
]

type Guardado = { clave: string; insight: string }
type Accion = { id: string; tipo: string; resumen: string; estado?: 'pendiente' | 'ejecutada' | 'descartada' | 'error'; mensaje?: string }
type Msg = { rol: 'tu' | 'agente'; texto: string; guardados?: Guardado[]; acciones?: Accion[] }

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
}

export default function ContablePage() {
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
      const r = await fetch('/api/contable/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje }),
      })
      const data = await r.json().catch(() => ({}))
      setMsgs(m => [...m, {
        rol: 'agente',
        texto: data?.respuesta || data?.error || 'Sin respuesta.',
        guardados: data?.guardados || [],
        acciones: (data?.acciones || []).map((a: any) => ({ ...a, estado: 'pendiente' as const })),
      }])
    } catch {
      setMsgs(m => [...m, { rol: 'agente', texto: 'No se pudo conectar con el agente.' }])
    } finally {
      setLoading(false)
    }
  }, [loading])

  const resolverAccion = useCallback(async (msgIdx: number, accId: string, op: 'ejecutar' | 'descartar') => {
    setMsgs(m => m.map((msg, i) => i !== msgIdx ? msg : {
      ...msg, acciones: msg.acciones?.map(a => a.id === accId ? { ...a, estado: op === 'descartar' ? 'descartada' : a.estado, mensaje: '…' } : a),
    }))
    try {
      const r = await fetch('/api/contable/accion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(op === 'descartar' ? { accionId: accId, op: 'descartar' } : { accionId: accId }),
      })
      const data = await r.json().catch(() => ({}))
      setMsgs(m => m.map((msg, i) => i !== msgIdx ? msg : {
        ...msg, acciones: msg.acciones?.map(a => a.id === accId ? { ...a, estado: data?.estado || 'error', mensaje: data?.mensaje } : a),
      }))
    } catch {
      setMsgs(m => m.map((msg, i) => i !== msgIdx ? msg : {
        ...msg, acciones: msg.acciones?.map(a => a.id === accId ? { ...a, estado: 'error', mensaje: 'Error de red' } : a),
      }))
    }
  }, [])

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '28px 20px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 8px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 24 }}>🧮</span>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Agente de contabilidad</h1>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0, marginBottom: 14 }}>
        Pregúntale por tus finanzas, dale criterios que recuerde, o pídele que clasifique un cargo
        (te propone la acción y la confirmas tú).
      </p>

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
              {m.guardados && m.guardados.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                  {m.guardados.map(g => <div key={g.clave}>✓ Recordado ({g.clave}): “{g.insight}”</div>)}
                </div>
              )}
              {m.acciones && m.acciones.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {m.acciones.map(a => (
                    <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '9px 11px', background: 'var(--surface)', color: 'var(--text)' }}>
                      <div style={{ fontSize: 13 }}>⚙️ {a.resumen}</div>
                      {a.estado === 'pendiente' ? (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button onClick={() => resolverAccion(i, a.id, 'ejecutar')} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Confirmar</button>
                          <button onClick={() => resolverAccion(i, a.id, 'descartar')} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>Descartar</button>
                        </div>
                      ) : (
                        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: a.estado === 'ejecutada' ? '#16a34a' : a.estado === 'descartada' ? 'var(--muted)' : '#dc2626' }}>
                          {a.estado === 'ejecutada' ? '✓ Hecho' : a.estado === 'descartada' ? 'Descartada' : `⚠️ ${a.mensaje || 'Error'}`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <div style={{ color: 'var(--muted)', fontSize: 13 }}>El agente está pensando…</div>}
      </div>

      <form onSubmit={e => { e.preventDefault(); enviar(input) }} style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Escribe a tu agente de contabilidad…"
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

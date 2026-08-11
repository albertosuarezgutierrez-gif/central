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
type Msg = { rol: 'tu' | 'agente'; texto: string; guardados?: Guardado[]; acciones?: Accion[]; feedback?: 'enviado' }

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
}

export default function ContablePage() {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs, loading])

  const pintarRespuesta = useCallback((data: any) => {
    setMsgs(m => [...m, {
      rol: 'agente',
      texto: data?.respuesta || data?.error || 'Sin respuesta.',
      guardados: data?.guardados || [],
      acciones: (data?.acciones || []).map((a: any) => ({ ...a, estado: 'pendiente' as const })),
    }])
  }, [])

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
      pintarRespuesta(data)
    } catch {
      setMsgs(m => [...m, { rol: 'agente', texto: 'No se pudo conectar con el agente.' }])
    } finally {
      setLoading(false)
    }
  }, [loading, pintarRespuesta])

  const subirDocumento = useCallback(async (file: File) => {
    if (!file || loading) return
    if (file.size > 8_000_000) {
      setMsgs(m => [...m, { rol: 'agente', texto: 'El archivo pesa más de 8 MB. Súbelo más ligero.' }])
      return
    }
    // Leer como base64 (data URL → quitamos el prefijo "data:...;base64,").
    const base64: string = await new Promise<string>((resolve, reject) => {
      const rd = new FileReader()
      rd.onload = () => resolve(String(rd.result || '').split(',')[1] || '')
      rd.onerror = () => reject(new Error('read'))
      rd.readAsDataURL(file)
    }).catch(() => '')
    if (!base64) { setMsgs(m => [...m, { rol: 'agente', texto: 'No pude leer el archivo.' }]); return }

    setMsgs(m => [...m, { rol: 'tu', texto: `📎 ${file.name}` }])
    setLoading(true)
    try {
      const r = await fetch('/api/contable/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjunto: { base64, mimeType: file.type || 'application/octet-stream', fileName: file.name } }),
      })
      const data = await r.json().catch(() => null)
      // Sin cuerpo legible (504 del servidor, conexión cortada) NO es «el agente no ha dicho nada»:
      // el documento puede haber entrado igual. El 08/08/2026 pasó exactamente eso — un extracto con
      // 109 movimientos importado y archivado, y en pantalla «Sin respuesta.» Reimportar no duplica,
      // así que lo honesto es decir dónde comprobarlo antes de volver a subirlo.
      if (!data) {
        setMsgs(m => [...m, { rol: 'agente', texto: 'Se me ha cortado la conexión antes de poder contestarte. Puede que el documento SÍ haya entrado: compruébalo en /banca antes de volver a subirlo (reimportarlo no duplica nada).' }])
      } else {
        pintarRespuesta(data)
      }
    } catch {
      setMsgs(m => [...m, { rol: 'agente', texto: 'No se pudo subir el documento. Si era un extracto, míralo en /banca por si entró.' }])
    } finally {
      setLoading(false)
    }
  }, [loading, pintarRespuesta])

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

  // 👎: marca una respuesta del agente como mala. Coge la PREGUNTA (el turno 'tu' anterior) y la
  // respuesta, y las registra en contable_feedback para alimentar el bucle de mejora. Optimista.
  const marcarMalo = useCallback(async (msgIdx: number) => {
    setMsgs(m => {
      const respuesta = m[msgIdx]?.texto || ''
      let pregunta = ''
      for (let j = msgIdx - 1; j >= 0; j--) { if (m[j].rol === 'tu') { pregunta = m[j].texto; break } }
      fetch('/api/contable/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta, respuesta }),
      }).catch(() => {})
      return m.map((msg, i) => i === msgIdx ? { ...msg, feedback: 'enviado' as const } : msg)
    })
  }, [])

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '28px 20px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 8px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 24 }}>🧮</span>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Agente de contabilidad</h1>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0, marginBottom: 14 }}>
        Pregúntale por tus finanzas, dale criterios que recuerde, pídele que clasifique un cargo, o
        súbele un ticket/factura con 📎 (te propone la acción y la confirmas tú).
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
              {m.rol === 'agente' && (
                <div style={{ marginTop: 8 }}>
                  {m.feedback === 'enviado'
                    ? <span style={{ fontSize: 11, color: 'var(--muted)' }}>Gracias, lo reviso 🙌</span>
                    : <button onClick={() => marcarMalo(i)} title="Marcar como respuesta incorrecta" aria-label="Respuesta incorrecta"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--muted)', padding: '2px 4px', opacity: 0.7 }}>👎</button>}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <div style={{ color: 'var(--muted)', fontSize: 13 }}>El agente está pensando…</div>}
      </div>

      <form onSubmit={e => { e.preventDefault(); enviar(input) }} style={{ display: 'flex', gap: 8 }}>
        <input ref={fileRef} type="file" accept="image/*,application/pdf,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) subirDocumento(f); e.target.value = '' }} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={loading} title="Subir ticket, factura o extracto de tarjeta (foto, PDF o Excel)"
          aria-label="Subir ticket, factura o extracto" style={{
            flexShrink: 0, width: 44, height: 44, borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)', fontSize: 18, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1,
          }}>📎</button>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Escribe a tu agente de contabilidad…"
          disabled={loading} style={{
            flex: 1, minWidth: 0, padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)',
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

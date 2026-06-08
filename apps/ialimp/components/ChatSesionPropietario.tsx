'use client'
import { useState, useEffect, useRef } from 'react'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)',
  bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0',
}

interface ChatConfig {
  default_visible_limpiadora: boolean
  limpiadora_puede_responder: boolean
}

interface Props {
  token:        string
  sesionId:     string | null   // null = chat general
  miNombre:     string
  titulo?:      string
  height?:      string | number
  compact?:     boolean
  onClose?:     () => void
}

export default function ChatSesionPropietario({
  token, sesionId, miNombre, titulo, height = '100%', compact, onClose
}: Props) {
  const [mensajes,    setMensajes]    = useState<any[]>([])
  const [texto,       setTexto]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [chatConfig,  setChatConfig]  = useState<ChatConfig>({
    default_visible_limpiadora: false,
    limpiadora_puede_responder: false,
  })
  // Visibilidad del MENSAJE actual (toggle por mensaje)
  const [msgVisible, setMsgVisible]   = useState<boolean | null>(null) // null = usa default
  const [showConfig,  setShowConfig]  = useState(false)
  const [savingCfg,   setSavingCfg]   = useState(false)

  const bottomRef    = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)
  const prevCountRef = useRef(0)
  const apiBase      = `/api/propietario/${token}/chat`

  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 5000)
    return () => clearInterval(t)
  }, [sesionId])

  useEffect(() => {
    if (mensajes.length > prevCountRef.current)
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    prevCountRef.current = mensajes.length
  }, [mensajes])

  async function cargar() {
    const url = apiBase + (sesionId ? `?sesion_id=${sesionId}` : '')
    const r   = await fetch(url)
    const d   = await r.json()
    setMensajes(d.mensajes || [])
    if (d.chat_config) setChatConfig(d.chat_config)
  }

  // Visibilidad efectiva para el próximo mensaje
  const visEffective = msgVisible !== null ? msgVisible : chatConfig.default_visible_limpiadora

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    setLoading(true)
    const optimistic = {
      id: 'tmp_' + Date.now(), remitente_tipo: 'propietario', remitente_nombre: miNombre,
      texto: texto.trim(), creado_at: new Date().toISOString(), visible_limpiadora: visEffective, _pending: true
    }
    setMensajes(prev => [...prev, optimistic])
    const t = texto.trim()
    setTexto('')
    setMsgVisible(null) // reset al default tras enviar
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    await fetch(apiBase, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sesion_id: sesionId, texto: t, visible_limpiadora: visEffective })
    })
    await cargar()
    setLoading(false)
    inputRef.current?.focus()
  }

  async function guardarConfig(patch: Partial<ChatConfig>) {
    setSavingCfg(true)
    const r = await fetch(apiBase, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    })
    if (r.ok) setChatConfig(prev => ({ ...prev, ...patch }))
    setSavingCfg(false)
  }

  const fmtHora = (t: string) => {
    const d = new Date(t)
    const hoy = new Date().toDateString() === d.toDateString()
    return hoy
      ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' ' +
        d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }

  // Agrupar por fecha
  const grupos: { fecha: string; msgs: any[] }[] = []
  for (const m of mensajes) {
    const fecha = new Date(m.creado_at).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    if (!grupos.length || grupos[grupos.length-1].fecha !== fecha) grupos.push({ fecha, msgs: [m] })
    else grupos[grupos.length-1].msgs.push(m)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height, background: '#e5ddd5', fontFamily: "'Nunito', sans-serif", position: 'relative' }}>

      {/* Header */}
      <div style={{ background: C.primary, padding: compact ? '10px 14px' : '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer', padding: '0 4px', opacity: 0.75 }}>←</button>
        )}
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
          {sesionId ? '🏠' : '💬'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'white', fontWeight: 700, fontSize: compact ? 13 : 14 }}>{titulo || (sesionId ? 'Chat de esta reserva' : 'Chat general')}</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10 }}>
            {chatConfig.default_visible_limpiadora ? '👁 Visible a limpiadora por defecto' : '🔒 Solo empresa por defecto'}
          </div>
        </div>
        {/* Botón config */}
        <button onClick={() => setShowConfig(s => !s)}
          style={{ background: showConfig ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, padding: '5px 9px', color: 'white', fontSize: 14, cursor: 'pointer' }}>
          ⚙️
        </button>
      </div>

      {/* Panel configuración desplegable */}
      {showConfig && (
        <div style={{ background: 'white', borderBottom: `1px solid ${C.border}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 2 }}>Configuración del chat</div>

          {/* Toggle: visible limpiadora por defecto */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>👁 Visible a limpiadora por defecto</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>La limpiadora verá tus mensajes en su app</div>
            </div>
            <button onClick={() => guardarConfig({ default_visible_limpiadora: !chatConfig.default_visible_limpiadora })}
              disabled={savingCfg}
              style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: chatConfig.default_visible_limpiadora ? C.primary : '#cbd5e1',
                position: 'relative', flexShrink: 0, transition: 'background 0.2s'
              }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%', background: 'white',
                position: 'absolute', top: 3,
                left: chatConfig.default_visible_limpiadora ? 23 : 3,
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
              }} />
            </button>
          </div>

          {/* Toggle: limpiadora puede responder */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>💬 La limpiadora puede responder</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>Si activas esto, la limpiadora puede escribirte</div>
            </div>
            <button onClick={() => guardarConfig({ limpiadora_puede_responder: !chatConfig.limpiadora_puede_responder })}
              disabled={savingCfg}
              style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: chatConfig.limpiadora_puede_responder ? C.primary : '#cbd5e1',
                position: 'relative', flexShrink: 0, transition: 'background 0.2s'
              }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%', background: 'white',
                position: 'absolute', top: 3,
                left: chatConfig.limpiadora_puede_responder ? 23 : 3,
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
              }} />
            </button>
          </div>

          {savingCfg && <div style={{ fontSize: 11, color: C.brand, fontWeight: 600 }}>Guardando...</div>}
        </div>
      )}

      {/* Mensajes */}
      <div style={{ flex: 1, overflowY: 'auto', padding: compact ? '8px 10px' : '12px 14px', display: 'flex', flexDirection: 'column' }}>
        {mensajes.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: '#888', fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
            <div style={{ fontWeight: 600 }}>Sin mensajes aún</div>
            <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
              {sesionId ? 'Escribe aquí sobre esta limpieza' : 'Chat directo con la empresa'}
            </div>
          </div>
        )}

        {grupos.map(grupo => (
          <div key={grupo.fecha}>
            <div style={{ textAlign: 'center', margin: '10px 0 6px' }}>
              <span style={{ background: 'rgba(255,255,255,0.8)', padding: '3px 12px', borderRadius: 10, fontSize: 11, color: '#666', fontWeight: 600 }}>
                {grupo.fecha}
              </span>
            </div>

            {grupo.msgs.map((m: any) => {
              const esMio = m.remitente_tipo === 'propietario'
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: esMio ? 'flex-end' : 'flex-start', marginBottom: 4 }}>
                  <div style={{
                    maxWidth: '78%', padding: '8px 12px 5px',
                    borderRadius: esMio ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    background: esMio ? '#d9fdd3' : 'white',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                    opacity: m._pending ? 0.7 : 1
                  }}>
                    {!esMio && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.brand, marginBottom: 2 }}>{m.remitente_nombre}</div>
                    )}
                    <div style={{ fontSize: compact ? 13 : 14, color: C.text, lineHeight: 1.45, wordBreak: 'break-word' }}>{m.texto}</div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      {/* Badge visibilidad solo en mensajes del propietario */}
                      {esMio && (
                        <span style={{ fontSize: 9, color: m.visible_limpiadora ? C.brand : '#aaa', fontWeight: 600 }}>
                          {m.visible_limpiadora ? '👁' : '🔒'}
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: '#999' }}>{fmtHora(m.creado_at)}</span>
                      {esMio && (
                        <span style={{ fontSize: 11, color: '#999' }}>{m._pending ? '🕐' : '✓'}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input con toggle de visibilidad POR MENSAJE */}
      <form onSubmit={enviar}
        style={{ padding: compact ? '6px 10px' : '8px 12px', background: '#f0f2f5', display: 'flex', flexDirection: 'column', gap: 6 }}>

        {/* Toggle visibilidad de este mensaje */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button"
            onClick={() => setMsgVisible(v => v === null ? !chatConfig.default_visible_limpiadora : (v === chatConfig.default_visible_limpiadora ? !v : null))}
            style={{
              padding: '3px 10px', borderRadius: 10, border: `1px solid ${visEffective ? C.brand : C.border}`,
              background: visEffective ? C.light : 'white', color: visEffective ? C.brand : C.muted,
              fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
            }}>
            {visEffective ? '👁 Limpiadora ve este mensaje' : '🔒 Solo empresa'}
          </button>
          {msgVisible !== null && (
            <span style={{ fontSize: 10, color: C.brand, fontWeight: 600 }}>← ajustado manualmente</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input ref={inputRef} value={texto} onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(e as any) } }}
            placeholder="Escribe un mensaje..."
            style={{ flex: 1, padding: '10px 16px', border: 'none', borderRadius: 22, fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }} />
          <button type="submit" disabled={loading || !texto.trim()}
            style={{
              width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
              background: texto.trim() ? C.primary : '#c4c4c4',
              border: 'none', color: 'white', fontSize: 18, cursor: texto.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s'
            }}>↑</button>
        </div>
      </form>
    </div>
  )
}

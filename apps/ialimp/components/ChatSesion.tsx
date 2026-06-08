'use client'
import { useState, useEffect, useRef } from 'react'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)',
  bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4'
}

interface Props {
  sesionId:   string | null   // null = chat general del equipo
  apiBase:    string           // '/api/l/chat' | '/api/admin/chat'
  miNombre:   string
  miTipo:     string           // 'admin' | 'limpiadora'
  titulo?:    string
  height?:    string | number
  compact?:   boolean          // modo compacto para panel lateral
}

export default function ChatSesion({ sesionId, apiBase, miNombre, miTipo, titulo, height = '100%', compact }: Props) {
  const [mensajes, setMensajes] = useState<any[]>([])
  const [texto, setTexto]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef               = useRef<HTMLDivElement>(null)
  const inputRef                = useRef<HTMLInputElement>(null)
  const prevCountRef            = useRef(0)

  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 5000)
    return () => clearInterval(t)
  }, [sesionId])

  useEffect(() => {
    if (mensajes.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevCountRef.current = mensajes.length
  }, [mensajes])

  async function cargar() {
    const url = apiBase + (sesionId ? '?sesion_id=' + sesionId : '')
    const r   = await fetch(url)
    const d   = await r.json()
    setMensajes(d.mensajes || [])
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    setLoading(true)
    const optimistic = {
      id: 'tmp_' + Date.now(), remitente_tipo: miTipo, remitente_nombre: miNombre,
      texto: texto.trim(), creado_at: new Date().toISOString(), leido: false, _pending: true
    }
    setMensajes(prev => [...prev, optimistic])
    setTexto('')
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

    await fetch(apiBase, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sesion_id: sesionId, texto: optimistic.texto })
    })
    await cargar()
    setLoading(false)
    inputRef.current?.focus()
  }

  const fmtHora = (t: string) => {
    const d = new Date(t)
    const hoy = new Date().toDateString() === d.toDateString()
    return hoy
      ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }

  // Agrupar mensajes por fecha
  const grupos: { fecha: string; msgs: any[] }[] = []
  for (const m of mensajes) {
    const fecha = new Date(m.creado_at).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    if (!grupos.length || grupos[grupos.length-1].fecha !== fecha) {
      grupos.push({ fecha, msgs: [m] })
    } else {
      grupos[grupos.length-1].msgs.push(m)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height, background: '#e5ddd5', fontFamily: "'Nunito', sans-serif" }}>
      {titulo && (
        <div style={{ background: C.primary, padding: compact ? '10px 14px' : '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
            {sesionId ? '🏠' : '👥'}
          </div>
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: compact ? 13 : 15 }}>{titulo}</div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>
              {sesionId ? 'Chat de esta reserva' : 'Chat general del equipo'}
            </div>
          </div>
        </div>
      )}

      {/* Mensajes */}
      <div style={{ flex: 1, overflowY: 'auto', padding: compact ? '8px 10px' : '12px 16px', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {mensajes.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: '#888', fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
            <div style={{ fontWeight: 600 }}>Sin mensajes</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {sesionId ? 'Escribe aquí sobre esta limpieza' : 'Chat general del equipo'}
            </div>
          </div>
        )}

        {grupos.map(grupo => (
          <div key={grupo.fecha}>
            {/* Separador de fecha */}
            <div style={{ textAlign: 'center', margin: '12px 0 8px' }}>
              <span style={{ background: 'rgba(255,255,255,0.8)', padding: '3px 12px', borderRadius: 10, fontSize: 11, color: '#666', fontWeight: 600 }}>
                {grupo.fecha}
              </span>
            </div>

            {grupo.msgs.map((m: any) => {
              const esMio = m.remitente_tipo === miTipo
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: esMio ? 'flex-end' : 'flex-start', marginBottom: 4 }}>
                  <div style={{
                    maxWidth: compact ? '85%' : '75%',
                    padding: '8px 12px 5px',
                    borderRadius: esMio ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    background: esMio ? '#d9fdd3' : 'white',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    position: 'relative',
                    opacity: m._pending ? 0.7 : 1
                  }}>
                    {!esMio && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.brand, marginBottom: 2 }}>
                        {m.remitente_nombre}
                      </div>
                    )}
                    <div style={{ fontSize: compact ? 13 : 14, color: C.text, lineHeight: 1.45, wordBreak: 'break-word' }}>
                      {m.texto}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 2, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: '#999' }}>{fmtHora(m.creado_at)}</span>
                      {esMio && (
                        <span style={{ fontSize: 12, color: m.leido ? '#53bdeb' : '#999' }}>
                          {m._pending ? '🕐' : m.leido ? '✓✓' : '✓'}
                        </span>
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

      {/* Input WhatsApp-style */}
      <form onSubmit={enviar}
        style={{ padding: compact ? '8px 10px' : '10px 12px', background: '#f0f2f5', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <input
          ref={inputRef}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(e as any) } }}
          placeholder="Escribe un mensaje"
          style={{
            flex: 1, padding: '10px 16px', border: 'none', borderRadius: 22,
            fontSize: 13, outline: 'none', fontFamily: 'inherit',
            background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }} />
        <button type="submit" disabled={loading || !texto.trim()}
          style={{
            width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
            background: texto.trim() ? C.primary : '#c4c4c4',
            border: 'none', color: 'white', fontSize: 18,
            cursor: texto.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s'
          }}>
          ↑
        </button>
      </form>
    </div>
  )
}

'use client'
import LogoIalimp from '@/components/LogoIalimp'
import { useState, useEffect, useRef } from 'react'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)',
  bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', warnBg: '#fffbeb', red: '#dc2626'
}

const TIPO_CFG: Record<string, { icon: string; label: string; color: string }> = {
  general:   { icon: '💬', label: 'General',   color: C.brand   },
  sesion:    { icon: '🏠', label: 'Reserva',   color: '#0ea5e9' },
  propiedad: { icon: '🏢', label: 'Propiedad', color: '#10b981' },
}

const VIS_CFG: Record<string, { label: string; icon: string }> = {
  todos:               { label: 'Todos',              icon: '👁' },
  propietario_empresa: { label: 'Propietario+Empresa', icon: '🤝' },
  equipo_empresa:      { label: 'Equipo+Empresa',      icon: '👥' },
}

function fmtHora(t: string) {
  if (!t) return ''
  const d = new Date(t)
  return new Date().toDateString() === d.toDateString()
    ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

/* ── Badge destinatario ── */
function DestBadge({ tipo, nombre, color }: { tipo: string; nombre?: string; color?: string }) {
  if (tipo === 'todos') return (
    <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:20,
      background:'#f1f5f9', color:C.muted, border:`1px solid ${C.border}` }}>
      🌐 Todo el equipo
    </span>
  )
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:20,
      background: (color || C.brand)+'20', color: color || C.brand, border:`1px solid ${(color||C.brand)}40` }}>
      👤 {nombre || 'Persona'}
    </span>
  )
}

/* ── Modal nuevo hilo ── */
function NuevoHiloModal({ onClose, onCreado }: { onClose: () => void; onCreado: (h: any) => void }) {
  const [tipo, setTipo]           = useState('general')
  const [titulo, setTitulo]       = useState('')
  const [visib, setVisib]         = useState('todos')
  const [sesiones, setSesiones]   = useState<any[]>([])
  const [props, setProps]         = useState<any[]>([])
  const [ctxId, setCtxId]         = useState('')
  const [destTipo, setDestTipo]   = useState<'todos'|'persona'>('todos')
  const [destId, setDestId]       = useState('')
  const [limpiadoras, setLimpiadoras] = useState<any[]>([])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  // Cargar limpiadoras al montar (siempre necesario para el selector)
  useEffect(() => {
    fetch('/api/admin/limpiadoras')
      .then(r => r.json())
      .then(d => setLimpiadoras(d.limpiadoras || []))
  }, [])

  useEffect(() => {
    if (tipo === 'sesion')
      fetch('/api/admin/sesiones?limit=30').then(r => r.json()).then(d => setSesiones(d.sesiones || []))
    if (tipo === 'propiedad')
      fetch('/api/admin/propiedades').then(r => r.json()).then(d => setProps(d.propiedades || []))
  }, [tipo])

  // Si es mensaje directo, la visibilidad es siempre equipo_empresa
  const visibFinal = destTipo === 'persona' ? 'equipo_empresa' : visib

  async function crear() {
    if (!titulo.trim()) { setError('El título es obligatorio'); return }
    if ((tipo === 'sesion' || tipo === 'propiedad') && !ctxId) { setError('Selecciona el contexto'); return }
    if (destTipo === 'persona' && !destId) { setError('Selecciona la persona destinataria'); return }
    setSaving(true); setError('')
    const r = await fetch('/api/admin/chat/hilos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo, titulo, visibilidad: visibFinal,
        contexto_id: ctxId || null,
        destinatario_tipo: destTipo,
        destinatario_id: destTipo === 'persona' ? destId : null,
      })
    })
    const d = await r.json()
    if (d.ok) { onCreado(d.hilo) }
    else { setError(d.error || 'Error'); setSaving(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:20, width:'100%', maxWidth:480, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ padding:'18px 20px 14px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:800, fontSize:17, color:C.text }}>Nuevo hilo de chat</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, color:C.muted, cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:16 }}>

          {/* 1. Tipo */}
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:8, textTransform:'uppercase', letterSpacing:'.05em' }}>Tipo de hilo</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
              {Object.entries(TIPO_CFG).map(([k, v]) => (
                <button key={k} onClick={() => { setTipo(k); setCtxId('') }}
                  style={{ padding:'10px 8px', borderRadius:10, border:`2px solid ${tipo===k ? v.color : C.border}`,
                    background: tipo===k ? v.color+'15' : 'white', cursor:'pointer', fontFamily:'inherit',
                    display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                  <span style={{ fontSize:22 }}>{v.icon}</span>
                  <span style={{ fontSize:12, fontWeight:700, color: tipo===k ? v.color : C.muted }}>{v.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Para (destinatario) */}
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:8, textTransform:'uppercase', letterSpacing:'.05em' }}>Para</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom: destTipo==='persona' ? 10 : 0 }}>
              {([
                { k:'todos',   icon:'🌐', label:'Todo el equipo' },
                { k:'persona', icon:'👤', label:'Persona concreta' },
              ] as const).map(opt => (
                <button key={opt.k} onClick={() => { setDestTipo(opt.k); setDestId('') }}
                  style={{ padding:'10px 8px', borderRadius:10,
                    border:`2px solid ${destTipo===opt.k ? C.primary : C.border}`,
                    background: destTipo===opt.k ? C.light : 'white',
                    cursor:'pointer', fontFamily:'inherit',
                    display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                  <span style={{ fontSize:22 }}>{opt.icon}</span>
                  <span style={{ fontSize:11, fontWeight:700, color: destTipo===opt.k ? C.primary : C.muted, textAlign:'center', lineHeight:1.2 }}>{opt.label}</span>
                </button>
              ))}
            </div>
            {destTipo === 'persona' && (
              <select value={destId} onChange={e => setDestId(e.target.value)}
                style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${destId ? C.primary : C.border}`,
                  fontSize:13, fontFamily:'inherit', color:C.text }}>
                <option value="">— Selecciona persona —</option>
                {limpiadoras.filter((l:any) => l.activa).map((l: any) => (
                  <option key={l.id} value={l.id}>{l.nombre}</option>
                ))}
              </select>
            )}
          </div>

          {/* 3. Contexto según tipo */}
          {tipo === 'sesion' && (
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>Reserva / Sesión</div>
              <select value={ctxId} onChange={e => setCtxId(e.target.value)}
                style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, fontFamily:'inherit', color:C.text }}>
                <option value="">— Selecciona sesión —</option>
                {sesiones.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.session_date} · {s.property_name}</option>
                ))}
              </select>
            </div>
          )}
          {tipo === 'propiedad' && (
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>Apartamento</div>
              <select value={ctxId} onChange={e => setCtxId(e.target.value)}
                style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, fontFamily:'inherit', color:C.text }}>
                <option value="">— Selecciona apartamento —</option>
                {props.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {/* 4. Título */}
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>Título del hilo</div>
            <input value={titulo} onChange={e => setTitulo(e.target.value)}
              placeholder={tipo==='general' ? 'Ej: Coordinación semana del 2 de junio' : tipo==='sesion' ? 'Ej: Incidencia en esta limpieza' : 'Ej: Acceso al piso'}
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:14, fontFamily:'inherit', color:C.text }} />
          </div>

          {/* 5. Visibilidad — solo si es mensaje a todo el equipo */}
          {destTipo === 'todos' && (
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:8, textTransform:'uppercase', letterSpacing:'.05em' }}>¿Quién puede ver este hilo?</div>
              <div style={{ display:'flex', gap:6 }}>
                {Object.entries(VIS_CFG).map(([k, v]) => (
                  <button key={k} onClick={() => setVisib(k)}
                    style={{ flex:1, padding:'9px 6px', borderRadius:10, border:`2px solid ${visib===k ? C.primary : C.border}`,
                      background: visib===k ? C.light : 'white', cursor:'pointer', fontFamily:'inherit',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                    <span style={{ fontSize:18 }}>{v.icon}</span>
                    <span style={{ fontSize:10, fontWeight: visib===k ? 700 : 500, color: visib===k ? C.primary : C.muted, textAlign:'center', lineHeight:1.2 }}>{v.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Mensaje directo: visibilidad implícita */}
          {destTipo === 'persona' && (
            <div style={{ background:'#f8fafc', border:`1px solid ${C.border}`, borderRadius:10, padding:'10px 14px',
              fontSize:12, color:C.muted, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:16 }}>🔒</span>
              <span>Solo visible para <strong style={{ color:C.text }}>
                {limpiadoras.find((l:any) => l.id === destId)?.nombre || 'la persona seleccionada'}
              </strong> y el equipo de empresa</span>
            </div>
          )}

          {error && <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, padding:'10px 14px', fontSize:13, color:C.red }}>{error}</div>}

          <div style={{ display:'flex', gap:10 }}>
            <button onClick={onClose}
              style={{ flex:1, padding:'12px', borderRadius:10, border:`1px solid ${C.border}`, background:'white', color:C.muted, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
              Cancelar
            </button>
            <button onClick={crear} disabled={saving}
              style={{ flex:2, padding:'12px', borderRadius:10, border:'none', background:C.primary, color:'white', fontSize:13, fontWeight:700, cursor:saving?'wait':'pointer', fontFamily:'inherit', opacity:saving?.6:1 }}>
              {saving ? 'Creando...' : '+ Crear hilo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Panel de mensajes de un hilo ── */
function HiloChat({ hilo, nombreAdmin, onBack }: { hilo: any; nombreAdmin: string; onBack: () => void }) {
  const [mensajes, setMensajes] = useState<any[]>([])
  const [texto, setTexto]       = useState('')
  const [sending, setSending]   = useState(false)
  const bottomRef               = useRef<HTMLDivElement>(null)

  useEffect(() => {
    cargar()
    const iv = setInterval(cargar, 5000)
    return () => clearInterval(iv)
  }, [hilo.id])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [mensajes])

  async function cargar() {
    const r = await fetch(`/api/admin/chat/hilos/${hilo.id}`)
    const d = await r.json()
    if (d.mensajes) setMensajes(d.mensajes)
  }

  async function enviar() {
    if (!texto.trim() || sending) return
    setSending(true)
    await fetch(`/api/admin/chat/hilos/${hilo.id}`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ texto })
    })
    setTexto('')
    setSending(false)
    cargar()
  }

  const cfg = TIPO_CFG[hilo.tipo] || TIPO_CFG.general

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', height:'100%' }}>
      {/* Header hilo */}
      <div style={{ background:'white', padding:'12px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <button onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer', color:C.primary, fontSize:20, lineHeight:1 }}>←</button>
        <div style={{ width:38, height:38, borderRadius:10, background:cfg.color+'15', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
          {cfg.icon}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:14, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{hilo.titulo}</div>
          <div style={{ fontSize:11, color:C.muted, display:'flex', alignItems:'center', gap:6, marginTop:2, flexWrap:'wrap' }}>
            <span style={{ background:cfg.color+'15', color:cfg.color, fontWeight:700, fontSize:10, padding:'1px 6px', borderRadius:20 }}>{cfg.label}</span>
            {hilo.contexto_nombre && <span>· {hilo.contexto_nombre}</span>}
            <DestBadge tipo={hilo.destinatario_tipo || 'todos'} nombre={hilo.destinatario_nombre} color={hilo.destinatario_color} />
          </div>
        </div>
      </div>

      {/* Mensajes */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:8, background:C.bg }}>
        {mensajes.length === 0 && (
          <div style={{ textAlign:'center', padding:'40px 0', color:C.muted }}>
            <div style={{ fontSize:32, marginBottom:8 }}>💬</div>
            <div style={{ fontSize:13 }}>Sé el primero en escribir en este hilo</div>
          </div>
        )}
        {mensajes.map((m: any) => {
          const esAdmin = m.remitente_tipo === 'admin'
          return (
            <div key={m.id} style={{ display:'flex', flexDirection:'column', alignItems: esAdmin ? 'flex-end' : 'flex-start' }}>
              {!esAdmin && (
                <div style={{ fontSize:11, color:C.muted, marginBottom:2, paddingLeft:4 }}>
                  {m.remitente_nombre}
                  <span style={{ marginLeft:4, fontSize:10, background:C.light, color:C.brand, padding:'1px 5px', borderRadius:8, fontWeight:700 }}>
                    {m.remitente_tipo}
                  </span>
                </div>
              )}
              <div style={{
                maxWidth:'80%', padding:'10px 14px', borderRadius: esAdmin ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: esAdmin ? C.primary : 'white',
                color: esAdmin ? 'white' : C.text,
                fontSize:14, lineHeight:1.5,
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              }}>
                {m.texto}
              </div>
              <div style={{ fontSize:10, color:C.muted, marginTop:2, paddingLeft:4, paddingRight:4 }}>
                {fmtHora(m.creado_at)}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ background:'white', borderTop:`1px solid ${C.border}`, padding:'12px 16px', display:'flex', gap:8, flexShrink:0 }}>
        <input
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
          placeholder={hilo.destinatario_tipo === 'persona' ? `Mensaje para ${hilo.destinatario_nombre || 'persona'}...` : 'Escribe un mensaje al equipo...'}
          style={{ flex:1, padding:'10px 14px', borderRadius:20, border:`1px solid ${C.border}`, fontSize:14, fontFamily:'inherit', outline:'none', color:C.text }}
        />
        <button onClick={enviar} disabled={sending || !texto.trim()}
          style={{ width:42, height:42, borderRadius:'50%', background: texto.trim() ? C.primary : C.border, border:'none', color:'white', fontSize:18, cursor: texto.trim() ? 'pointer' : 'default', transition:'background .15s', flexShrink:0 }}>
          ➤
        </button>
      </div>
    </div>
  )
}

/* ── Página principal ── */
export default function AdminChatPage() {
  const [hilos, setHilos]         = useState<any[]>([])
  const [filtro, setFiltro]       = useState<string>('todos')
  const [selected, setSelected]   = useState<any>(null)
  const [loading, setLoading]     = useState(true)
  const [nombre, setNombre]       = useState('Admin')
  const [showNuevo, setShowNuevo] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const r = await fetch('/api/admin/chat/hilos')
    const d = await r.json()
    setHilos(d.hilos || [])
    setNombre(d.empresa_nombre || 'Admin')
    setLoading(false)
  }

  const hilosFiltrados = filtro === 'todos' ? hilos : hilos.filter(h => h.tipo === filtro)
  const totalUnread = hilos.reduce((a, h) => a + (h.unread || 0), 0)

  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', fontFamily:"'Nunito',sans-serif", background:C.bg }}>

      {/* Header */}
      <header style={{ background:C.primary, padding:'14px 20px', display:'flex', alignItems:'center', gap:16, flexShrink:0 }}>
        <a href="/dashboard" style={{ color:'rgba(255,255,255,0.7)', fontSize:13, textDecoration:'none' }}>← Dashboard</a>
        <div style={{ flex:1, display:'flex', alignItems:'center', gap:10 }}>
          <LogoIalimp size={18} />
          <div style={{ width:1, height:14, background:'rgba(255,255,255,.25)' }} />
          <h1 style={{ color:'rgba(255,255,255,.85)', fontWeight:600, fontSize:15 }}>💬 Mensajes</h1>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {totalUnread > 0 && (
            <div style={{ background:'#dc2626', color:'white', borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:800 }}>
              {totalUnread}
            </div>
          )}
          <button onClick={() => setShowNuevo(true)}
            style={{ background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.3)', color:'white', borderRadius:8, padding:'7px 14px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            + Nuevo
          </button>
        </div>
      </header>

      {/* Filtros tipo */}
      <div style={{ background:'white', borderBottom:`1px solid ${C.border}`, display:'flex', gap:0, flexShrink:0, overflowX:'auto' }}>
        {[
          { k:'todos',     label:'Todos',      icon:'📋' },
          { k:'general',   label:'General',    icon:'💬' },
          { k:'sesion',    label:'Reserva',    icon:'🏠' },
          { k:'propiedad', label:'Propiedad',  icon:'🏢' },
        ].map(f => (
          <button key={f.k} onClick={() => setFiltro(f.k)}
            style={{ flex:1, padding:'11px 8px', border:'none', background:'transparent', cursor:'pointer',
              fontSize:12, fontWeight: filtro===f.k ? 700 : 500, fontFamily:'inherit',
              color: filtro===f.k ? C.primary : C.muted,
              borderBottom:`2px solid ${filtro===f.k ? C.primary : 'transparent'}`,
              whiteSpace:'nowrap' }}>
            {f.icon} {f.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* Lista hilos */}
        <div style={{
          width: selected ? '38%' : '100%', maxWidth: selected ? 320 : undefined,
          borderRight:`1px solid ${C.border}`, overflowY:'auto', background:'white', flexShrink:0
        }}>
          {loading && <div style={{ padding:24, textAlign:'center', color:C.muted }}>Cargando...</div>}

          {!loading && hilosFiltrados.length === 0 && (
            <div style={{ padding:32, textAlign:'center', color:C.muted }}>
              <div style={{ fontSize:36, marginBottom:8 }}>💬</div>
              <div style={{ fontWeight:700, marginBottom:4 }}>Sin hilos todavía</div>
              <button onClick={() => setShowNuevo(true)}
                style={{ marginTop:8, color:C.primary, background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                + Crear primer hilo
              </button>
            </div>
          )}

          {hilosFiltrados.map(h => {
            const cfg = TIPO_CFG[h.tipo] || TIPO_CFG.general
            const isSelected = selected?.id === h.id
            const esDirec = h.destinatario_tipo === 'persona'
            return (
              <button key={h.id} onClick={() => setSelected(h)}
                style={{
                  width:'100%', textAlign:'left', border:'none', cursor:'pointer',
                  padding:'14px 16px',
                  background: isSelected ? C.light : 'white',
                  borderBottom:`1px solid ${C.border}`, fontFamily:'inherit',
                  display:'flex', gap:12, alignItems:'flex-start',
                  borderLeft: isSelected ? `3px solid ${C.primary}` : '3px solid transparent'
                }}>
                {/* Icono tipo */}
                <div style={{ width:42, height:42, borderRadius:10, background:cfg.color+'15',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                  {cfg.icon}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:4 }}>
                    <div style={{ fontWeight:700, fontSize:13, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {h.titulo}
                    </div>
                    <div style={{ fontSize:10, color:C.muted, flexShrink:0 }}>{fmtHora(h.ultimo_msg_at)}</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:3, flexWrap:'wrap' }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:20, background:cfg.color+'15', color:cfg.color }}>{cfg.label}</span>
                    {h.contexto_nombre && <span style={{ fontSize:11, color:C.muted }}>· {h.contexto_nombre}</span>}
                    {/* Badge destinatario */}
                    {esDirec ? (
                      <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:20,
                        background:(h.destinatario_color||C.brand)+'20', color:h.destinatario_color||C.brand }}>
                        👤 {h.destinatario_nombre || 'Persona'}
                      </span>
                    ) : (
                      <span style={{ fontSize:10, padding:'1px 6px', borderRadius:20, background:'#f1f5f9', color:C.muted }}>
                        🌐 Equipo
                      </span>
                    )}
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4 }}>
                    <div style={{ fontSize:12, color:C.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'80%' }}>
                      {h.ultimo_texto || `${h.total_msgs || 0} mensajes`}
                    </div>
                    {h.unread > 0 && (
                      <div style={{ background:C.primary, color:'white', borderRadius:'50%', width:20, height:20,
                        fontSize:11, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {h.unread}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Panel chat */}
        {selected ? (
          <HiloChat hilo={selected} nombreAdmin={nombre} onBack={() => setSelected(null)} />
        ) : (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:C.muted, flexDirection:'column', gap:12 }}>
            <div style={{ fontSize:48 }}>💬</div>
            <div style={{ fontWeight:700, color:C.text }}>Selecciona un hilo</div>
            <div style={{ fontSize:13 }}>o crea uno nuevo con el botón + Nuevo</div>
          </div>
        )}
      </div>

      {showNuevo && (
        <NuevoHiloModal
          onClose={() => setShowNuevo(false)}
          onCreado={h => { setShowNuevo(false); cargar().then(() => setSelected(h)) }}
        />
      )}
    </div>
  )
}


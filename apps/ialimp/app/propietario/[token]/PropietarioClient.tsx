
'use client'
import LogoIalimp from '@/components/LogoIalimp'
import { useState, useEffect, useMemo } from 'react'
import FirmaPad from '@/components/FirmaPad'
import ChatSesionPropietario from '@/components/ChatSesionPropietario'
import ChecklistPropietario from '@/components/ChecklistPropietario'
import ContabilidadTab from '@/components/ContabilidadTab'
import AccesoPropiedad from '@/components/AccesoPropiedad'
import EscanerDocumento from '@/components/EscanerDocumento'
import DocumentosPropiedad from '@/components/DocumentosPropiedad'
import CalendarioIcal from './CalendarioIcal'

const C = {
  primary:'var(--brand-primary)', brand:'var(--brand-secondary)', light:'var(--brand-light)',
  bg:'#f1f5f9', text:'#1e293b', muted:'#64748b', border:'#e2e8f0',
  ok:'#16a34a', okBg:'#f0fdf4', okBorder:'#bbf7d0',
  warn:'#d97706', warnBg:'#fffbeb', warnBorder:'#fcd34d',
  info:'#2563eb', infoBg:'#eff6ff', infoBorder:'#bfdbfe',
  red:'#dc2626', redBg:'#fef2f2',
}
const ESTADO_CFG: Record<string,any> = {
  completada:{ label:'✅ Completada', bg:C.okBg,   color:C.ok,   border:C.okBorder,  dot:'#22c55e' },
  en_curso:  { label:'🧹 Limpiando',  bg:C.infoBg, color:C.info, border:C.infoBorder, dot:'#3b82f6' },
  pendiente: { label:'⏳ Pendiente',  bg:C.bg,     color:C.muted,border:C.border,      dot:'#94a3b8' },
}
const MENU_ITEMS = [
  { id:'hoy',        icon:'🏠', label:'Hoy' },
  { id:'reservas',   icon:'📆', label:'Reservas' },
  { id:'calendario', icon:'🔗', label:'Calendario iCal' },
  { id:'finanzas',   icon:'📊', label:'Finanzas' },
  { id:'docs',       icon:'📄', label:'Documentos' },
  { id:'acceso',     icon:'🔑', label:'Acceso' },
  { id:'chat',       icon:'💬', label:'Chat' },
]
const ESTADO_FILTROS = [
  { id:'todas', label:'Todas' },
  { id:'pendiente', label:'⏳ Pend.' },
  { id:'en_curso',  label:'🧹 Curso' },
  { id:'completada',label:'✅ Hecha' },
]
const HOY = new Date().toISOString().split('T')[0]
function addDays(base: string, n: number) {
  const d = new Date(base + 'T12:00:00'); d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}
const RANGOS_RAPIDOS = [
  { id:'todo',   label:'Todo' },
  { id:'hoy',    label:'Hoy' },
  { id:'7d',     label:'7 días' },
  { id:'30d',    label:'30 días' },
  { id:'mes',    label:'Este mes' },
  { id:'custom', label:'Custom' },
]
function rangoFechas(id: string): { desde: string; hasta: string } | null {
  const hoy = HOY
  if (id === 'todo')  return null
  if (id === 'hoy')   return { desde: hoy, hasta: hoy }
  if (id === '7d')    return { desde: hoy, hasta: addDays(hoy, 7) }
  if (id === '30d')   return { desde: hoy, hasta: addDays(hoy, 30) }
  if (id === 'mes') {
    const d = new Date(hoy + 'T12:00:00')
    const ini = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
    const fin = new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().split('T')[0]
    return { desde: ini, hasta: fin }
  }
  return null
}

const PORTAL_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  booking:  { bg:'#003580', color:'white',   label:'Booking' },
  airbnb:   { bg:'#ff385c', color:'white',   label:'Airbnb'  },
  directo:  { bg:'#d1fae5', color:'#065f46', label:'Directo' },
  expedia:  { bg:'#ffc72c', color:'#1a1a1a', label:'Expedia' },
  vrbo:     { bg:'#1c3f7f', color:'white',   label:'VRBO'    },
  agoda:    { bg:'#e11d48', color:'white',   label:'Agoda'   },
}
function PortalChip({ portal }: { portal?: string }) {
  const key = (portal||'directo').toLowerCase()
  const s = PORTAL_STYLE[key] || { bg:'#f1f5f9', color:C.muted, label: portal||'—' }
  return (
    <span style={{ display:'inline-flex', alignItems:'center', fontSize:11, fontWeight:700,
      padding:'2px 8px', borderRadius:6, background:s.bg, color:s.color, letterSpacing:'0.02em' }}>
      {s.label}
    </span>
  )
}

function fmt(n: number) {
  return '€' + n.toFixed(2).replace('.', ',')
}

function Stars({ value, onChange }: { value:number; onChange?:(n:number)=>void }) {
  return (
    <div style={{ display:'flex', gap:4 }}>
      {[1,2,3,4,5].map(i => (
        <button key={i} type="button" onClick={() => onChange?.(i)}
          style={{ background:'none', border:'none', cursor:onChange?'pointer':'default', fontSize:24, color:i<=value?'#f59e0b':'#e2e8f0' }}>★</button>
      ))}
    </div>
  )
}

function QuejaModal({ sesion, token, onClose, onSent }: any) {
  const [desc,setDesc]=useState(''); const [phone,setPhone]=useState('')
  const [rating,setRating]=useState(0); const [loading,setLoading]=useState(false); const [error,setError]=useState('')
  async function enviar(e: React.FormEvent) {
    e.preventDefault(); if (!desc.trim()) { setError('Describe el problema'); return }
    setLoading(true)
    const r = await fetch(`/api/propietario/${token}/queja`, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ sesion_id:sesion.id, descripcion:desc, guest_phone:phone||null, rating:rating||null }) })
    if (r.ok) { onSent() } else { setError('Error al enviar'); setLoading(false) }
  }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:200, padding:16 }}>
      <div style={{ background:'white', borderRadius:20, width:'100%', maxWidth:480, maxHeight:'88vh', overflowY:'auto' }}>
        <div style={{ padding:'18px 20px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div><h3 style={{ fontWeight:800, fontSize:17, color:C.text }}>Queja del huésped</h3>
               <p style={{ fontSize:12, color:C.muted, marginTop:2 }}>{sesion.property_name||sesion.nombre}</p></div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, color:C.muted, cursor:'pointer' }}>✕</button>
        </div>
        <form onSubmit={enviar} style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:16 }}>
          <div><label style={{ display:'block', fontSize:12, fontWeight:700, color:C.muted, marginBottom:8 }}>Valoración</label><Stars value={rating} onChange={setRating} /></div>
          <div><label style={{ display:'block', fontSize:12, fontWeight:700, color:C.muted, marginBottom:6 }}>¿Qué ha dicho el huésped? *</label>
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Ej: El baño no estaba limpio..." rows={4}
              style={{ width:'100%', border:`1px solid ${C.border}`, borderRadius:10, padding:'10px 12px', fontSize:14, resize:'none', fontFamily:'inherit', outline:'none' }} /></div>
          <div><label style={{ display:'block', fontSize:12, fontWeight:700, color:C.muted, marginBottom:6 }}>Teléfono del huésped</label>
            <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+34 6xx xxx xxx"
              style={{ width:'100%', border:`1px solid ${C.border}`, borderRadius:10, padding:'10px 12px', fontSize:14, fontFamily:'inherit', outline:'none' }} /></div>
          <div style={{ background:C.light, borderRadius:10, padding:'10px 14px', fontSize:12, color:C.brand }}>💡 Tu empresa de limpieza recibirá un aviso inmediato.</div>
          {error && <p style={{ color:C.red, fontSize:13 }}>{error}</p>}
          <div style={{ display:'flex', gap:10 }}>
            <button type="button" onClick={onClose} style={{ flex:1, padding:12, borderRadius:10, border:`1px solid ${C.border}`, background:'white', color:C.muted, fontSize:13, cursor:'pointer' }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{ flex:2, padding:12, borderRadius:10, border:'none', background:C.red, color:'white', fontSize:13, fontWeight:700, cursor:'pointer', opacity:loading?0.5:1 }}>
              {loading?'Enviando...':'⚠️ Enviar queja'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── MODAL NUEVA LIMPIEZA (el propietario la crea directamente) ──────────────
const TIPOS_SERVICIO = [
  { id:'rotacion', label:'🔄 Rotación (salida + entrada)' },
  { id:'checkout',  label:'🚪 Solo check-out' },
  { id:'extra',     label:'✨ Limpieza extra' },
  { id:'profunda',  label:'🧽 Limpieza profunda' },
]
function NuevaReservaModal({ token, propiedades, onClose, onCreated }: any) {
  const propsActivas = (propiedades || []).filter((p:any)=>p && p.id)
  const [propiedadId, setPropiedadId] = useState(propsActivas.length===1 ? propsActivas[0].id : '')
  const [fecha, setFecha]             = useState(HOY)
  const [tipo, setTipo]               = useState('rotacion')
  const [horaOut, setHoraOut]         = useState('')
  const [horaIn, setHoraIn]           = useState('')
  const [huespedes, setHuespedes]     = useState('')
  const [notas, setNotas]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')

  // Prefijar horas habituales de la propiedad seleccionada
  useEffect(() => {
    const p = propsActivas.find((x:any)=>x.id===propiedadId)
    if (p) { if (p.hora_checkout) setHoraOut(p.hora_checkout.slice(0,5)); if (p.hora_checkin_siguiente) setHoraIn(p.hora_checkin_siguiente.slice(0,5)) }
  }, [propiedadId])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!propiedadId) { setError('Elige una propiedad'); return }
    if (!fecha)       { setError('Elige una fecha'); return }
    setError(''); setLoading(true)
    try {
      const r = await fetch(`/api/propietario/${token}/sesiones`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          propiedad_id: propiedadId, session_date: fecha, tipo_servicio: tipo,
          hora_checkout: horaOut || null, hora_checkin_siguiente: horaIn || null,
          num_huespedes: huespedes || null, notas: notas || null,
        }),
      })
      const d = await r.json()
      if (r.ok) { onCreated() } else { setError(d.error || 'Error al crear'); setLoading(false) }
    } catch { setError('Error de conexión'); setLoading(false) }
  }

  const inputStyle = { width:'100%', border:`1px solid ${C.border}`, borderRadius:10, padding:'10px 12px', fontSize:14, fontFamily:'inherit', outline:'none', background:'white', color:C.text }
  const labelStyle = { display:'block', fontSize:12, fontWeight:700, color:C.muted, marginBottom:6 }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:200, padding:16 }}>
      <div style={{ background:'white', borderRadius:20, width:'100%', maxWidth:480, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ padding:'18px 20px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, background:'white', zIndex:1 }}>
          <div><h3 style={{ fontWeight:800, fontSize:17, color:C.text }}>Nueva limpieza</h3>
               <p style={{ fontSize:12, color:C.muted, marginTop:2 }}>Solicita un servicio para uno de tus pisos</p></div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, color:C.muted, cursor:'pointer' }}>✕</button>
        </div>
        <form onSubmit={enviar} style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:16 }}>
          <div><label style={labelStyle}>Propiedad *</label>
            <select value={propiedadId} onChange={e=>setPropiedadId(e.target.value)} style={inputStyle as any}>
              <option value="">— Elige propiedad —</option>
              {propsActivas.map((p:any)=><option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select></div>

          <div style={{ display:'flex', gap:10 }}>
            <div style={{ flex:1 }}><label style={labelStyle}>Fecha *</label>
              <input type="date" value={fecha} min={HOY} onChange={e=>setFecha(e.target.value)} style={inputStyle as any} /></div>
            <div style={{ flex:1 }}><label style={labelStyle}>Huéspedes</label>
              <input type="number" min={0} value={huespedes} onChange={e=>setHuespedes(e.target.value)} placeholder="—" style={inputStyle as any} /></div>
          </div>

          <div><label style={labelStyle}>Tipo de servicio</label>
            <select value={tipo} onChange={e=>setTipo(e.target.value)} style={inputStyle as any}>
              {TIPOS_SERVICIO.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
            </select></div>

          <div style={{ display:'flex', gap:10 }}>
            <div style={{ flex:1 }}><label style={labelStyle}>🚪 Salida huésped</label>
              <input type="time" value={horaOut} onChange={e=>setHoraOut(e.target.value)} style={inputStyle as any} /></div>
            <div style={{ flex:1 }}><label style={labelStyle}>🔑 Entrada siguiente</label>
              <input type="time" value={horaIn} onChange={e=>setHoraIn(e.target.value)} style={inputStyle as any} /></div>
          </div>

          <div><label style={labelStyle}>Notas para el equipo</label>
            <textarea value={notas} onChange={e=>setNotas(e.target.value)} rows={3} placeholder="Ej: dejar toallas extra, revisar terraza..."
              style={{ ...(inputStyle as any), resize:'none' }} /></div>

          <div style={{ background:C.light, borderRadius:10, padding:'10px 14px', fontSize:12, color:C.brand }}>💡 Tu empresa de limpieza recibirá la solicitud y asignará una limpiadora.</div>
          {error && <p style={{ color:C.red, fontSize:13 }}>{error}</p>}
          <div style={{ display:'flex', gap:10 }}>
            <button type="button" onClick={onClose} style={{ flex:1, padding:12, borderRadius:10, border:`1px solid ${C.border}`, background:'white', color:C.muted, fontSize:13, cursor:'pointer' }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{ flex:2, padding:12, borderRadius:10, border:'none', background:C.primary, color:'white', fontSize:13, fontWeight:700, cursor:'pointer', opacity:loading?0.5:1 }}>
              {loading?'Creando...':'✓ Crear limpieza'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── TARJETA HOY (expandible con datos de reserva) ───────────────────────────
function SesionCardHoy({ p, token, ingresosPorPropiedad, onChat, onChecklist, onQueja, quejaEnviada }: any) {
  const [open, setOpen] = useState(false)
  const e = ESTADO_CFG[p.estado_hoy||'pendiente'] || ESTADO_CFG.pendiente
  const nombre = p.nombre || '—'
  const sid = p.sesion_id
  const qEnv = quejaEnviada?.has(p.id)
  const puedeVer = true

  // Buscar ingresos de hoy para esta propiedad
  const ingresos: any[] = (ingresosPorPropiedad[p.id] || [])
  const ingresoHoy = ingresos.find((i: any) => i.fecha === HOY) || ingresos[0] || null
  const bruto  = ingresoHoy?.importe || null
  const neto   = bruto ? Math.round(bruto * 0.8028 * 100) / 100 : null
  const portal = ingresoHoy?.portal || null
  const noches = ingresoHoy?.num_noches || null

  const hcheckout = p.hora_checkout ? String(p.hora_checkout).slice(0,5) : null
  const hcheckin  = p.hora_checkin_siguiente ? String(p.hora_checkin_siguiente).slice(0,5) : null

  return (
    <div style={{ background:'white', borderRadius:14, border:`1px solid ${C.border}`,
      overflow:'hidden', boxShadow:open?'0 4px 16px rgba(0,0,0,0.10)':'0 1px 3px rgba(0,0,0,0.04)',
      transition:'box-shadow .2s' }}>

      {/* Cabecera de estado */}
      <div style={{ background:e.bg, borderBottom:`1px solid ${e.border}`, padding:'7px 14px',
        display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:7, height:7, borderRadius:'50%', background:e.dot }} />
          <span style={{ fontSize:12, fontWeight:700, color:e.color }}>{e.label}</span>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {sid && puedeVer && (
            <button onClick={e2=>{ e2.stopPropagation(); onChecklist?.({id:sid,titulo:nombre}) }}
              style={{ padding:'3px 8px', borderRadius:7, border:`1px solid ${C.border}`, background:'white', color:C.muted, fontSize:12, cursor:'pointer' }}>🔍</button>
          )}
          {sid && (
            <button onClick={e2=>{ e2.stopPropagation(); onChat?.({id:sid,titulo:nombre}) }}
              style={{ padding:'3px 8px', borderRadius:7, border:`1px solid ${C.brand}`, background:C.light, color:C.brand, fontSize:12, fontWeight:700, cursor:'pointer' }}>💬</button>
          )}
        </div>
      </div>

      {/* Cuerpo clickable */}
      <div onClick={() => setOpen(o => !o)} style={{ padding:'12px 14px', cursor:'pointer', userSelect:'none' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontWeight:700, fontSize:15, color:C.text }}>{nombre}</div>
            {p.direccion && <div style={{ fontSize:12, color:C.muted, marginTop:1 }}>📍 {p.direccion}</div>}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {bruto && <span style={{ fontSize:13, fontWeight:700, color:C.primary }}>{fmt(bruto)}</span>}
            <span style={{ color:C.muted, fontSize:13, display:'inline-block',
              transform:open?'rotate(180deg)':'rotate(0)', transition:'transform .2s' }}>▾</span>
          </div>
        </div>

        {/* Timeline compacta (visible siempre) */}
        {(hcheckout || hcheckin) && (
          <div style={{ display:'flex', gap:6, alignItems:'center', marginTop:8,
            background:C.light, borderRadius:8, padding:'5px 10px' }}>
            {hcheckout && <span style={{ fontSize:11, color:C.primary, fontWeight:600 }}>🚪 {hcheckout}</span>}
            {hcheckout && hcheckin && <span style={{ color:C.brand, fontSize:12 }}>→</span>}
            {hcheckin  && <span style={{ fontSize:11, color:C.primary, fontWeight:600 }}>🔑 {hcheckin}</span>}
            {portal && <span style={{ marginLeft:'auto' }}><PortalChip portal={portal} /></span>}
          </div>
        )}
      </div>

      {/* Panel expandido */}
      {open && (
        <div style={{ borderTop:`1px solid ${C.border}`, padding:'12px 14px 14px' }}>

          {/* KPIs de la reserva */}
          {(bruto || portal || noches) && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
              <div style={{ background:C.light, borderRadius:10, padding:'8px 10px', textAlign:'center' }}>
                <div style={{ fontSize:10, color:C.muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>Bruto</div>
                <div style={{ fontSize:16, fontWeight:800, color:C.primary, marginTop:2 }}>{bruto ? fmt(bruto) : '—'}</div>
              </div>
              <div style={{ background:C.light, borderRadius:10, padding:'8px 10px', textAlign:'center' }}>
                <div style={{ fontSize:10, color:C.muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>Neto</div>
                <div style={{ fontSize:16, fontWeight:800, color:C.primary, marginTop:2 }}>{neto ? fmt(neto) : '—'}</div>
              </div>
              <div style={{ background:C.light, borderRadius:10, padding:'8px 10px', textAlign:'center' }}>
                <div style={{ fontSize:10, color:C.muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>Noches</div>
                <div style={{ fontSize:16, fontWeight:800, color:C.primary, marginTop:2 }}>{noches ?? '—'}</div>
              </div>
            </div>
          )}

          {/* Portal + limpiadora */}
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12 }}>
            {portal && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                background:C.bg, borderRadius:8, padding:'7px 12px' }}>
                <span style={{ fontSize:12, color:C.muted, fontWeight:500 }}>Portal</span>
                <PortalChip portal={portal} />
              </div>
            )}
            {p.limpiadora_nombre && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                background:C.bg, borderRadius:8, padding:'7px 12px' }}>
                <span style={{ fontSize:12, color:C.muted, fontWeight:500 }}>Limpiadora</span>
                <span style={{ fontSize:12, fontWeight:600, color:C.text }}>🧹 {p.limpiadora_nombre}</span>
              </div>
            )}
            {p.num_huespedes > 0 && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                background:C.bg, borderRadius:8, padding:'7px 12px' }}>
                <span style={{ fontSize:12, color:C.muted, fontWeight:500 }}>Huéspedes</span>
                <span style={{ fontSize:12, fontWeight:600, color:C.text }}>👥 {p.num_huespedes}</span>
              </div>
            )}
          </div>

          {/* Queja */}
          {(p.estado_hoy === 'completada') && (
            qEnv
              ? <div style={{ marginBottom:10, background:C.warnBg, border:`1px solid ${C.warnBorder}`, borderRadius:10, padding:'8px 14px', fontSize:12, color:C.warn, fontWeight:600, textAlign:'center' }}>⚠️ Queja enviada</div>
              : <button onClick={() => onQueja?.(p)} style={{ marginBottom:10, width:'100%', padding:8, borderRadius:10, border:`1px solid ${C.redBg}`, background:'white', color:C.red, fontSize:12, fontWeight:700, cursor:'pointer' }}>⚠️ El huésped tiene una queja</button>
          )}

          {/* Acciones */}
          <div style={{ display:'flex', gap:8 }}>
            {sid && (
              <button onClick={() => onChecklist?.({id:sid,titulo:nombre})}
                style={{ flex:1, padding:'9px 0', borderRadius:10, border:`1px solid ${C.border}`, background:C.bg, color:C.muted, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                🔍 Checklist
              </button>
            )}
            {sid && (
              <button onClick={() => onChat?.({id:sid,titulo:nombre})}
                style={{ flex:1, padding:'9px 0', borderRadius:10, border:`1px solid ${C.brand}`, background:C.light, color:C.brand, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                💬 Chat sesión
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TARJETA RESERVAS (tab reservas, sin cambios) ────────────────────────────
function SesionCard({ s, token, permisos, onChat, onChecklist, onQueja, quejaEnviada, compact=false }: any) {
  const e    = ESTADO_CFG[s.estado_hoy||s.estado] || ESTADO_CFG.pendiente
  const qEnv = quejaEnviada?.has(s.id)
  const sid  = s.sesion_id || s.id
  const nombre = s.nombre || s.propiedad_nombre || s.property_name || '—'
  const puedeVer = permisos?.ver_checklist || permisos?.ver_fotos
  const fmtFecha = (d: string) => {
    if (!d) return ''
    const dt = new Date(d + 'T12:00:00'); const hoy = new Date(); hoy.setHours(0,0,0,0)
    const dif = Math.round((dt.getTime()-hoy.getTime())/86400000)
    if (dif===0) return 'Hoy'; if (dif===1) return 'Mañana'; if (dif===-1) return 'Ayer'
    if (dif>0&&dif<7) return `En ${dif}d`
    return dt.toLocaleDateString('es-ES',{day:'numeric',month:'short'})
  }
  return (
    <div style={{ background:'white', borderRadius:14, border:`1px solid ${C.border}`, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ background:e.bg, borderBottom:`1px solid ${e.border}`, padding:'8px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:7, height:7, borderRadius:'50%', background:e.dot }} />
          <span style={{ fontSize:12, fontWeight:700, color:e.color }}>{e.label}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {s.session_date && <span style={{ fontSize:11, color:C.muted, fontWeight:600 }}>{fmtFecha(s.session_date)}</span>}
          {sid && puedeVer && (
            <button onClick={() => onChecklist?.({id:sid,titulo:nombre})}
              style={{ padding:'3px 8px', borderRadius:7, border:`1px solid ${C.border}`, background:'white', color:C.muted, fontSize:12, cursor:'pointer' }}>🔍</button>
          )}
          {sid && (
            <button onClick={() => onChat?.({id:sid,titulo:nombre})}
              style={{ padding:'3px 8px', borderRadius:7, border:`1px solid ${C.brand}`, background:C.light, color:C.brand, fontSize:12, fontWeight:700, cursor:'pointer' }}>💬</button>
          )}
        </div>
      </div>
      <div style={{ padding:'12px 14px' }}>
        <div style={{ fontWeight:700, fontSize:15, color:C.text, marginBottom:2 }}>{nombre}</div>
        {s.direccion && <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>📍 {s.direccion}</div>}
        {(s.hora_checkout||s.hora_checkin_siguiente) && (
          <div style={{ display:'flex', gap:8, alignItems:'center', background:C.light, borderRadius:8, padding:'5px 10px', marginBottom:8 }}>
            {s.hora_checkout && <span style={{ fontSize:11, color:C.primary, fontWeight:600 }}>🚪 {String(s.hora_checkout).slice(0,5)}</span>}
            {s.hora_checkout&&s.hora_checkin_siguiente && <span style={{ color:C.brand }}>→</span>}
            {s.hora_checkin_siguiente && <span style={{ fontSize:11, color:C.primary, fontWeight:600 }}>🔑 {String(s.hora_checkin_siguiente).slice(0,5)}</span>}
          </div>
        )}
        {s.limpiadora_nombre && <div style={{ fontSize:12, color:C.muted }}>{s.limpiadora_nombre}</div>}
        {!compact && s.num_huespedes>0 && <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>👥 {s.num_huespedes} huéspedes</div>}
        {!compact && (s.estado_hoy==='completada'||s.estado==='completada') && (
          qEnv
            ? <div style={{ marginTop:8, background:C.warnBg, border:`1px solid ${C.warnBorder}`, borderRadius:10, padding:'8px 14px', fontSize:12, color:C.warn, fontWeight:600, textAlign:'center' }}>⚠️ Queja enviada</div>
            : <button onClick={()=>onQueja?.(s)} style={{ marginTop:8, width:'100%', padding:8, borderRadius:10, border:`1px solid ${C.redBg}`, background:'white', color:C.red, fontSize:12, fontWeight:700, cursor:'pointer' }}>⚠️ El huésped tiene una queja</button>
        )}
      </div>
    </div>
  )
}

function Seccion({ titulo, items, defaultOpen=true, children }: any) {
  const [open, setOpen] = useState(defaultOpen)
  if (items===0) return null
  return (
    <div>
      <button onClick={()=>setOpen(o=>!o)}
        style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0 8px', background:'transparent', border:'none', cursor:'pointer', fontFamily:'inherit' }}>
        <span style={{ fontSize:13, fontWeight:800, color:C.muted, textTransform:'uppercase', letterSpacing:'0.05em' }}>
          {titulo} <span style={{ fontWeight:500, marginLeft:4 }}>({items})</span>
        </span>
        <span style={{ color:C.muted, fontSize:14, display:'inline-block', transform:open?'rotate(0)':'rotate(-90deg)', transition:'transform .2s' }}>▾</span>
      </button>
      {open && children}
    </div>
  )
}

function FiltrosBarra({ propiedades, filtroProp, setFiltroProp, filtroEstado, setFiltroEstado,
                        rangoId, setRangoId, fechaDesde, setFechaDesde, fechaHasta, setFechaHasta,
                        total, filtradas }: any) {
  const hayFiltro = filtroProp!=='todas' || filtroEstado!=='todas' || rangoId!=='todo'
  return (
    <div style={{ background:'white', borderBottom:`1px solid ${C.border}`, padding:'10px 14px', display:'flex', flexDirection:'column', gap:8 }}>
      <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:1 }}>
        <button onClick={()=>setFiltroProp('todas')}
          style={{ flexShrink:0, padding:'5px 12px', borderRadius:20, border:`1.5px solid ${filtroProp==='todas'?C.primary:C.border}`,
            background:filtroProp==='todas'?C.primary:'white', color:filtroProp==='todas'?'white':C.text,
            fontSize:12, fontWeight:filtroProp==='todas'?700:500, cursor:'pointer', fontFamily:'inherit' }}>
          Todos
        </button>
        {propiedades.map((p:string) => (
          <button key={p} onClick={()=>setFiltroProp(p)}
            style={{ flexShrink:0, padding:'5px 12px', borderRadius:20, border:`1.5px solid ${filtroProp===p?C.primary:C.border}`,
              background:filtroProp===p?C.primary:'white', color:filtroProp===p?'white':C.text,
              fontSize:12, fontWeight:filtroProp===p?700:500, cursor:'pointer', fontFamily:'inherit',
              maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {p}
          </button>
        ))}
      </div>
      <div style={{ display:'flex', gap:6, overflowX:'auto' }}>
        {ESTADO_FILTROS.map(f => (
          <button key={f.id} onClick={()=>setFiltroEstado(f.id)}
            style={{ flexShrink:0, padding:'4px 10px', borderRadius:20,
              border:`1.5px solid ${filtroEstado===f.id?C.brand:C.border}`,
              background:filtroEstado===f.id?C.light:'white',
              color:filtroEstado===f.id?C.brand:C.muted,
              fontSize:11, fontWeight:filtroEstado===f.id?700:400, cursor:'pointer', fontFamily:'inherit' }}>
            {f.label}
          </button>
        ))}
      </div>
      <div style={{ display:'flex', gap:6, overflowX:'auto', alignItems:'center' }}>
        <span style={{ fontSize:11, color:C.muted, flexShrink:0 }}>📅</span>
        {RANGOS_RAPIDOS.filter(r=>r.id!=='custom').map(r => (
          <button key={r.id} onClick={()=>{ setRangoId(r.id) }}
            style={{ flexShrink:0, padding:'4px 10px', borderRadius:20,
              border:`1.5px solid ${rangoId===r.id?C.primary:C.border}`,
              background:rangoId===r.id?C.light:'white',
              color:rangoId===r.id?C.primary:C.muted,
              fontSize:11, fontWeight:rangoId===r.id?700:400, cursor:'pointer', fontFamily:'inherit' }}>
            {r.label}
          </button>
        ))}
        <button onClick={()=>setRangoId(rangoId==='custom'?'todo':'custom')}
          style={{ flexShrink:0, padding:'4px 10px', borderRadius:20,
            border:`1.5px solid ${rangoId==='custom'?C.primary:C.border}`,
            background:rangoId==='custom'?C.light:'white',
            color:rangoId==='custom'?C.primary:C.muted,
            fontSize:11, fontWeight:rangoId==='custom'?700:400, cursor:'pointer', fontFamily:'inherit' }}>
          ✏️ Fechas
        </button>
      </div>
      {rangoId === 'custom' && (
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input type="date" value={fechaDesde} onChange={e=>setFechaDesde(e.target.value)}
            style={{ flex:1, border:`1px solid ${C.border}`, borderRadius:8, padding:'6px 10px', fontSize:12, fontFamily:'inherit', outline:'none', color:C.text }} />
          <span style={{ color:C.muted, fontSize:12, flexShrink:0 }}>→</span>
          <input type="date" value={fechaHasta} onChange={e=>setFechaHasta(e.target.value)}
            style={{ flex:1, border:`1px solid ${C.border}`, borderRadius:8, padding:'6px 10px', fontSize:12, fontFamily:'inherit', outline:'none', color:C.text }} />
        </div>
      )}
      {hayFiltro && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:11, color:C.muted }}>{filtradas} de {total} reservas</span>
          <button onClick={()=>{ setFiltroProp('todas'); setFiltroEstado('todas'); setRangoId('todo') }}
            style={{ fontSize:11, color:C.brand, background:'none', border:'none', cursor:'pointer', fontWeight:600, fontFamily:'inherit' }}>
            Quitar filtros ×
          </button>
        </div>
      )}
    </div>
  )
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function PropietarioClient({ cliente, propiedades, historial, token, permisos, sesionPropia }: any) {
  const [tab, setTab]     = useState<'hoy'|'reservas'|'calendario'|'finanzas'|'docs'|'acceso'|'chat'>('hoy')
  const [menuOpen, setMenu] = useState(false)
  const [quejaModal, setQueja]          = useState<any>(null)
  const [firmaModal, setFirma]          = useState<any>(null)
  const [quejaEnviada, setQuejaEnviada] = useState<Set<string>>(new Set())
  const [chatSesion, setChatSesion]     = useState<{id:string;titulo:string}|null>(null)
  const [checklistSesion,setChecklist]  = useState<{id:string;titulo:string}|null>(null)
  const [nuevaModal, setNuevaModal]     = useState(false)

  const [reservas, setReservas]     = useState<any[]>([])
  const [loadingRes, setLoadingRes] = useState(false)

  // Ingresos de hoy (para KPIs y tarjetas)
  const [ingresosHoy, setIngresosHoy]   = useState<any[]>([])
  const [loadingIngresos, setLoadingIngresos] = useState(false)

  const [filtroProp,   setFiltroProp]   = useState('todas')
  const [filtroEstado, setFiltroEstado] = useState('todas')
  const [rangoId,      setRangoId]      = useState('todo')
  const [fechaDesde,   setFechaDesde]   = useState(HOY)
  const [fechaHasta,   setFechaHasta]   = useState(addDays(HOY, 30))

  // Cargar ingresos del mes actual para tener los de hoy
  useEffect(() => {
    if (loadingIngresos || ingresosHoy.length > 0) return
    setLoadingIngresos(true)
    const anio = new Date().getFullYear()
    fetch(`/api/propietario/${token}/contabilidad?anio=${anio}`)
      .then(r => r.json())
      .then(d => {
        const todos: any[] = d.ingresos || []
        setIngresosHoy(todos)
        setLoadingIngresos(false)
      })
      .catch(() => setLoadingIngresos(false))
  }, [token])

  // Ingresos de hoy agrupados por propiedad_id
  const ingresosPorPropiedad = useMemo(() => {
    const map: Record<string, any[]> = {}
    ingresosHoy.forEach(i => {
      const pid = i.propiedad_id || '__sin__'
      if (!map[pid]) map[pid] = []
      map[pid].push(i)
    })
    return map
  }, [ingresosHoy])

  // KPIs del día
  const kpiHoy = useMemo(() => {
    const hoyIngresos = ingresosHoy.filter(i => i.fecha === HOY)
    const bruto = hoyIngresos.reduce((a, i) => a + (i.importe || 0), 0)
    const neto  = Math.round(bruto * 0.8028 * 100) / 100
    return { bruto, neto, count: hoyIngresos.length }
  }, [ingresosHoy])

  const cargarReservas = () => {
    setLoadingRes(true)
    fetch(`/api/propietario/${token}/sesiones`)
      .then(r=>r.json())
      .then(d=>{ setReservas(d.sesiones||[]); setLoadingRes(false) })
      .catch(()=>setLoadingRes(false))
  }

  useEffect(() => {
    if (tab==='reservas' && reservas.length===0 && !loadingRes) cargarReservas()
  }, [tab])

  const propiedadesUnicas = useMemo(() => {
    const set = new Set<string>()
    reservas.forEach(s => { const n=s.propiedad_nombre||s.property_name; if(n&&n!=='None') set.add(n) })
    return Array.from(set).sort()
  }, [reservas])

  const reservasFiltradas = useMemo(() => {
    const rango = rangoId==='custom' ? { desde:fechaDesde, hasta:fechaHasta } : rangoFechas(rangoId)
    return reservas.filter(s => {
      const nombre = s.propiedad_nombre||s.property_name||''
      if (filtroProp!=='todas' && nombre!==filtroProp) return false
      if (filtroEstado!=='todas' && s.estado!==filtroEstado) return false
      if (rango) {
        if (s.session_date < rango.desde || s.session_date > rango.hasta) return false
      }
      return true
    })
  }, [reservas, filtroProp, filtroEstado, rangoId, fechaDesde, fechaHasta])

  const hoyStr    = HOY
  const proximas  = reservasFiltradas.filter(s=>s.session_date>hoyStr)
  const deHoy     = reservasFiltradas.filter(s=>s.session_date===hoyStr)
  const recientes = reservasFiltradas.filter(s=>s.session_date<hoyStr).sort((a,b)=>b.session_date.localeCompare(a.session_date))

  const completadas = propiedades.filter((p:any)=>p.estado_hoy==='completada').length
  const currentItem = MENU_ITEMS.find(m=>m.id===tab)

  if (chatSesion) return (
    <div style={{ fontFamily:"'Nunito',-apple-system,sans-serif", minHeight:'100vh', maxWidth:480, margin:'0 auto' }}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}`}</style>
      <ChatSesionPropietario token={token} sesionId={chatSesion.id} miNombre={cliente.nombre}
        titulo={chatSesion.titulo} height="100vh" onClose={()=>setChatSesion(null)} />
    </div>
  )
  if (checklistSesion) return (
    <div style={{ fontFamily:"'Nunito',-apple-system,sans-serif", minHeight:'100vh', maxWidth:480, margin:'0 auto' }}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}`}</style>
      <ChecklistPropietario token={token} sesionId={checklistSesion.id}
        titulo={checklistSesion.titulo} onClose={()=>setChecklist(null)} />
    </div>
  )

  const cardProps = { token, permisos, onChat:setChatSesion, onChecklist:setChecklist, onQueja:setQueja, quejaEnviada }

  async function cerrarSesion() {
    try { await fetch('/api/propietario/auth/logout', { method:'POST' }) } catch {}
    window.location.href = '/propietario'
  }

  return (
    <div style={{ fontFamily:"'Nunito',-apple-system,sans-serif", background:C.bg, minHeight:'100vh', maxWidth:480, margin:'0 auto' }}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0} ::-webkit-scrollbar{display:none}`}</style>

      {/* ── Header ── */}
      <div style={{ background:C.primary, padding:'14px 16px 16px', position:'sticky', top:0, zIndex:50 }}>
        {/* Fila 1: logo + título + menú */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: tab==='hoy' ? 12 : 0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ display:"inline-block" }}>
              <LogoIalimp size={17} />
            </div>
            <div style={{ width:1, height:14, background:'rgba(255,255,255,.25)' }} />
            <div style={{ color:'white', fontSize:13, fontWeight:600 }}>{currentItem?.icon} {currentItem?.label}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:8, padding:'4px 10px', fontSize:12, color:'white', fontWeight:700 }}>
              {completadas}/{propiedades.length} ✓
            </div>
            {propiedades.length>0 && (
              <button onClick={()=>setNuevaModal(true)} aria-label="Nueva limpieza" title="Nueva limpieza"
                style={{ background:'white', border:'none', borderRadius:8, width:36, height:36, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:C.primary, fontSize:24, fontWeight:700, lineHeight:1 }}>
                +
              </button>
            )}
            <button onClick={()=>setMenu(true)}
              style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:36, height:36, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4 }}>
              {[0,1,2].map(i=><span key={i} style={{ display:'block', width:16, height:2, background:'white', borderRadius:2 }} />)}
            </button>
          </div>
        </div>

        {/* KPIs del día — solo en tab hoy */}
        {tab==='hoy' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6 }}>
            {[
              { val: propiedades.length,                  lbl: 'Pisos'   },
              { val: propiedades.filter((p:any)=>p.estado_hoy).length, lbl: 'Con limpieza' },
              { val: kpiHoy.bruto > 0 ? fmt(kpiHoy.bruto) : '—', lbl: 'Bruto hoy' },
              { val: kpiHoy.neto  > 0 ? fmt(kpiHoy.neto)  : '—', lbl: 'Neto hoy'  },
            ].map((k,i) => (
              <div key={i} style={{ background:'rgba(255,255,255,0.13)', borderRadius:10, padding:'8px 6px', textAlign:'center' }}>
                <div style={{ fontSize:i>1?13:18, fontWeight:800, color:'white', lineHeight:1 }}>{k.val}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.65)', marginTop:3 }}>{k.lbl}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filtros sticky — tab reservas */}
      {tab==='reservas' && !loadingRes && reservas.length>0 && (
        <div style={{ position:'sticky', top:64, zIndex:40 }}>
          <FiltrosBarra
            propiedades={propiedadesUnicas}
            filtroProp={filtroProp} setFiltroProp={setFiltroProp}
            filtroEstado={filtroEstado} setFiltroEstado={setFiltroEstado}
            rangoId={rangoId} setRangoId={setRangoId}
            fechaDesde={fechaDesde} setFechaDesde={setFechaDesde}
            fechaHasta={fechaHasta} setFechaHasta={setFechaHasta}
            total={reservas.length} filtradas={reservasFiltradas.length}
          />
        </div>
      )}

      {/* Drawer */}
      {menuOpen && (
        <>
          <div onClick={()=>setMenu(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:100, backdropFilter:'blur(2px)' }} />
          <div style={{ position:'fixed', top:0, right:0, bottom:0, width:240, background:'white', zIndex:101, display:'flex', flexDirection:'column', boxShadow:'-4px 0 24px rgba(0,0,0,0.15)', animation:'slideIn .2s ease' }}>
            <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
            <div style={{ background:C.primary, padding:'20px 20px 16px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
                <div style={{ fontFamily:"'Nunito',sans-serif", fontSize:18, fontWeight:800, color:'white' }}><LogoIalimp size={17} nombre={cliente.marca_nombre || cliente.empresa_nombre} logoUrl={cliente.logo_url} /></div>
                <button onClick={()=>setMenu(false)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:6, width:28, height:28, color:'white', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
              </div>
              <div style={{ color:'white', fontWeight:700, fontSize:13 }}>{cliente.nombre.split(' ').slice(0,2).join(' ')}</div>
              <div style={{ color:'rgba(255,255,255,0.6)', fontSize:11, marginTop:2 }}>{cliente.empresa_nombre}</div>
            </div>
            <nav style={{ flex:1, padding:'10px 0', overflowY:'auto' }}>
              {MENU_ITEMS.map(item => (
                <button key={item.id} onClick={()=>{ setTab(item.id as any); setMenu(false) }}
                  style={{ width:'100%', padding:'13px 20px', border:'none', background:tab===item.id?C.light:'transparent', display:'flex', alignItems:'center', gap:12, cursor:'pointer', borderLeft:`3px solid ${tab===item.id?C.primary:'transparent'}`, fontFamily:'inherit' }}>
                  <span style={{ fontSize:18, width:24, textAlign:'center' }}>{item.icon}</span>
                  <span style={{ fontSize:14, fontWeight:tab===item.id?700:500, color:tab===item.id?C.primary:C.text }}>{item.label}</span>
                  {tab===item.id && <span style={{ marginLeft:'auto', width:6, height:6, borderRadius:'50%', background:C.primary }} />}
                </button>
              ))}
            </nav>
            {sesionPropia && (
              <button onClick={cerrarSesion}
                style={{ margin:'0 16px 12px', padding:'12px', border:`1px solid ${C.border}`, background:'#fff', borderRadius:10, color:C.primary, fontFamily:'inherit', fontWeight:800, fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                ⎋ Cerrar sesión
              </button>
            )}
            <div style={{ padding:'14px 20px', borderTop:`1px solid ${C.border}`, fontSize:11, color:C.muted, textAlign:'center' }}>
              {cliente.empresa_nombre} · <span style={{ color:C.brand, fontWeight:600 }}>ialimp</span>
            </div>
          </div>
        </>
      )}

      {/* ── Contenido ── */}
      <div style={{ padding:14 }}>

        {/* TAB HOY */}
        {tab==='hoy' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {propiedades.length===0 && (
              <div style={{ textAlign:'center', padding:'48px 0', color:C.muted }}>
                <div style={{ fontSize:40, marginBottom:10 }}>🏠</div>
                <div style={{ fontWeight:600 }}>Sin limpiezas hoy</div>
              </div>
            )}
            {propiedades.map((p:any) => (
              <SesionCardHoy key={p.id} p={p}
                token={token}
                ingresosPorPropiedad={ingresosPorPropiedad}
                onChat={setChatSesion}
                onChecklist={setChecklist}
                onQueja={setQueja}
                quejaEnviada={quejaEnviada}
              />
            ))}
          </div>
        )}

        {/* TAB RESERVAS */}
        {tab==='reservas' && (
          <div>
            {loadingRes && (
              <div style={{ textAlign:'center', padding:'40px 0', color:C.muted }}>
                <div style={{ fontSize:28, marginBottom:8 }}>📆</div>
                <div style={{ fontSize:13, fontWeight:600 }}>Cargando...</div>
              </div>
            )}
            {!loadingRes && reservas.length===0 && (
              <div style={{ textAlign:'center', padding:'48px 0', color:C.muted }}>
                <div style={{ fontSize:40, marginBottom:10 }}>📆</div>
                <div style={{ fontWeight:600 }}>Sin reservas</div>
              </div>
            )}
            {!loadingRes && reservas.length>0 && (
              <>
                {reservasFiltradas.length===0 && (
                  <div style={{ textAlign:'center', padding:'40px 0', color:C.muted }}>
                    <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
                    <div style={{ fontWeight:600, marginBottom:8 }}>Sin resultados</div>
                    <button onClick={()=>{ setFiltroProp('todas'); setFiltroEstado('todas'); setRangoId('todo') }}
                      style={{ padding:'8px 18px', borderRadius:10, border:`1px solid ${C.border}`, background:'white', color:C.primary, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                      Quitar filtros
                    </button>
                  </div>
                )}
                {reservasFiltradas.length>0 && (
                  <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                    <Seccion titulo="🔜 Próximas" items={proximas.length} defaultOpen={true}>
                      <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
                        {proximas.map(s=><SesionCard key={s.id} s={s} {...cardProps} />)}
                      </div>
                    </Seccion>
                    <Seccion titulo="📅 Hoy" items={deHoy.length} defaultOpen={true}>
                      <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
                        {deHoy.map(s=><SesionCard key={s.id} s={s} {...cardProps} />)}
                      </div>
                    </Seccion>
                    <Seccion titulo="🕐 Recientes" items={recientes.length} defaultOpen={false}>
                      <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
                        {recientes.map(s=><SesionCard key={s.id} s={s} compact {...cardProps} />)}
                      </div>
                    </Seccion>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab==='calendario' && (
          <CalendarioIcal token={token} />
        )}

        {tab==='finanzas' && (
          <ContabilidadTab token={token} />
        )}

        {tab==='docs' && (
          <div>
            {/* Escáner de facturas con IA → genera apunte contable */}
            <p style={{ fontSize:13, color:C.muted, marginBottom:14, lineHeight:1.5 }}>Fotografía o sube facturas. La IA los analiza y genera el apunte contable.</p>
            <EscanerDocumento token={token} onGuardado={()=>{}} />

            {/* Archivador de documentos del piso (contrato, licencia VFT, seguro…) */}
            <div style={{ marginTop:24, paddingTop:20, borderTop:`1px solid ${C.border}` }}>
              <h3 style={{ fontSize:16, fontWeight:800, color:C.text, margin:'0 0 4px' }}>🗂️ Documentos del piso</h3>
              <p style={{ fontSize:13, color:C.muted, marginBottom:14, lineHeight:1.5 }}>
                Guarda aquí cualquier documento de cada piso: contrato de alquiler/explotación, licencia turística (VFT),
                seguro, escritura, IBI… Puedes ponerle fecha de caducidad y elegir si lo compartes con la empresa de limpieza.
              </p>
              {propiedades.map((p:any) => (
                <DocumentosPropiedad key={p.id} propiedadId={p.id} propiedadNombre={p.nombre} token={token}
                  documentosIniciales={p.documentos||[]} />
              ))}
            </div>
          </div>
        )}

        {tab==='acceso' && (
          <div>
            <p style={{ fontSize:13, color:C.muted, marginBottom:14, lineHeight:1.5 }}>Instrucciones de acceso para cada piso.</p>
            {propiedades.map((p:any) => (
              <AccesoPropiedad key={p.id} propiedadId={p.id} propiedadNombre={p.nombre} token={token}
                instruccionesIniciales={p.instrucciones_acceso||''} tipoAccesoInicial={p.tipo_acceso||'llave'}
                codigoAccesoInicial={p.codigo_acceso||''} archivosIniciales={p.archivos_acceso||[]} />
            ))}
          </div>
        )}

        {tab==='chat' && (
          <div style={{ margin:'-14px', height:'calc(100vh - 64px)' }}>
            <ChatSesionPropietario token={token} sesionId={null} miNombre={cliente.nombre}
              titulo="Chat con la empresa" height="calc(100vh - 64px)" />
          </div>
        )}
      </div>

      {quejaModal && (
        <QuejaModal sesion={quejaModal} token={token} onClose={()=>setQueja(null)}
          onSent={()=>{ setQuejaEnviada(s=>new Set([...s,quejaModal.id])); setQueja(null) }} />
      )}
      {firmaModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:150, padding:16 }}>
          <div style={{ background:'white', borderRadius:20, width:'100%', maxWidth:480 }}>
            <FirmaPad
              onFirmar={async (svg:string, nombre:string) => {
                await fetch('/api/propietario/'+token+'/firmar', { method:'POST', headers:{'Content-Type':'application/json'},
                  body: JSON.stringify({ sesion_id:firmaModal.sesion_id, firma_svg:svg, firmante_nombre:nombre }) })
                setFirma(null)
              }}
              onCancelar={()=>setFirma(null)} />
          </div>
        </div>
      )}

      {nuevaModal && (
        <NuevaReservaModal token={token} propiedades={propiedades}
          onClose={()=>setNuevaModal(false)}
          onCreated={()=>{ setNuevaModal(false); setTab('reservas'); cargarReservas() }} />
      )}
    </div>
  )
}

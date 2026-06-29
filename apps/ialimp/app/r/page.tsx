'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const C = {
  primary: '#16a34a', light: '#f0fdf4', border: '#d1fae5',
  text: '#1e293b', muted: '#64748b', bg: '#f8fafc',
  warn: '#d97706', warnBg: '#fffbeb',
  red: '#dc2626', redBg: '#fef2f2',
}

const TIPO_CFG: Record<string,{icon:string,label:string,color:string}> = {
  abrir_piso:        { icon:'🔑', label:'Abrir piso',        color:'#1d4ed8' },
  cerrar_piso:       { icon:'🔒', label:'Cerrar piso',       color:'#6d28d9' },
  recoger_ropa:      { icon:'👕', label:'Recoger ropa',      color:'#b45309' },
  entregar_material: { icon:'📦', label:'Entregar material', color:'#0f766e' },
  incidencia:        { icon:'⚠️', label:'Incidencia',        color:'#dc2626' },
  otro:              { icon:'📋', label:'Otra tarea',         color:'#475569' },
}

function fmtEta(min: number | null | undefined): string | null {
  if (!min) return null
  if (min < 2) return '< 1 min'
  if (min < 60) return `${min} min`
  return `${Math.floor(min/60)}h ${min%60}min`
}

// ── Item de checklist ──────────────────────────────────────────────────────
function CheckItem({ item, onChange, onFoto }: {
  item: any
  onChange: (id: string, completado: boolean) => void
  onFoto: (id: string) => void
}) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:`1px solid ${C.border}` }}>
      <button
        onClick={() => onChange(item.id, !item.completado)}
        style={{
          flexShrink:0, width:28, height:28, borderRadius:8,
          border:`2px solid ${item.completado ? C.primary : '#cbd5e1'}`,
          background: item.completado ? C.primary : 'white',
          cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:16, color:'white', fontWeight:700,
        }}
      >
        {item.completado ? '✓' : ''}
      </button>

      <div style={{ flex:1, minWidth:0 }}>
        <div style={{
          fontSize:14, fontWeight:600,
          color: item.completado ? C.muted : C.text,
          textDecoration: item.completado ? 'line-through' : 'none',
        }}>
          {item.texto}
          {item.obligatorio && !item.completado && <span style={{ color:C.red, marginLeft:4 }}>*</span>}
        </div>
        {item.foto_url && (
          <a href={item.foto_url} target="_blank" rel="noreferrer"
            style={{ fontSize:11, color:'#1d4ed8', display:'block', marginTop:2 }}>
            📷 Ver foto
          </a>
        )}
      </div>

      <button
        onClick={() => onFoto(item.id)}
        style={{
          flexShrink:0, width:36, height:36, borderRadius:10,
          border:`1.5px solid ${item.foto_url ? C.primary : C.border}`,
          background: item.foto_url ? '#dcfce7' : 'white',
          cursor:'pointer', fontSize:18,
          display:'flex', alignItems:'center', justifyContent:'center',
        }}
        title={item.requiere_foto ? 'Foto obligatoria' : 'Añadir foto'}
      >
        {item.foto_url ? '✅' : item.requiere_foto ? '📸' : '📷'}
      </button>
    </div>
  )
}

// ── Modal completar (con checklist) ────────────────────────────────────────
function ModalCompletar({ parada, onClose, onParadaCompletada }: {
  parada: any
  onClose: () => void
  onParadaCompletada: () => void
}) {
  const cfg = TIPO_CFG[parada.tipo] || TIPO_CFG.otro
  const [items,   setItems]   = useState<any[]>([])
  const [nota,    setNota]    = useState('')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState<string|null>(null)
  const fotoInputRef = useRef<HTMLInputElement>(null)
  const [fotoItemId, setFotoItemId] = useState<string|null>(null)

  useEffect(() => {
    fetch(`/api/r/paradas/items?parada_id=${parada.id}`)
      .then(r => r.json())
      .then(d => { setItems(d.items || []); setLoading(false) })
  }, [parada.id])

  async function toggleItem(id: string, completado: boolean) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, completado } : it))
    await fetch('/api/r/paradas/items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: id, completado }),
    })
  }

  function abrirCamara(id: string) {
    setFotoItemId(id)
    fotoInputRef.current?.click()
  }

  async function onFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !fotoItemId) return
    const form = new FormData()
    form.append('file', file)
    form.append('item_id', fotoItemId)
    form.append('parada_id', parada.id)
    const res  = await fetch('/api/r/upload-foto', { method:'POST', body:form })
    const data = await res.json()
    if (data.url) {
      await fetch('/api/r/paradas/items', {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ item_id:fotoItemId, completado:true, foto_url:data.url }),
      })
      setItems(prev => prev.map(it =>
        it.id === fotoItemId ? { ...it, foto_url:data.url, completado:true } : it
      ))
    }
    setFotoItemId(null)
    e.target.value = ''
  }

  async function confirmar() {
    setSaving(true); setErr(null)
    const res = await fetch('/api/r/paradas', {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ parada_id:parada.id, nota_completada:nota }),
    })
    if (!res.ok) {
      const d = await res.json()
      setErr(d.error || 'Error al completar')
      setSaving(false)
      return
    }
    setSaving(false); onParadaCompletada(); onClose()
  }

  const obligPendientes = items.filter(it => it.obligatorio && !it.completado).length
  const fotosPendientes = items.filter(it => it.requiere_foto && !it.foto_url).length
  const puedeCompletar  = obligPendientes === 0 && fotosPendientes === 0

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:100, display:'flex', alignItems:'flex-end' }}
      onClick={onClose}>
      <div style={{ background:'white', borderRadius:'20px 20px 0 0', width:'100%', maxHeight:'90vh', display:'flex', flexDirection:'column' }}
        onClick={e => e.stopPropagation()}>

        {/* Handle + cabecera */}
        <div style={{ padding:'16px 20px 0', flexShrink:0 }}>
          <div style={{ width:40, height:4, background:'#e2e8f0', borderRadius:4, margin:'0 auto 16px' }} />
          <div style={{ fontSize:18, fontWeight:800, color:C.text }}>{cfg.icon} {parada.titulo}</div>
          <div style={{ fontSize:13, color:C.muted, marginTop:2 }}>{cfg.label}</div>
        </div>

        {/* Cuerpo scrollable */}
        <div style={{ flex:1, overflowY:'auto', padding:'0 20px' }}>
          {loading ? (
            <div style={{ textAlign:'center', padding:'32px 0', color:C.muted }}>Cargando checklist...</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign:'center', padding:'24px 0', color:C.muted, fontSize:13 }}>
              Sin checklist — puedes completar directamente.
            </div>
          ) : (
            <div style={{ marginTop:8 }}>
              <div style={{ fontSize:11, fontWeight:800, color:C.muted, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>
                Checklist ({items.filter(i=>i.completado).length}/{items.length})
              </div>
              {items.map(it => (
                <CheckItem key={it.id} item={it} onChange={toggleItem} onFoto={abrirCamara} />
              ))}
            </div>
          )}

          <div style={{ marginTop:16 }}>
            <textarea
              value={nota} onChange={e => setNota(e.target.value)}
              placeholder="Nota opcional (p.ej. 'llave dejada en buzón')"
              style={{ width:'100%', minHeight:72, padding:'10px 12px', borderRadius:12, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit', resize:'none', outline:'none', color:C.text }}
            />
          </div>

          {(obligPendientes > 0 || fotosPendientes > 0) && (
            <div style={{ marginTop:8, padding:'8px 12px', borderRadius:10, background:'#fef2f2', border:'1px solid #fecaca', fontSize:13, color:C.red, fontWeight:600 }}>
              {obligPendientes > 0 && `⚠️ ${obligPendientes} item${obligPendientes>1?'s':''} obligatorio${obligPendientes>1?'s':''} sin marcar. `}
              {fotosPendientes > 0 && `📸 ${fotosPendientes} foto${fotosPendientes>1?'s':''} requerida${fotosPendientes>1?'s':''} pendiente${fotosPendientes>1?'s':''}.`}
            </div>
          )}
          {err && (
            <div style={{ marginTop:8, padding:'8px 12px', borderRadius:10, background:'#fef2f2', fontSize:13, color:C.red, fontWeight:600 }}>{err}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 20px 28px', flexShrink:0 }}>
          <button onClick={confirmar} disabled={!puedeCompletar || saving}
            style={{
              width:'100%', padding:14, borderRadius:14,
              background: puedeCompletar ? `linear-gradient(135deg,${cfg.color},${cfg.color}cc)` : '#e2e8f0',
              color: puedeCompletar ? 'white' : '#94a3b8',
              fontSize:15, fontWeight:800, border:'none',
              cursor: puedeCompletar ? 'pointer' : 'not-allowed',
              fontFamily:'inherit', minHeight:52,
            }}>
            {saving ? 'Guardando...' : puedeCompletar
              ? `${cfg.icon} Completar parada`
              : `Completa el checklist (${obligPendientes+fotosPendientes} pendiente${obligPendientes+fotosPendientes>1?'s':''})`}
          </button>
          <button onClick={onClose}
            style={{ marginTop:8, width:'100%', padding:10, borderRadius:12, background:'transparent', color:C.muted, fontSize:14, fontWeight:600, border:`1px solid ${C.border}`, cursor:'pointer', fontFamily:'inherit' }}>
            Cancelar
          </button>
        </div>

        <input ref={fotoInputRef} type="file" accept="image/*" capture="environment"
          style={{ display:'none' }} onChange={onFotoChange} />
      </div>
    </div>
  )
}

// ── Tarjeta de parada ──────────────────────────────────────────────────────
function ParadaCard({ p, onCompletar }: { p: any, onCompletar: (p: any) => void }) {
  const cfg = TIPO_CFG[p.tipo] || TIPO_CFG.otro
  const eta = fmtEta(p.eta_minutos)
  const tieneItems = p.items_total > 0

  return (
    <div style={{
      background: p.completada ? '#f0fdf4' : 'white',
      borderRadius:16, border:`1.5px solid ${p.completada ? '#86efac' : C.border}`,
      overflow:'hidden', opacity: p.completada ? 0.7 : 1,
      boxShadow: p.completada ? 'none' : '0 2px 8px rgba(0,0,0,.06)',
    }}>
      {/* Cabecera */}
      <div style={{ background: p.completada ? '#dcfce7' : '#f8fafc', borderBottom:`1px solid ${p.completada ? '#86efac' : C.border}`, padding:'8px 14px', display:'flex', alignItems:'center', gap:8, justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:18 }}>{cfg.icon}</span>
          <span style={{ fontSize:12, fontWeight:700, color: p.completada ? '#16a34a' : cfg.color }}>{cfg.label}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
          {eta && !p.completada && (
            <span style={{ fontSize:11, background:'#eff6ff', color:'#1d4ed8', borderRadius:8, padding:'2px 8px', fontWeight:700 }}>🗺 {eta}</span>
          )}
          {tieneItems && (
            <span style={{
              fontSize:11, borderRadius:8, padding:'2px 8px', fontWeight:700,
              background: p.completada || p.items_ok === p.items_total ? '#dcfce7' : '#fef9c3',
              color: p.completada || p.items_ok === p.items_total ? '#16a34a' : '#854d0e',
            }}>
              ✓ {p.items_ok}/{p.items_total}
            </span>
          )}
          {p.completada && <span style={{ fontSize:11, color:'#16a34a', fontWeight:700 }}>✓ Completada</span>}
          {!p.completada && <span style={{ fontSize:11, color:C.muted, fontWeight:600 }}>#{p.orden+1}</span>}
        </div>
      </div>

      {/* Cuerpo */}
      <div style={{ padding:'12px 14px' }}>
        <div style={{ fontWeight:800, fontSize:15, color:C.text, marginBottom:2 }}>{p.titulo}</div>
        {p.propiedad_nombre && <div style={{ fontSize:12, color:C.muted, marginBottom:2 }}>🏠 {p.propiedad_nombre}</div>}
        {p.direccion && (
          <a href={`https://maps.google.com/?q=${encodeURIComponent(p.direccion)}`}
            target="_blank" rel="noreferrer"
            style={{ fontSize:12, color:'#1d4ed8', display:'block', marginBottom:4, textDecoration:'none', fontWeight:600 }}>
            📍 {p.direccion} ↗
          </a>
        )}
        {p.limpiadora_nombre && <div style={{ fontSize:12, color:C.muted, marginBottom:4 }}>🧹 {p.limpiadora_nombre}</div>}
        {p.notas && (
          <div style={{ fontSize:12, color:C.muted, background:C.bg, borderRadius:8, padding:'6px 10px', marginTop:4 }}>
            📝 {p.notas}
          </div>
        )}
        {p.completada && p.nota_completada && (
          <div style={{ marginTop:8, fontSize:12, color:'#16a34a', fontStyle:'italic' }}>"{p.nota_completada}"</div>
        )}
        {!p.completada && (
          <button onClick={() => onCompletar(p)}
            style={{ marginTop:12, width:'100%', padding:11, borderRadius:12, background:`linear-gradient(135deg,${cfg.color},${cfg.color}cc)`, color:'white', fontSize:14, fontWeight:800, border:'none', cursor:'pointer', fontFamily:'inherit', minHeight:44 }}>
            {tieneItems ? `${cfg.icon} Ver checklist y completar` : `${cfg.icon} Marcar como hecha`}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────
export default function RepartidorPage() {
  const router = useRouter()
  const [rep,      setRep]      = useState<any>(null)
  const [paradas,  setParadas]  = useState<any[]>([])
  const [notifs,   setNotifs]   = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState<any>(null)
  const [geoError, setGeoError] = useState<string|null>(null)
  const watchRef    = useRef<number|null>(null)
  const lastPosSent = useRef<number>(0)

  useEffect(() => {
    fetch('/api/r/auth').then(r => r.json()).then(d => {
      if (!d.repartidor) { router.replace('/r/login'); return }
      setRep(d.repartidor)
      cargarParadas()
      cargarNotifs()
    })
  }, [])

  const cargarParadas = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/r/paradas')
    if (res.ok) { const d = await res.json(); setParadas(d.paradas || []) }
    setLoading(false)
  }, [])

  const cargarNotifs = useCallback(async () => {
    const res = await fetch('/api/r/notificaciones')
    if (res.ok) { const d = await res.json(); setNotifs(d.notificaciones || []) }
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) { setGeoError('Tu dispositivo no soporta geolocalización'); return }
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now()
        if (now - lastPosSent.current < 30_000) return
        lastPosSent.current = now
        fetch('/api/r/posicion', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ lat:pos.coords.latitude, lng:pos.coords.longitude, precision_m:pos.coords.accuracy, speed_kmh: pos.coords.speed ? pos.coords.speed*3.6 : null }),
        }).then(r => r.ok ? r.json() : null).then(d => {
          if (d?.eta_minutos != null)
            setParadas(prev => prev.map(p => !p.completada ? { ...p, eta_minutos:d.eta_minutos } : p))
        })
      },
      (err) => { if (err.code === 1) setGeoError('Permiso de ubicación denegado') },
      { enableHighAccuracy:true, maximumAge:15_000, timeout:20_000 }
    )
    return () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current) }
  }, [])

  useEffect(() => {
    const iv = setInterval(cargarNotifs, 45_000)
    return () => clearInterval(iv)
  }, [])

  async function logout() {
    await fetch('/api/r/auth', { method:'DELETE' })
    router.replace('/r/login')
  }

  const pendientes   = paradas.filter(p => !p.completada)
  const completadas  = paradas.filter(p =>  p.completada)
  const notifsNuevas = notifs.filter(n => !n.leida)

  if (loading && !rep) return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:C.bg, fontFamily:"'Nunito',sans-serif" }}>
      <div style={{ textAlign:'center', color:C.muted }}>
        <div style={{ fontSize:32 }}>🚐</div>
        <div style={{ fontWeight:600, marginTop:8 }}>Cargando...</div>
      </div>
    </div>
  )

  return (
    <>
      <style>{`* { box-sizing:border-box; margin:0; padding:0; } body { font-family:'Nunito',-apple-system,sans-serif; }`}</style>
      <div style={{ minHeight:'100dvh', background:C.bg, fontFamily:"'Nunito',sans-serif" }}>

        {/* Header */}
        <div style={{ background:`linear-gradient(160deg,${C.primary} 0%,#15803d 100%)`, position:'sticky', top:0, zIndex:50 }}>
          <div style={{ padding:'clamp(14px,4vw,20px) clamp(14px,4vw,20px) 12px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:'clamp(17px,4vw,20px)', fontWeight:800, color:'white' }}>🚐 {rep?.nombre || 'Repartidor'}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.65)', marginTop:2 }}>
                {pendientes.length} parada{pendientes.length!==1?'s':''} pendiente{pendientes.length!==1?'s':''}
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {notifsNuevas.length > 0 && (
                <div style={{ background:'#fbbf24', borderRadius:10, padding:'3px 8px', fontSize:12, fontWeight:800, color:'white' }}>🔔 {notifsNuevas.length}</div>
              )}
              <button onClick={logout}
                style={{ padding:'6px 12px', borderRadius:10, background:'rgba(255,255,255,.2)', color:'white', fontSize:12, fontWeight:700, border:'1px solid rgba(255,255,255,.3)', cursor:'pointer', fontFamily:'inherit' }}>
                Salir
              </button>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:1, background:'rgba(255,255,255,.1)' }}>
            {[
              { label:'Pendientes', val:pendientes.length, icon:'⏳' },
              { label:'Completadas', val:completadas.length, icon:'✅' },
              { label:'Total hoy', val:paradas.length, icon:'📋' },
            ].map(k => (
              <div key={k.label} style={{ padding:10, textAlign:'center', background:'rgba(0,0,0,.08)' }}>
                <div style={{ fontSize:'clamp(18px,4.5vw,22px)', fontWeight:800, color:'white' }}>{k.icon} {k.val}</div>
                <div style={{ fontSize:9, color:'rgba(255,255,255,.55)', textTransform:'uppercase', letterSpacing:'.05em', marginTop:2 }}>{k.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding:'14px clamp(12px,4vw,20px)', maxWidth:600, margin:'0 auto' }}>
          {geoError && (
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, padding:'10px 14px', marginBottom:12, fontSize:13, color:C.red, fontWeight:600 }}>
              📍 {geoError} — sin ETA automático
            </div>
          )}

          {notifsNuevas.length > 0 && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:800, color:C.muted, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>🔔 Avisos nuevos</div>
              {notifsNuevas.map((n:any) => (
                <div key={n.id} style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:12, padding:'10px 14px', marginBottom:6 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:'#92400e' }}>{n.titulo}</div>
                  {n.cuerpo && <div style={{ fontSize:12, color:'#a16207', marginTop:2 }}>{n.cuerpo}</div>}
                </div>
              ))}
            </div>
          )}

          {!loading && paradas.length === 0 && (
            <div style={{ textAlign:'center', padding:'60px 0', color:C.muted }}>
              <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
              <div style={{ fontWeight:700, fontSize:16 }}>Sin paradas para hoy</div>
              <div style={{ fontSize:13, marginTop:6 }}>Cuando el admin asigne paradas, aparecerán aquí.</div>
            </div>
          )}

          {pendientes.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:800, color:C.muted, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>Pendientes ({pendientes.length})</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {pendientes.map(p => <ParadaCard key={p.id} p={p} onCompletar={() => setModal(p)} />)}
              </div>
            </div>
          )}

          {completadas.length > 0 && (
            <div>
              <div style={{ fontSize:11, fontWeight:800, color:C.muted, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>Completadas ({completadas.length})</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {completadas.map(p => <ParadaCard key={p.id} p={p} onCompletar={() => {}} />)}
              </div>
            </div>
          )}
          <div style={{ height:32 }} />
        </div>

        {modal && (
          <ModalCompletar parada={modal} onClose={() => setModal(null)} onParadaCompletada={cargarParadas} />
        )}
      </div>
    </>
  )
}

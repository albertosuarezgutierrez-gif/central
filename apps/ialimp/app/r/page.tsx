'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import LogoIalimp from '@/components/LogoIalimp'

const C = {
  primary: '#16a34a', light: '#f0fdf4', border: '#d1fae5',
  text: '#1e293b', muted: '#64748b', bg: '#f8fafc',
  warn: '#d97706', warnBg: '#fffbeb',
  red: '#dc2626', redBg: '#fef2f2',
}

const TIPO_CFG: Record<string,{icon:string,label:string,color:string}> = {
  abrir_piso:        { icon:'🔑', label:'Abrir piso',       color:'#1d4ed8' },
  cerrar_piso:       { icon:'🔒', label:'Cerrar piso',      color:'#6d28d9' },
  recoger_ropa:      { icon:'👕', label:'Recoger ropa',     color:'#b45309' },
  entregar_material: { icon:'📦', label:'Entregar material', color:'#0f766e' },
  incidencia:        { icon:'⚠️', label:'Incidencia',       color:'#dc2626' },
  otro:              { icon:'📋', label:'Otra tarea',        color:'#475569' },
}

function fmtEta(min: number | null | undefined): string | null {
  if (!min) return null
  if (min < 2) return '< 1 min'
  if (min < 60) return `${min} min`
  return `${Math.floor(min/60)}h ${min%60}min`
}

function ParadaCard({ p, onCompletar }: { p: any, onCompletar: (p:any)=>void }) {
  const cfg = TIPO_CFG[p.tipo] || TIPO_CFG.otro
  const eta = fmtEta(p.eta_minutos)

  return (
    <div style={{
      background: p.completada ? '#f0fdf4' : 'white',
      borderRadius: 16, border: `1.5px solid ${p.completada ? '#86efac' : C.border}`,
      overflow: 'hidden', opacity: p.completada ? 0.7 : 1,
      boxShadow: p.completada ? 'none' : '0 2px 8px rgba(0,0,0,.06)',
    }}>
      {/* Cabecera tipo */}
      <div style={{ background: p.completada ? '#dcfce7' : '#f8fafc', borderBottom: `1px solid ${p.completada ? '#86efac' : C.border}`, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:18 }}>{cfg.icon}</span>
          <span style={{ fontSize:12, fontWeight:700, color: p.completada ? '#16a34a' : cfg.color }}>{cfg.label}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {eta && !p.completada && (
            <span style={{ fontSize:11, background:'#eff6ff', color:'#1d4ed8', borderRadius:8, padding:'2px 8px', fontWeight:700 }}>🗺 {eta}</span>
          )}
          {p.completada && <span style={{ fontSize:11, color:'#16a34a', fontWeight:700 }}>✓ Completada</span>}
          {!p.completada && <span style={{ fontSize:11, color:C.muted, fontWeight:600 }}>#{p.orden+1}</span>}
        </div>
      </div>

      {/* Cuerpo */}
      <div style={{ padding:'12px 14px' }}>
        <div style={{ fontWeight:800, fontSize:15, color:C.text, marginBottom:2 }}>{p.titulo}</div>
        {p.propiedad_nombre && (
          <div style={{ fontSize:12, color:C.muted, marginBottom:2 }}>🏠 {p.propiedad_nombre}</div>
        )}
        {p.direccion && (
          <a href={`https://maps.google.com/?q=${encodeURIComponent(p.direccion)}`}
            target="_blank" rel="noreferrer"
            style={{ fontSize:12, color:'#1d4ed8', display:'block', marginBottom:4, textDecoration:'none', fontWeight:600 }}>
            📍 {p.direccion} ↗
          </a>
        )}
        {p.limpiadora_nombre && (
          <div style={{ fontSize:12, color:C.muted, marginBottom:4 }}>🧹 {p.limpiadora_nombre}</div>
        )}
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
            style={{ marginTop:12, width:'100%', padding:'11px', borderRadius:12,
              background: `linear-gradient(135deg,${cfg.color},${cfg.color}cc)`,
              color:'white', fontSize:14, fontWeight:800, border:'none', cursor:'pointer',
              fontFamily:'inherit', minHeight:44 }}>
            {cfg.icon} Marcar como hecha
          </button>
        )}
      </div>
    </div>
  )
}

function ModalCompletar({ parada, onConfirm, onClose }: { parada:any, onConfirm:(nota:string)=>void, onClose:()=>void }) {
  const [nota, setNota] = useState('')
  const cfg = TIPO_CFG[parada.tipo] || TIPO_CFG.otro
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:100, display:'flex', alignItems:'flex-end' }}
      onClick={onClose}>
      <div style={{ background:'white', borderRadius:'20px 20px 0 0', width:'100%', padding:'24px 20px 32px' }}
        onClick={e=>e.stopPropagation()}>
        <div style={{ width:40, height:4, background:'#e2e8f0', borderRadius:4, margin:'0 auto 20px' }} />
        <div style={{ fontSize:18, fontWeight:800, color:C.text, marginBottom:4 }}>
          {cfg.icon} {cfg.label} completada
        </div>
        <div style={{ fontSize:13, color:C.muted, marginBottom:16 }}>{parada.titulo}</div>
        <textarea
          value={nota} onChange={e=>setNota(e.target.value)}
          placeholder="Nota opcional (p.ej. 'llave dejada en buzón')"
          style={{ width:'100%', minHeight:80, padding:'10px 12px', borderRadius:12,
            border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit',
            resize:'none', outline:'none', color:C.text }}
        />
        <button onClick={()=>onConfirm(nota)}
          style={{ marginTop:12, width:'100%', padding:14, borderRadius:14,
            background:`linear-gradient(135deg,${cfg.color},${cfg.color}cc)`,
            color:'white', fontSize:15, fontWeight:800, border:'none', cursor:'pointer', fontFamily:'inherit', minHeight:52 }}>
          Confirmar ✓
        </button>
        <button onClick={onClose}
          style={{ marginTop:8, width:'100%', padding:10, borderRadius:12,
            background:'transparent', color:C.muted, fontSize:14, fontWeight:600,
            border:`1px solid ${C.border}`, cursor:'pointer', fontFamily:'inherit' }}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

export default function RepartidorPage() {
  const router = useRouter()
  const [rep,       setRep]       = useState<any>(null)
  const [paradas,   setParadas]   = useState<any[]>([])
  const [posicion,  setPosicion]  = useState<any>(null)
  const [notifs,    setNotifs]    = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState<any>(null)
  const [geoError,  setGeoError]  = useState<string|null>(null)
  const watchRef = useRef<number|null>(null)
  const lastPosSent = useRef<number>(0)

  // Verificar sesión
  useEffect(() => {
    fetch('/api/r/auth').then(r=>r.json()).then(d=>{
      if (!d.repartidor) { router.replace('/r/login'); return }
      setRep(d.repartidor)
      cargarParadas()
      cargarNotifs()
    })
  }, [])

  const cargarParadas = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/r/paradas')
    if (res.ok) {
      const d = await res.json()
      setParadas(d.paradas || [])
      setPosicion(d.posicion || null)
    }
    setLoading(false)
  }, [])

  const cargarNotifs = useCallback(async () => {
    const res = await fetch('/api/r/notificaciones')
    if (res.ok) {
      const d = await res.json()
      setNotifs(d.notificaciones || [])
    }
  }, [])

  // Geolocalización continua — envía posición cada 30s o si hay movimiento >50m
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError('Tu dispositivo no soporta geolocalización')
      return
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now()
        if (now - lastPosSent.current < 30_000) return // throttle 30s
        lastPosSent.current = now
        fetch('/api/r/posicion', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            precision_m: pos.coords.accuracy,
            speed_kmh: pos.coords.speed ? pos.coords.speed * 3.6 : null,
          }),
        }).then(r=>r.ok?r.json():null).then(d=>{
          if (d?.eta_minutos != null) {
            // Actualizar ETA en la parada activa localmente
            setParadas(prev => prev.map(p =>
              !p.completada ? { ...p, eta_minutos: d.eta_minutos } : p
            ))
          }
        })
      },
      (err) => {
        if (err.code === 1) setGeoError('Permiso de ubicación denegado')
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 }
    )
    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current)
    }
  }, [])

  // Polling notificaciones cada 45s
  useEffect(() => {
    const iv = setInterval(cargarNotifs, 45_000)
    return () => clearInterval(iv)
  }, [])

  async function completarParada(parada: any, nota: string) {
    setModal(null)
    await fetch('/api/r/paradas', {
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ parada_id: parada.id, nota_completada: nota }),
    })
    cargarParadas()
  }

  async function logout() {
    await fetch('/api/r/auth', { method:'DELETE' })
    router.replace('/r/login')
  }

  const pendientes   = paradas.filter(p=>!p.completada)
  const completadas  = paradas.filter(p=> p.completada)
  const notifsNuevas = notifs.filter(n=>!n.leida)

  if (loading && !rep) {
    return (
      <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:C.bg, fontFamily:"'Nunito',sans-serif" }}>
        <div style={{ textAlign:'center', color:C.muted }}>
          <div style={{ fontSize:32 }}>🚐</div>
          <div style={{ fontWeight:600, marginTop:8 }}>Cargando...</div>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`* { box-sizing:border-box; margin:0; padding:0; } body { font-family:'Nunito',-apple-system,sans-serif; }`}</style>
      <div style={{ minHeight:'100dvh', background:C.bg, fontFamily:"'Nunito',sans-serif" }}>

        {/* Header */}
        <div style={{ background:`linear-gradient(160deg,${C.primary} 0%,#15803d 100%)`, padding:'0', position:'sticky', top:0, zIndex:50 }}>
          <div style={{ padding:'clamp(14px,4vw,20px) clamp(14px,4vw,20px) 12px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:'clamp(17px,4vw,20px)', fontWeight:800, color:'white' }}>
                🚐 {rep?.nombre || 'Repartidor'}
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.65)', marginTop:2 }}>
                {pendientes.length} parada{pendientes.length!==1?'s':''} pendiente{pendientes.length!==1?'s':''}
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {notifsNuevas.length > 0 && (
                <div style={{ background:'#fbbf24', borderRadius:10, padding:'3px 8px', fontSize:12, fontWeight:800, color:'white' }}>
                  🔔 {notifsNuevas.length}
                </div>
              )}
              <button onClick={logout}
                style={{ padding:'6px 12px', borderRadius:10, background:'rgba(255,255,255,.2)', color:'white', fontSize:12, fontWeight:700, border:'1px solid rgba(255,255,255,.3)', cursor:'pointer', fontFamily:'inherit' }}>
                Salir
              </button>
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:1, background:'rgba(255,255,255,.1)' }}>
            {[
              { label:'Pendientes', val: pendientes.length, icon:'⏳' },
              { label:'Completadas', val: completadas.length, icon:'✅' },
              { label:'Total hoy', val: paradas.length, icon:'📋' },
            ].map(k=>(
              <div key={k.label} style={{ padding:'10px', textAlign:'center', background:'rgba(0,0,0,.08)' }}>
                <div style={{ fontSize:'clamp(18px,4.5vw,22px)', fontWeight:800, color:'white' }}>{k.icon} {k.val}</div>
                <div style={{ fontSize:9, color:'rgba(255,255,255,.55)', textTransform:'uppercase', letterSpacing:'.05em', marginTop:2 }}>{k.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding:'14px clamp(12px,4vw,20px)', maxWidth:600, margin:'0 auto' }}>

          {/* Aviso geolocalización */}
          {geoError && (
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, padding:'10px 14px', marginBottom:12, fontSize:13, color:C.red, fontWeight:600 }}>
              📍 {geoError} — sin ETA automático
            </div>
          )}

          {/* Notificaciones nuevas */}
          {notifsNuevas.length > 0 && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:800, color:C.muted, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>🔔 Avisos nuevos</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {notifsNuevas.map((n:any) => (
                  <div key={n.id} style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:12, padding:'10px 14px' }}>
                    <div style={{ fontWeight:700, fontSize:13, color:'#92400e' }}>{n.titulo}</div>
                    {n.cuerpo && <div style={{ fontSize:12, color:'#a16207', marginTop:2 }}>{n.cuerpo}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sin paradas */}
          {!loading && paradas.length === 0 && (
            <div style={{ textAlign:'center', padding:'60px 0', color:C.muted }}>
              <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
              <div style={{ fontWeight:700, fontSize:16 }}>Sin paradas para hoy</div>
              <div style={{ fontSize:13, marginTop:6 }}>Cuando el admin asigne paradas, aparecerán aquí.</div>
            </div>
          )}

          {/* Paradas pendientes */}
          {pendientes.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:800, color:C.muted, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>
                Pendientes ({pendientes.length})
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {pendientes.map(p=>(
                  <ParadaCard key={p.id} p={p} onCompletar={()=>setModal(p)} />
                ))}
              </div>
            </div>
          )}

          {/* Paradas completadas */}
          {completadas.length > 0 && (
            <div>
              <div style={{ fontSize:11, fontWeight:800, color:C.muted, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>
                Completadas ({completadas.length})
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {completadas.map(p=>(
                  <ParadaCard key={p.id} p={p} onCompletar={()=>{}} />
                ))}
              </div>
            </div>
          )}

          <div style={{ height:32 }} />
        </div>

        {/* Modal completar */}
        {modal && (
          <ModalCompletar
            parada={modal}
            onConfirm={nota=>completarParada(modal,nota)}
            onClose={()=>setModal(null)}
          />
        )}
      </div>
    </>
  )
}

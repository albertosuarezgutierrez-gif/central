'use client'
import { useState, useEffect, useRef } from 'react'

const C = {
  primary: 'var(--brand-primary)', light: 'var(--brand-light)',
  text: '#1e293b', muted: '#64748b', border: '#e2e8f0', bg: '#f8fafc',
  green: '#16a34a', greenBg: '#f0fdf4', greenBorder: '#d1fae5',
  red: '#dc2626',
}

const TIPO_CFG: Record<string,{icon:string,label:string}> = {
  abrir_piso:        { icon:'🔑', label:'Abrir piso' },
  cerrar_piso:       { icon:'🔒', label:'Cerrar piso' },
  recoger_ropa:      { icon:'👕', label:'Recoger ropa' },
  entregar_material: { icon:'📦', label:'Entregar material' },
  incidencia:        { icon:'⚠️', label:'Incidencia' },
  otro:              { icon:'📋', label:'Otra tarea' },
}

const HOY = new Date().toISOString().split('T')[0]

// ── Mapa Leaflet (cargado por CDN, sin dep npm, igual que módulo transporte) ──
function MapaRepartidores({ posiciones, paradas, repartidores }: { posiciones: any[], paradas: any[], repartidores: any[] }) {
  const mapRef    = useRef<any>(null)
  const leafletRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const paradaMarkersRef = useRef<any[]>([])

  useEffect(() => {
    // Cargar Leaflet desde CDN si no está ya cargado
    if (typeof window === 'undefined') return

    function initMap() {
      const L = (window as any).L
      if (!L || mapRef.current) return

      const el = document.getElementById('mapa-repartidores')
      if (!el) return

      const map = L.map(el, { zoomControl: true, attributionControl: false })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map)

      // Centro por defecto: Sevilla
      map.setView([37.3886, -5.9823], 13)
      leafletRef.current = map
      mapRef.current = true

      renderMarkers(L, map)
    }

    if ((window as any).L) {
      initMap()
    } else {
      // Cargar CSS + JS de Leaflet
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link')
        link.id = 'leaflet-css'
        link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(link)
      }
      if (!document.getElementById('leaflet-js')) {
        const script = document.createElement('script')
        script.id = 'leaflet-js'
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
        script.onload = initMap
        document.head.appendChild(script)
      }
    }
  }, [])

  // Actualizar marcadores cuando cambian posiciones/paradas
  useEffect(() => {
    const L = (window as any).L
    const map = leafletRef.current
    if (!L || !map) return
    renderMarkers(L, map)
  }, [posiciones, paradas, repartidores])

  function renderMarkers(L: any, map: any) {
    // Limpiar marcadores anteriores
    markersRef.current.forEach(m => m.remove())
    paradaMarkersRef.current.forEach(m => m.remove())
    markersRef.current = []
    paradaMarkersRef.current = []

    const bounds: any[] = []

    // Marcadores de repartidores (posición en vivo) — círculo con color + nombre
    posiciones.forEach(pos => {
      const rep = repartidores.find(r => r.id === pos.repartidor_id)
      const color = rep?.color || '#16a34a'
      const nombre = rep?.nombre || 'Repartidor'

      const icon = L.divIcon({
        html: `<div style="
          width:36px;height:36px;border-radius:50%;
          background:${color};border:3px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,.35);
          display:flex;align-items:center;justify-content:center;
          font-size:16px;font-weight:800;color:white;
          font-family:'Nunito',sans-serif;
        ">🚐</div>
        <div style="
          position:absolute;left:50%;transform:translateX(-50%);
          top:38px;white-space:nowrap;
          background:${color};color:white;
          font-size:10px;font-weight:700;
          padding:2px 6px;border-radius:6px;
          box-shadow:0 1px 4px rgba(0,0,0,.2);
          font-family:'Nunito',sans-serif;
        ">${nombre}</div>`,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      })

      const marker = L.marker([pos.lat, pos.lng], { icon })
        .addTo(map)
        .bindPopup(`<b>${nombre}</b><br>En ruta · posición en vivo`)
      markersRef.current.push(marker)
      bounds.push([pos.lat, pos.lng])
    })

    // Marcadores de paradas (propiedades con coordenadas)
    paradas.forEach(p => {
      if (!p.propiedad_lat || !p.propiedad_lng) return
      const cfg: any = {
        abrir_piso:'🔑', cerrar_piso:'🔒', recoger_ropa:'👕',
        entregar_material:'📦', incidencia:'⚠️', otro:'📋'
      }
      const emoji = cfg[p.tipo] || '📋'
      const hecho = p.completada
      const icon = L.divIcon({
        html: `<div style="
          width:32px;height:32px;border-radius:10px;
          background:${hecho?'#86efac':'white'};
          border:2px solid ${hecho?'#16a34a':'#94a3b8'};
          box-shadow:0 2px 6px rgba(0,0,0,.2);
          display:flex;align-items:center;justify-content:center;
          font-size:15px;
          opacity:${hecho?0.6:1};
        ">${emoji}</div>`,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      })

      const marker = L.marker([p.propiedad_lat, p.propiedad_lng], { icon })
        .addTo(map)
        .bindPopup(`<b>${p.titulo}</b><br>${p.propiedad_nombre||''}<br>${p.repartidor_nombre} · ${hecho?'✓ Hecha':'Pendiente'}${p.eta_minutos&&!hecho?'<br>🗺 ETA: '+p.eta_minutos+' min':''}`)
      paradaMarkersRef.current.push(marker)
      bounds.push([p.propiedad_lat, p.propiedad_lng])
    })

    if (bounds.length > 0) {
      try { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 }) } catch {}
    }
  }

  return (
    <div style={{ borderRadius:16, overflow:'hidden', border:'1px solid #d1fae5', boxShadow:'0 2px 12px rgba(0,0,0,.08)', marginBottom:20 }}>
      <div style={{ background:'#f0fdf4', padding:'8px 14px', display:'flex', alignItems:'center', gap:8, borderBottom:'1px solid #d1fae5' }}>
        <span style={{ fontSize:13, fontWeight:700, color:'#15803d' }}>🗺 Mapa en vivo</span>
        {posiciones.length > 0
          ? <span style={{ fontSize:11, color:'#16a34a', fontWeight:600, background:'#dcfce7', borderRadius:6, padding:'1px 6px' }}>🟢 {posiciones.length} en ruta</span>
          : <span style={{ fontSize:11, color:'#64748b' }}>Sin repartidores activos ahora mismo</span>
        }
        <span style={{ fontSize:10, color:'#94a3b8', marginLeft:'auto' }}>OpenStreetMap · gratis</span>
      </div>
      <div id="mapa-repartidores" style={{ height: 'clamp(280px,40vw,420px)', width:'100%' }} />
    </div>
  )
}

export default function RepartidoresPage() {
  const [tab,           setTab]           = useState<'equipo'|'paradas'|'checklist'>('equipo')
  const [plantillas,    setPlantillas]    = useState<any[]>([])
  const [plantForm,     setPlantForm]     = useState(false)
  const [nuevaPlant,    setNuevaPlant]    = useState({ tipo:'abrir_piso', nombre:'', items:[] as {texto:string,obligatorio:boolean,requiere_foto:boolean}[] })
  const [editPlant,     setEditPlant]     = useState<any>(null)
  const [nuevoItem,     setNuevoItem]     = useState({ texto:'', obligatorio:true, requiere_foto:false })
  const [repartidores,  setRepartidores]  = useState<any[]>([])
  const [paradas,       setParadas]       = useState<any[]>([])
  const [posiciones,    setPosiciones]    = useState<any[]>([])
  const [fecha,         setFecha]         = useState(HOY)
  const [loading,       setLoading]       = useState(true)
  const [formOpen,      setFormOpen]      = useState(false)
  const [paradaForm,    setParadaForm]    = useState(false)
  const [nuevaParada,   setNuevaParada]   = useState<any>({ tipo:'abrir_piso', titulo:'', repartidor_id:'', direccion:'', notas:'' })
  const [nuevoRep,      setNuevoRep]      = useState({ nombre:'', telefono:'', pin:'', color:'#16a34a' })
  const [saving,        setSaving]        = useState(false)
  const [sesionesHoy,   setSesionesHoy]   = useState<any[]>([])
  const [props,         setProps]         = useState<any[]>([])
  const [limps,         setLimps]         = useState<any[]>([])

  useEffect(() => {
    cargarRepartidores()
    cargarContexto()
  }, [])

  useEffect(() => {
    if (tab !== 'paradas') return
    cargarParadas()
    const iv = setInterval(cargarParadas, 30_000)
    return () => clearInterval(iv)
  }, [tab, fecha])

  useEffect(() => {
    if (tab === 'checklist') cargarChecklist()
  }, [tab])

  async function cargarChecklist() {
    const r = await fetch('/api/admin/repartidor-checklist')
    if (r.ok) { const d = await r.json(); setPlantillas(d.plantillas||[]) }
  }

  async function crearPlantilla() {
    if (!nuevaPlant.nombre || !nuevaPlant.tipo) return
    setSaving(true)
    await fetch('/api/admin/repartidor-checklist', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(nuevaPlant),
    })
    await cargarChecklist()
    setPlantForm(false)
    setNuevaPlant({ tipo:'abrir_piso', nombre:'', items:[] })
    setSaving(false)
  }

  async function guardarPlantilla() {
    if (!editPlant) return
    setSaving(true)
    await fetch('/api/admin/repartidor-checklist', {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id:editPlant.id, nombre:editPlant.nombre, items:editPlant.items }),
    })
    await cargarChecklist()
    setEditPlant(null)
    setSaving(false)
  }

  async function borrarPlantilla(id: string) {
    if (!confirm('¿Eliminar esta plantilla?')) return
    await fetch('/api/admin/repartidor-checklist', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id}) })
    cargarChecklist()
  }

  async function cargarRepartidores() {
    setLoading(true)
    const r = await fetch('/api/admin/repartidores')
    if (r.ok) { const d = await r.json(); setRepartidores(d.repartidores||[]) }
    setLoading(false)
  }

  async function cargarParadas() {
    const r = await fetch(`/api/admin/repartidor-paradas?fecha=${fecha}`)
    if (r.ok) { const d = await r.json(); setParadas(d.paradas||[]); setPosiciones(d.posiciones||[]) }
  }

  async function cargarContexto() {
    // Propiedades y limpiadoras para el form de paradas
    const [rProp, rLimp, rSes] = await Promise.all([
      fetch('/api/admin/propiedades').then(r=>r.ok?r.json():null),
      fetch('/api/admin/equipo').then(r=>r.ok?r.json():null),
      fetch(`/api/admin/sesiones?fecha=${HOY}`).then(r=>r.ok?r.json():null),
    ])
    if (rProp) setProps(rProp.propiedades||rProp||[])
    if (rLimp) setLimps(rLimp.limpiadoras||rLimp||[])
    if (rSes)  setSesionesHoy(rSes.sesiones||rSes||[])
  }

  async function crearRepartidor() {
    if (!nuevoRep.nombre || !nuevoRep.pin) return
    setSaving(true)
    await fetch('/api/admin/repartidores', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(nuevoRep) })
    setFormOpen(false)
    setNuevoRep({ nombre:'', telefono:'', pin:'', color:'#16a34a' })
    await cargarRepartidores()
    setSaving(false)
  }

  async function toggleActivo(rep: any) {
    await fetch('/api/admin/repartidores', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id: rep.id, activo: !rep.activo }) })
    cargarRepartidores()
  }

  async function crearParada() {
    if (!nuevaParada.repartidor_id || !nuevaParada.titulo) return
    setSaving(true)
    await fetch('/api/admin/repartidor-paradas', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ ...nuevaParada, session_date: fecha }),
    })
    setParadaForm(false)
    setNuevaParada({ tipo:'abrir_piso', titulo:'', repartidor_id:'', direccion:'', notas:'' })
    await cargarParadas()
    setSaving(false)
  }

  async function eliminarParada(id: string) {
    await fetch('/api/admin/repartidor-paradas', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id }) })
    cargarParadas()
  }

  const paradasPorRep = repartidores.map(rep => ({
    rep,
    paradas: paradas.filter(p=>p.repartidor_nombre===rep.nombre),
    pos: posiciones.find(p=>p.repartidor_id===rep.id),
  }))

  return (
    <div style={{ fontFamily:"'Nunito',sans-serif", padding:'clamp(16px,4vw,28px)', maxWidth:860, margin:'0 auto' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:'clamp(20px,4vw,26px)', fontWeight:900, color:C.text, margin:0 }}>🚐 Repartidores</h1>
          <p style={{ fontSize:13, color:C.muted, margin:'4px 0 0' }}>Equipo de campo: apertura de pisos, recogida de ropa e incidencias</p>
        </div>
        <button onClick={()=>setFormOpen(true)}
          style={{ padding:'10px 18px', borderRadius:12, background:C.primary, color:'white', fontSize:14, fontWeight:700, border:'none', cursor:'pointer', fontFamily:'inherit' }}>
          + Añadir repartidor
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, background:C.bg, borderRadius:12, padding:4, border:`1px solid ${C.border}`, width:'fit-content' }}>
        {([['equipo','👥 Equipo'],['paradas','📋 Paradas de hoy'],['checklist','✅ Checklists']] as const).map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{ padding:'8px 16px', borderRadius:9, fontSize:13, fontWeight:700, border:'none', cursor:'pointer', fontFamily:'inherit',
              background:tab===id?C.primary:'transparent', color:tab===id?'white':C.muted }}>
            {label}
          </button>
        ))}
      </div>

      {/* TAB EQUIPO */}
      {tab==='equipo' && (
        <div>
          {loading && <div style={{ color:C.muted, textAlign:'center', padding:40 }}>Cargando...</div>}
          {!loading && repartidores.length===0 && (
            <div style={{ textAlign:'center', padding:'60px 0', color:C.muted }}>
              <div style={{ fontSize:40 }}>🚐</div>
              <div style={{ fontWeight:700, marginTop:12 }}>Sin repartidores</div>
              <div style={{ fontSize:13, marginTop:6 }}>Añade el primer repartidor con el botón de arriba.</div>
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
            {repartidores.map(rep=>(
              <div key={rep.id} style={{ background:'white', borderRadius:16, border:`1.5px solid ${C.border}`, padding:'16px', boxShadow:'0 1px 4px rgba(0,0,0,.05)', opacity:rep.activo?1:.6 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                  <div style={{ width:44, height:44, borderRadius:13, background:rep.color||'#16a34a', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, color:'white', fontWeight:800, flexShrink:0 }}>
                    {rep.nombre.charAt(0)}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:800, fontSize:15, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{rep.nombre}</div>
                    {rep.telefono && <div style={{ fontSize:12, color:C.muted }}>📱 {rep.telefono}</div>}
                  </div>
                  <div style={{ fontSize:11, fontWeight:700, color:rep.activo?C.green:C.muted,
                    background:rep.activo?C.greenBg:C.bg, border:`1px solid ${rep.activo?C.greenBorder:C.border}`,
                    borderRadius:8, padding:'3px 8px' }}>
                    {rep.activo?'Activo':'Inactivo'}
                  </div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <a href="/r/login" target="_blank"
                    style={{ flex:1, textAlign:'center', padding:'8px', borderRadius:10, background:C.greenBg, color:C.green, fontSize:12, fontWeight:700, textDecoration:'none', border:`1px solid ${C.greenBorder}` }}>
                    📲 App
                  </a>
                  <button onClick={()=>toggleActivo(rep)}
                    style={{ flex:1, padding:'8px', borderRadius:10, background:C.bg, color:C.muted, fontSize:12, fontWeight:700, border:`1px solid ${C.border}`, cursor:'pointer', fontFamily:'inherit' }}>
                    {rep.activo?'Desactivar':'Activar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB PARADAS */}
      {tab==='paradas' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, flexWrap:'wrap' }}>
            <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)}
              style={{ padding:'8px 12px', borderRadius:10, border:`1px solid ${C.border}`, fontSize:13, fontFamily:'inherit', color:C.text, outline:'none' }} />
            <button onClick={()=>setParadaForm(true)}
              style={{ padding:'8px 16px', borderRadius:10, background:C.primary, color:'white', fontSize:13, fontWeight:700, border:'none', cursor:'pointer', fontFamily:'inherit' }}>
              + Nueva parada
            </button>
          </div>

          {/* Mapa en vivo */}
          <MapaRepartidores posiciones={posiciones} paradas={paradas} repartidores={repartidores} />

          {paradas.length===0 && (
            <div style={{ textAlign:'center', padding:'40px 0', color:C.muted }}>
              <div style={{ fontSize:32 }}>📋</div>
              <div style={{ fontWeight:600, marginTop:8 }}>Sin paradas para este día</div>
            </div>
          )}

          {paradasPorRep.filter(x=>x.paradas.length>0).map(({ rep, paradas: ps, pos })=>(
            <div key={rep.id} style={{ marginBottom:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:rep.color||'#16a34a' }} />
                <span style={{ fontWeight:800, fontSize:14, color:C.text }}>{rep.nombre}</span>
                {pos && <span style={{ fontSize:11, background:C.greenBg, color:C.green, borderRadius:6, padding:'1px 6px', fontWeight:700 }}>📍 En ruta</span>}
                <span style={{ fontSize:12, color:C.muted }}>{ps.filter((p:any)=>!p.completada).length} pendientes · {ps.filter((p:any)=>p.completada).length} hechas</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {ps.map((p:any)=>{
                  const cfg = TIPO_CFG[p.tipo]||TIPO_CFG.otro
                  return (
                    <div key={p.id} style={{ background:p.completada?C.greenBg:'white', borderRadius:12,
                      border:`1px solid ${p.completada?C.greenBorder:C.border}`, padding:'10px 14px',
                      display:'flex', alignItems:'center', gap:10, opacity:p.completada?.8:1 }}>
                      <span style={{ fontSize:18, flexShrink:0 }}>{cfg.icon}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:14, color:C.text }}>{p.titulo}</div>
                        {p.propiedad_nombre && <div style={{ fontSize:12, color:C.muted }}>🏠 {p.propiedad_nombre}</div>}
                        {p.direccion && <div style={{ fontSize:12, color:C.muted }}>📍 {p.direccion}</div>}
                        {p.limpiadora_nombre && <div style={{ fontSize:12, color:C.muted }}>🧹 {p.limpiadora_nombre}</div>}
                        {p.eta_minutos && !p.completada && <div style={{ fontSize:11, color:'#1d4ed8', fontWeight:700 }}>🗺 ETA: {p.eta_minutos} min</div>}
                        {p.items_total > 0 && <div style={{ fontSize:11, color: p.items_ok===p.items_total?C.green:'#854d0e', fontWeight:700 }}>✓ {p.items_ok}/{p.items_total} items</div>}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
                        <span style={{ fontSize:11, fontWeight:700, color:p.completada?C.green:C.muted }}>
                          {p.completada?'✓ Hecha':'Pendiente'}
                        </span>
                        {!p.completada && (
                          <button onClick={()=>eliminarParada(p.id)}
                            style={{ fontSize:11, color:C.muted, background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>
                            🗑
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB CHECKLIST */}
      {tab==='checklist' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:8 }}>
            <div style={{ fontSize:13, color:C.muted }}>Plantillas de checklist por tipo de parada. Se copian automáticamente al crear una parada.</div>
            <button onClick={()=>setPlantForm(true)}
              style={{ padding:'8px 16px', borderRadius:10, background:C.primary, color:'white', fontSize:13, fontWeight:700, border:'none', cursor:'pointer', fontFamily:'inherit' }}>
              + Nueva plantilla
            </button>
          </div>

          {plantillas.length===0 && (
            <div style={{ textAlign:'center', padding:'40px 0', color:C.muted }}>
              <div style={{ fontSize:36 }}>✅</div>
              <div style={{ fontWeight:600, marginTop:8 }}>Sin plantillas</div>
              <div style={{ fontSize:13, marginTop:4 }}>Crea una plantilla para cada tipo de parada.</div>
            </div>
          )}

          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {plantillas.map(pl=>(
              <div key={pl.id} style={{ background:'white', borderRadius:14, border:`1.5px solid ${C.border}`, padding:'14px 16px', boxShadow:'0 1px 4px rgba(0,0,0,.04)' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8, flexWrap:'wrap', gap:6 }}>
                  <div>
                    <span style={{ fontSize:15, fontWeight:800, color:C.text }}>{TIPO_CFG[pl.tipo]?.icon} {pl.nombre}</span>
                    <span style={{ marginLeft:8, fontSize:11, color:C.muted, background:C.bg, borderRadius:6, padding:'2px 7px', border:`1px solid ${C.border}` }}>
                      {TIPO_CFG[pl.tipo]?.label || pl.tipo}
                    </span>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={()=>setEditPlant({...pl, items:[...pl.items]})}
                      style={{ fontSize:12, padding:'5px 10px', borderRadius:8, border:`1px solid ${C.border}`, background:'white', color:C.text, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
                      ✏️ Editar
                    </button>
                    <button onClick={()=>borrarPlantilla(pl.id)}
                      style={{ fontSize:12, padding:'5px 10px', borderRadius:8, border:`1px solid #fecaca`, background:'#fef2f2', color:C.red, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
                      🗑 Borrar
                    </button>
                  </div>
                </div>
                {pl.items.length===0 ? (
                  <div style={{ fontSize:12, color:C.muted, fontStyle:'italic' }}>Sin items</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    {pl.items.map((it:any, i:number)=>(
                      <div key={i} style={{ fontSize:13, color:C.text, display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ color:C.primary }}>•</span>
                        {it.texto}
                        {it.obligatorio && <span style={{ fontSize:10, color:'#dc2626', fontWeight:700 }}>OBL</span>}
                        {it.requiere_foto && <span style={{ fontSize:10, color:'#1d4ed8', fontWeight:700 }}>📷</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal nueva plantilla */}
      {plantForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:100, display:'flex', alignItems:'flex-end' }}
          onClick={()=>setPlantForm(false)}>
          <div style={{ background:'white', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:560, margin:'0 auto', padding:'24px 20px 32px', maxHeight:'90dvh', overflowY:'auto' }}
            onClick={e=>e.stopPropagation()}>
            <div style={{ width:40, height:4, background:'#e2e8f0', borderRadius:4, margin:'0 auto 20px' }} />
            <div style={{ fontWeight:800, fontSize:17, color:C.text, marginBottom:16 }}>Nueva plantilla de checklist</div>

            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, fontWeight:700, color:C.muted, display:'block', marginBottom:4 }}>Tipo de parada</label>
              <select value={nuevaPlant.tipo} onChange={e=>setNuevaPlant(v=>({...v,tipo:e.target.value}))}
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit', outline:'none', color:C.text, background:'white' }}>
                {Object.entries(TIPO_CFG).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, fontWeight:700, color:C.muted, display:'block', marginBottom:4 }}>Nombre de la plantilla</label>
              <input type="text" value={nuevaPlant.nombre} onChange={e=>setNuevaPlant(v=>({...v,nombre:e.target.value}))}
                placeholder="Ej: Verificación al cerrar piso"
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit', outline:'none', color:C.text }} />
            </div>

            {/* Items */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:8 }}>Items del checklist</div>
              {nuevaPlant.items.map((it,i)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, background:C.bg, borderRadius:8, padding:'8px 10px' }}>
                  <div style={{ flex:1, fontSize:13, color:C.text }}>{it.texto}</div>
                  {it.obligatorio && <span style={{ fontSize:10, color:C.red, fontWeight:700 }}>OBL</span>}
                  {it.requiere_foto && <span style={{ fontSize:10, color:'#1d4ed8', fontWeight:700 }}>📷</span>}
                  <button onClick={()=>setNuevaPlant(v=>({...v,items:v.items.filter((_,j)=>j!==i)}))}
                    style={{ fontSize:14, color:C.muted, background:'none', border:'none', cursor:'pointer' }}>×</button>
                </div>
              ))}
              <div style={{ display:'flex', gap:6, alignItems:'flex-end' }}>
                <input type="text" placeholder="Nuevo item…" value={nuevoItem.texto}
                  onChange={e=>setNuevoItem(v=>({...v,texto:e.target.value}))}
                  onKeyDown={e=>{ if(e.key==='Enter'&&nuevoItem.texto){ setNuevaPlant(v=>({...v,items:[...v.items,{...nuevoItem}]})); setNuevoItem(v=>({...v,texto:''})) }}}
                  style={{ flex:1, padding:'8px 10px', borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, fontFamily:'inherit', outline:'none', color:C.text }} />
                <label style={{ fontSize:11, display:'flex', alignItems:'center', gap:3, color:C.muted, cursor:'pointer', whiteSpace:'nowrap' }}>
                  <input type="checkbox" checked={nuevoItem.obligatorio} onChange={e=>setNuevoItem(v=>({...v,obligatorio:e.target.checked}))} /> Obl
                </label>
                <label style={{ fontSize:11, display:'flex', alignItems:'center', gap:3, color:C.muted, cursor:'pointer', whiteSpace:'nowrap' }}>
                  <input type="checkbox" checked={nuevoItem.requiere_foto} onChange={e=>setNuevoItem(v=>({...v,requiere_foto:e.target.checked}))} /> 📷
                </label>
                <button onClick={()=>{ if(!nuevoItem.texto) return; setNuevaPlant(v=>({...v,items:[...v.items,{...nuevoItem}]})); setNuevoItem(v=>({...v,texto:''})) }}
                  style={{ padding:'8px 12px', borderRadius:8, background:C.primary, color:'white', fontSize:13, fontWeight:700, border:'none', cursor:'pointer', fontFamily:'inherit' }}>
                  +
                </button>
              </div>
            </div>

            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <button onClick={()=>setPlantForm(false)}
                style={{ flex:1, padding:12, borderRadius:12, background:C.bg, color:C.muted, fontSize:14, fontWeight:700, border:`1px solid ${C.border}`, cursor:'pointer', fontFamily:'inherit' }}>
                Cancelar
              </button>
              <button onClick={crearPlantilla} disabled={!nuevaPlant.nombre||saving}
                style={{ flex:2, padding:12, borderRadius:12, background:C.primary, color:'white', fontSize:14, fontWeight:700, border:'none', cursor:'pointer', fontFamily:'inherit', opacity:!nuevaPlant.nombre?.5:1 }}>
                {saving?'Guardando…':'Crear plantilla'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar plantilla */}
      {editPlant && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:100, display:'flex', alignItems:'flex-end' }}
          onClick={()=>setEditPlant(null)}>
          <div style={{ background:'white', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:560, margin:'0 auto', padding:'24px 20px 32px', maxHeight:'90dvh', overflowY:'auto' }}
            onClick={e=>e.stopPropagation()}>
            <div style={{ width:40, height:4, background:'#e2e8f0', borderRadius:4, margin:'0 auto 20px' }} />
            <div style={{ fontWeight:800, fontSize:17, color:C.text, marginBottom:16 }}>
              {TIPO_CFG[editPlant.tipo]?.icon} Editar: {editPlant.nombre}
            </div>

            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, fontWeight:700, color:C.muted, display:'block', marginBottom:4 }}>Nombre</label>
              <input type="text" value={editPlant.nombre} onChange={e=>setEditPlant((v:any)=>({...v,nombre:e.target.value}))}
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit', outline:'none', color:C.text }} />
            </div>

            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:8 }}>Items</div>
              {editPlant.items.map((it:any, i:number)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, background:C.bg, borderRadius:8, padding:'8px 10px' }}>
                  <input type="text" value={it.texto}
                    onChange={e=>setEditPlant((v:any)=>({...v,items:v.items.map((x:any,j:number)=>j===i?{...x,texto:e.target.value}:x)}))}
                    style={{ flex:1, padding:'6px 8px', borderRadius:6, border:`1px solid ${C.border}`, fontSize:13, fontFamily:'inherit', outline:'none', color:C.text, background:'white' }} />
                  <label style={{ fontSize:11, display:'flex', alignItems:'center', gap:3, color:C.muted, cursor:'pointer', whiteSpace:'nowrap' }}>
                    <input type="checkbox" checked={it.obligatorio}
                      onChange={e=>setEditPlant((v:any)=>({...v,items:v.items.map((x:any,j:number)=>j===i?{...x,obligatorio:e.target.checked}:x)}))} /> Obl
                  </label>
                  <label style={{ fontSize:11, display:'flex', alignItems:'center', gap:3, color:C.muted, cursor:'pointer', whiteSpace:'nowrap' }}>
                    <input type="checkbox" checked={it.requiere_foto}
                      onChange={e=>setEditPlant((v:any)=>({...v,items:v.items.map((x:any,j:number)=>j===i?{...x,requiere_foto:e.target.checked}:x)}))} /> 📷
                  </label>
                  <button onClick={()=>setEditPlant((v:any)=>({...v,items:v.items.filter((_:any,j:number)=>j!==i)}))}
                    style={{ fontSize:16, color:C.red, background:'none', border:'none', cursor:'pointer' }}>×</button>
                </div>
              ))}
              <div style={{ display:'flex', gap:6, alignItems:'flex-end' }}>
                <input type="text" placeholder="Nuevo item…" value={nuevoItem.texto}
                  onChange={e=>setNuevoItem(v=>({...v,texto:e.target.value}))}
                  onKeyDown={e=>{ if(e.key==='Enter'&&nuevoItem.texto){ setEditPlant((v:any)=>({...v,items:[...v.items,{...nuevoItem}]})); setNuevoItem(v=>({...v,texto:''})) }}}
                  style={{ flex:1, padding:'8px 10px', borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, fontFamily:'inherit', outline:'none', color:C.text }} />
                <label style={{ fontSize:11, display:'flex', alignItems:'center', gap:3, color:C.muted, cursor:'pointer', whiteSpace:'nowrap' }}>
                  <input type="checkbox" checked={nuevoItem.obligatorio} onChange={e=>setNuevoItem(v=>({...v,obligatorio:e.target.checked}))} /> Obl
                </label>
                <label style={{ fontSize:11, display:'flex', alignItems:'center', gap:3, color:C.muted, cursor:'pointer', whiteSpace:'nowrap' }}>
                  <input type="checkbox" checked={nuevoItem.requiere_foto} onChange={e=>setNuevoItem(v=>({...v,requiere_foto:e.target.checked}))} /> 📷
                </label>
                <button onClick={()=>{ if(!nuevoItem.texto) return; setEditPlant((v:any)=>({...v,items:[...v.items,{...nuevoItem}]})); setNuevoItem(v=>({...v,texto:''})) }}
                  style={{ padding:'8px 12px', borderRadius:8, background:C.primary, color:'white', fontSize:13, fontWeight:700, border:'none', cursor:'pointer', fontFamily:'inherit' }}>
                  +
                </button>
              </div>
            </div>

            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <button onClick={()=>setEditPlant(null)}
                style={{ flex:1, padding:12, borderRadius:12, background:C.bg, color:C.muted, fontSize:14, fontWeight:700, border:`1px solid ${C.border}`, cursor:'pointer', fontFamily:'inherit' }}>
                Cancelar
              </button>
              <button onClick={guardarPlantilla} disabled={saving}
                style={{ flex:2, padding:12, borderRadius:12, background:C.primary, color:'white', fontSize:14, fontWeight:700, border:'none', cursor:'pointer', fontFamily:'inherit' }}>
                {saving?'Guardando…':'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuevo repartidor */}
      {formOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={()=>setFormOpen(false)}>
          <div style={{ background:'white', borderRadius:20, padding:28, width:'100%', maxWidth:400 }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontWeight:800, fontSize:18, color:C.text, marginBottom:20 }}>Nuevo repartidor</div>
            {[
              { label:'Nombre *', key:'nombre', type:'text', placeholder:'Nombre completo' },
              { label:'Teléfono', key:'telefono', type:'tel', placeholder:'+34 600 000 000' },
              { label:'PIN *', key:'pin', type:'password', placeholder:'Mínimo 4 dígitos' },
            ].map(f=>(
              <div key={f.key} style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:700, color:C.muted, display:'block', marginBottom:4 }}>{f.label}</label>
                <input type={f.type} placeholder={f.placeholder} value={(nuevoRep as any)[f.key]}
                  onChange={e=>setNuevoRep(v=>({...v,[f.key]:e.target.value}))}
                  style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit', outline:'none', color:C.text }} />
              </div>
            ))}
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, fontWeight:700, color:C.muted, display:'block', marginBottom:4 }}>Color</label>
              <input type="color" value={nuevoRep.color} onChange={e=>setNuevoRep(v=>({...v,color:e.target.value}))}
                style={{ width:44, height:36, borderRadius:8, border:`1px solid ${C.border}`, cursor:'pointer' }} />
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setFormOpen(false)}
                style={{ flex:1, padding:12, borderRadius:12, background:C.bg, color:C.muted, fontSize:14, fontWeight:700, border:`1px solid ${C.border}`, cursor:'pointer', fontFamily:'inherit' }}>
                Cancelar
              </button>
              <button onClick={crearRepartidor} disabled={!nuevoRep.nombre||!nuevoRep.pin||saving}
                style={{ flex:2, padding:12, borderRadius:12, background:C.primary, color:'white', fontSize:14, fontWeight:700, border:'none', cursor:'pointer', fontFamily:'inherit', opacity:(!nuevoRep.nombre||!nuevoRep.pin)?0.5:1 }}>
                {saving?'Guardando…':'Crear repartidor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nueva parada */}
      {paradaForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:100, display:'flex', alignItems:'flex-end', padding:0 }}
          onClick={()=>setParadaForm(false)}>
          <div style={{ background:'white', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:560, margin:'0 auto', padding:'24px 20px 32px', maxHeight:'90dvh', overflowY:'auto' }}
            onClick={e=>e.stopPropagation()}>
            <div style={{ width:40, height:4, background:'#e2e8f0', borderRadius:4, margin:'0 auto 20px' }} />
            <div style={{ fontWeight:800, fontSize:17, color:C.text, marginBottom:20 }}>Nueva parada</div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, fontWeight:700, color:C.muted, display:'block', marginBottom:4 }}>Repartidor *</label>
              <select value={nuevaParada.repartidor_id} onChange={e=>setNuevaParada((v:any)=>({...v,repartidor_id:e.target.value}))}
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit', outline:'none', color:C.text, background:'white' }}>
                <option value="">Seleccionar…</option>
                {repartidores.filter(r=>r.activo).map(r=><option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, fontWeight:700, color:C.muted, display:'block', marginBottom:4 }}>Tipo *</label>
              <select value={nuevaParada.tipo} onChange={e=>setNuevaParada((v:any)=>({...v,tipo:e.target.value}))}
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit', outline:'none', color:C.text, background:'white' }}>
                {Object.entries(TIPO_CFG).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, fontWeight:700, color:C.muted, display:'block', marginBottom:4 }}>Título / descripción *</label>
              <input type="text" value={nuevaParada.titulo} onChange={e=>setNuevaParada((v:any)=>({...v,titulo:e.target.value}))}
                placeholder="Ej: Abrir Piso Triana A para María"
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit', outline:'none', color:C.text }} />
            </div>

            {props.length>0 && (
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:700, color:C.muted, display:'block', marginBottom:4 }}>Propiedad</label>
                <select value={nuevaParada.propiedad_id||''} onChange={e=>setNuevaParada((v:any)=>({...v,propiedad_id:e.target.value||null}))}
                  style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit', outline:'none', color:C.text, background:'white' }}>
                  <option value="">Sin vincular</option>
                  {props.map((p:any)=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            )}

            {limps.length>0 && (
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:700, color:C.muted, display:'block', marginBottom:4 }}>Limpiadora vinculada (para avisos)</label>
                <select value={nuevaParada.limpiadora_id||''} onChange={e=>setNuevaParada((v:any)=>({...v,limpiadora_id:e.target.value||null}))}
                  style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit', outline:'none', color:C.text, background:'white' }}>
                  <option value="">Sin vincular</option>
                  {limps.map((l:any)=><option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </div>
            )}

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, fontWeight:700, color:C.muted, display:'block', marginBottom:4 }}>Dirección</label>
              <input type="text" value={nuevaParada.direccion} onChange={e=>setNuevaParada((v:any)=>({...v,direccion:e.target.value}))}
                placeholder="Calle, número, piso…"
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit', outline:'none', color:C.text }} />
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, fontWeight:700, color:C.muted, display:'block', marginBottom:4 }}>Notas</label>
              <textarea value={nuevaParada.notas} onChange={e=>setNuevaParada((v:any)=>({...v,notas:e.target.value}))}
                placeholder="Instrucciones especiales…" rows={2}
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit', outline:'none', color:C.text, resize:'none' }} />
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, fontWeight:700, color:C.muted, display:'block', marginBottom:4 }}>Código de bulto / QR <span style={{ color:'#0f766e', fontSize:11 }}>(para verificar que el repartidor cargó el correcto)</span></label>
              <input type="text" value={nuevaParada.codigo_bulto||''} onChange={e=>setNuevaParada((v:any)=>({...v,codigo_bulto:e.target.value||null}))}
                placeholder="Ej: CAJA-2026-001"
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit', outline:'none', color:C.text }} />
            </div>

            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, fontWeight:700, color:C.muted, display:'block', marginBottom:4 }}>Teléfono del huésped <span style={{ color:'#0f766e', fontSize:11 }}>(aviso automático cuando el repartidor esté a 15 min)</span></label>
              <input type="tel" value={nuevaParada.huesped_telefono||''} onChange={e=>setNuevaParada((v:any)=>({...v,huesped_telefono:e.target.value||null}))}
                placeholder="+34 600 000 000"
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit', outline:'none', color:C.text }} />
            </div>

            <button onClick={crearParada} disabled={!nuevaParada.repartidor_id||!nuevaParada.titulo||saving}
              style={{ width:'100%', padding:14, borderRadius:14, background:C.primary, color:'white', fontSize:15, fontWeight:800, border:'none', cursor:'pointer', fontFamily:'inherit',
                opacity:(!nuevaParada.repartidor_id||!nuevaParada.titulo)?0.5:1 }}>
              {saving?'Guardando…':'Añadir parada'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

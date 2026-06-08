'use client'
import { useState, useEffect } from 'react'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)',
  bg:'#f1f5f9', text:'#1e293b', muted:'#64748b', border:'#e2e8f0',
  ok:'#16a34a', okBg:'#f0fdf4', okBorder:'#bbf7d0',
  warn:'#d97706', warnBg:'#fffbeb', warnBorder:'#fcd34d',
  red:'#dc2626', redBg:'#fef2f2', redBorder:'#fecaca',
}

type Estado = { tipo:'ok'|'error'|'aviso'; texto:string } | null

function PropiedadCard({ prop, token }: { prop:any; token:string }) {
  const [urls, setUrls]       = useState<string[]>(prop.ical_urls?.length ? prop.ical_urls : [''])
  const [loading, setLoading] = useState(false)
  const [estado, setEstado]   = useState<Estado>(null)

  const setUrl = (i:number, v:string) => setUrls(prev => prev.map((u,idx)=>idx===i?v:u))
  const addUrl = () => setUrls(prev => [...prev, ''])
  const delUrl = (i:number) => setUrls(prev => prev.filter((_,idx)=>idx!==i))

  async function guardar() {
    setLoading(true); setEstado(null)
    try {
      const r = await fetch(`/api/propietario/${token}/ical`, {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ propiedad_id: prop.id, ical_urls: urls }),
      })
      const d = await r.json()
      if (!r.ok) { setEstado({ tipo:'error', texto: d.error || 'No se pudo guardar' }); setLoading(false); return }
      // Normalizar a lo que devolvió el servidor (URLs válidas)
      setUrls(d.ical_urls?.length ? d.ical_urls : [''])
      if (d.errors?.length) {
        setEstado({ tipo:'error', texto: 'Calendario guardado, pero hay un problema: ' + d.errors[0] })
      } else if (d.synced > 0) {
        const av = d.urgentes > 0 ? ` · ⚠️ ${d.urgentes} para HOY (avisamos al equipo)` : ''
        setEstado({ tipo:'ok', texto: `✅ Calendario conectado · ${d.synced} reserva${d.synced===1?'':'s'} sincronizada${d.synced===1?'':'s'}${av}` })
      } else if (d.ical_urls?.length) {
        setEstado({ tipo:'aviso', texto: 'Calendario guardado. No hay reservas próximas en el enlace (¿calendario vacío?).' })
      } else {
        setEstado({ tipo:'aviso', texto: 'Enlace eliminado.' })
      }
    } catch {
      setEstado({ tipo:'error', texto:'Error de conexión' })
    }
    setLoading(false)
  }

  const inputStyle = { flex:1, minWidth:0, border:`1px solid ${C.border}`, borderRadius:10,
    padding:'10px 12px', fontSize:13, fontFamily:'inherit', outline:'none', background:'white', color:C.text }

  const estadoCfg = estado && (
    estado.tipo==='ok'    ? { bg:C.okBg,   bd:C.okBorder,  col:C.ok }   :
    estado.tipo==='error' ? { bg:C.redBg,  bd:C.redBorder, col:C.red }  :
                            { bg:C.warnBg, bd:C.warnBorder, col:C.warn }
  )

  return (
    <div style={{ background:'white', borderRadius:14, border:`1px solid ${C.border}`, padding:'14px 14px 16px', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ fontWeight:800, fontSize:15, color:C.text }}>{prop.nombre}</div>
      {prop.direccion && <div style={{ fontSize:12, color:C.muted, marginTop:1, marginBottom:10 }}>📍 {prop.direccion}</div>}

      <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:10 }}>
        {urls.map((u,i) => (
          <div key={i} style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <input value={u} onChange={e=>setUrl(i, e.target.value)} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false}
              placeholder="https://… (enlace iCal de Booking / Airbnb / VRBO)" style={inputStyle as any} />
            {urls.length > 1 && (
              <button onClick={()=>delUrl(i)} aria-label="Quitar enlace"
                style={{ flexShrink:0, width:36, height:36, borderRadius:10, border:`1px solid ${C.border}`, background:'white', color:C.muted, fontSize:16, cursor:'pointer' }}>✕</button>
            )}
          </div>
        ))}
      </div>

      <button onClick={addUrl}
        style={{ marginTop:8, background:'none', border:'none', color:C.brand, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', padding:0 }}>
        + Añadir otro calendario
      </button>

      {estado && estadoCfg && (
        <div style={{ marginTop:12, background:estadoCfg.bg, border:`1px solid ${estadoCfg.bd}`, borderRadius:10, padding:'9px 12px', fontSize:12.5, color:estadoCfg.col, fontWeight:600, lineHeight:1.4 }}>
          {estado.texto}
        </div>
      )}

      <button onClick={guardar} disabled={loading}
        style={{ marginTop:12, width:'100%', padding:12, borderRadius:10, border:'none', background:C.primary, color:'white', fontSize:13, fontWeight:700, cursor:'pointer', opacity:loading?0.6:1, fontFamily:'inherit' }}>
        {loading ? 'Probando calendario…' : '💾 Guardar y probar'}
      </button>
    </div>
  )
}

export default function CalendarioIcal({ token }: { token:string }) {
  const [props, setProps]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    fetch(`/api/propietario/${token}/ical`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setProps(d.propiedades || []); setLoading(false) })
      .catch(() => { setError('Error de conexión'); setLoading(false) })
  }, [token])

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ background:C.light, borderRadius:12, padding:'12px 14px', fontSize:12.5, color:C.text, lineHeight:1.5 }}>
        Pega aquí el <b>enlace iCal</b> de tu propiedad en Booking, Airbnb o VRBO. Lo sincronizamos
        automáticamente cada pocas horas para crear las limpiezas a partir de las salidas de los huéspedes.
        <br />Las reservas de <b>última hora del mismo día</b> avisan al instante al equipo.
      </div>

      {loading && <div style={{ textAlign:'center', padding:'32px 0', color:C.muted, fontSize:13, fontWeight:600 }}>Cargando…</div>}
      {!loading && error && <div style={{ textAlign:'center', padding:'24px 0', color:C.red, fontSize:13 }}>{error}</div>}
      {!loading && !error && props.length===0 && (
        <div style={{ textAlign:'center', padding:'40px 0', color:C.muted }}>
          <div style={{ fontSize:40, marginBottom:10 }}>🔗</div>
          <div style={{ fontWeight:600 }}>No tienes propiedades activas</div>
        </div>
      )}
      {!loading && !error && props.map(p => <PropiedadCard key={p.id} prop={p} token={token} />)}

      <div style={{ fontSize:11.5, color:C.muted, lineHeight:1.5, padding:'0 2px' }}>
        ¿Dónde encuentro el enlace? En Booking: <i>Calendario → Sincronizar calendarios → Exportar</i>.
        En Airbnb: <i>Calendario → Disponibilidad → Conectar calendarios → Exportar calendario</i>.
      </div>
    </div>
  )
}

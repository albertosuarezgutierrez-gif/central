'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

const C = {
  bg:'#14110E', bg2:'#1C1814', bg3:'#221E1A',
  red:'#D9442B', paper:'#F6F1E7', cream:'#EDE8DC',
  ink:'#F6F1E7', ink2:'#D8CDB6', ink3:'#9C8E7E', ink4:'#6B5F52',
  rule:'#2E2A26', green:'#3F7D44', amber:'#E8A33B', teal:'#2B6A6E',
}
const SE = 'Newsreader, Georgia, serif'
const SN = 'Inter Tight, system-ui, sans-serif'
const SM = 'Inter Tight, system-ui, sans-serif'

const ALERGENOS_LIST = [
  { id:'gluten',       label:'Gluten',       icon:'🌾' },
  { id:'crustaceos',   label:'Crustáceos',   icon:'🦐' },
  { id:'huevo',        label:'Huevo',        icon:'🥚' },
  { id:'pescado',      label:'Pescado',      icon:'🐟' },
  { id:'cacahuetes',   label:'Cacahuetes',   icon:'🥜' },
  { id:'soja',         label:'Soja',         icon:'🫘' },
  { id:'lacteos',      label:'Lácteos',      icon:'🥛' },
  { id:'frutos_secos', label:'Frutos secos', icon:'🌰' },
  { id:'apio',         label:'Apio',         icon:'🌿' },
  { id:'mostaza',      label:'Mostaza',      icon:'🌻' },
  { id:'sesamo',       label:'Sésamo',       icon:'⚪' },
  { id:'sulfitos',     label:'Sulfitos',     icon:'🍷' },
  { id:'moluscos',     label:'Moluscos',     icon:'🦪' },
  { id:'altramuz',     label:'Altramuz',     icon:'🌼' },
]

type Urgencia = 'ok' | 'manana' | 'hoy' | 'critica' | 'caducada'

type Elaboracion = {
  id: string
  nombre: string
  lote: string
  cantidad: number
  unidad: string
  num_raciones: number | null
  fecha_elaboracion: string
  fecha_caducidad: string
  alergenos: string[]
  temperatura_min: number | null
  temperatura_max: number | null
  instrucciones: string | null
  estado: string
  elaborado_por_nombre: string
  etiqueta_impresa_at: string | null
  etiqueta_impresa_veces: number
  horas_restantes: number
  urgencia: Urgencia
  producto_nombre: string | null
}

const URGENCIA_CONFIG: Record<Urgencia, { color: string; label: string; bg: string }> = {
  ok:       { color: C.green,  label: 'OK',         bg: '#1A2E1C' },
  manana:   { color: C.amber,  label: 'Mañana',     bg: '#2C2010' },
  hoy:      { color: '#F59E0B',label: 'Hoy',        bg: '#2E1E08' },
  critica:  { color: C.red,    label: '¡Crítico!',  bg: '#2E1010' },
  caducada: { color: C.ink4,   label: 'Caducada',   bg: C.bg2     },
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString('es-ES', {
    day:'2-digit', month:'2-digit', year:'2-digit',
    hour:'2-digit', minute:'2-digit',
  })
}

function fmtHoras(h: number) {
  if (h <= 0) return 'Caducada'
  if (h < 1) return `${Math.round(h * 60)}min`
  if (h < 24) return `${Math.round(h)}h`
  return `${Math.round(h / 24)}d`
}

// Generador de etiqueta HTML para impresión
function htmlEtiqueta(e: Elaboracion, nombreRestaurante: string): string {
  const alergStr = e.alergenos.length > 0
    ? e.alergenos.map(a => ALERGENOS_LIST.find(x => x.id === a)?.label ?? a).join(', ')
    : 'Ninguno declarado'
  const tempStr = e.temperatura_min !== null && e.temperatura_max !== null
    ? `${e.temperatura_min}°C – ${e.temperatura_max}°C`
    : e.temperatura_min !== null ? `Máx ${e.temperatura_min}°C` : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Etiqueta — ${e.nombre}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; font-size: 10px; color: #000; background: #fff; width: 72mm; }
  .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 3mm; margin-bottom: 3mm; }
  .restaurante { font-size: 8px; text-transform: uppercase; letter-spacing: 1px; }
  .nombre { font-size: 14px; font-weight: bold; margin: 2mm 0; }
  .lote { font-size: 8px; }
  .fila { display: flex; justify-content: space-between; margin-bottom: 1.5mm; }
  .label { color: #555; font-size: 8px; text-transform: uppercase; }
  .valor { font-weight: bold; font-size: 10px; }
  .fecha-cad { font-size: 13px; font-weight: bold; text-align: center; padding: 2mm; border: 2px solid #000; margin: 3mm 0; }
  .alergenos { border-top: 1px dashed #000; padding-top: 2mm; margin-top: 2mm; font-size: 8px; }
  .appcc { text-align: center; font-size: 7px; color: #888; margin-top: 3mm; border-top: 1px solid #ccc; padding-top: 2mm; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
<div class="header">
  <div class="restaurante">${nombreRestaurante}</div>
  <div class="nombre">${e.nombre}</div>
  <div class="lote">Lote: ${e.lote}</div>
</div>

<div class="fila">
  <span class="label">Elaborado</span>
  <span class="valor">${fmtFecha(e.fecha_elaboracion)}</span>
</div>
${e.num_raciones ? `<div class="fila"><span class="label">Raciones</span><span class="valor">${e.num_raciones}</span></div>` : ''}
${tempStr ? `<div class="fila"><span class="label">Temperatura</span><span class="valor">${tempStr}</span></div>` : ''}
${e.instrucciones ? `<div class="fila"><span class="label">Conservación</span><span class="valor">${e.instrucciones}</span></div>` : ''}
<div class="fila">
  <span class="label">Elaborado por</span>
  <span class="valor">${e.elaborado_por_nombre}</span>
</div>

<div class="fecha-cad">
  CAD: ${fmtFecha(e.fecha_caducidad)}
</div>

<div class="alergenos">
  <span class="label">Alérgenos: </span>${alergStr}
</div>

<div class="appcc">
  Registro APPCC · ia.rest · ${new Date().toLocaleDateString('es-ES')}
</div>
</body>
</html>`
}

export default function ElaboracionesPanel({
  session,
  sh,
  restauranteNombre = 'Restaurante',
}: {
  session: { id: string; nombre: string; restaurante_id: string }
  sh: () => Record<string, string>
  restauranteNombre?: string
}) {
  const [elaboraciones, setElaboraciones] = useState<Elaboracion[]>([])
  const [loading, setLoading]     = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')

  // Form
  const [nombre, setNombre]           = useState('')
  const [cantidad, setCantidad]       = useState('1')
  const [unidad, setUnidad]           = useState('unidad')
  const [numRaciones, setNumRaciones] = useState('')
  const [diasCad, setDiasCad]         = useState('3')
  const [fechaCadManual, setFechaCadManual] = useState('')
  const [usarFechaManual, setUsarFechaManual] = useState(false)
  const [alergenos, setAlergenos]     = useState<string[]>([])
  const [tempMin, setTempMin]         = useState('')
  const [tempMax, setTempMax]         = useState('')
  const [instrucciones, setInstrucciones] = useState('')
  const [notas, setNotas]             = useState('')

  const imprimirRef = useRef<HTMLIFrameElement | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/kds/elaboraciones', { headers: sh() })
    const d = await r.json().catch(() => ({ elaboraciones: [] }))
    setElaboraciones(d.elaboraciones ?? [])
    setLoading(false)
  }, [sh])

  useEffect(() => { cargar() }, [cargar])

  // Recargar cada 5 min
  useEffect(() => {
    const iv = setInterval(cargar, 300000)
    return () => clearInterval(iv)
  }, [cargar])

  const toggleAlergeno = (id: string) => {
    setAlergenos(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id])
  }

  const resetForm = () => {
    setNombre(''); setCantidad('1'); setUnidad('unidad'); setNumRaciones('')
    setDiasCad('3'); setFechaCadManual(''); setUsarFechaManual(false)
    setAlergenos([]); setTempMin(''); setTempMax(''); setInstrucciones('')
    setNotas(''); setErr('')
  }

  const crear = async () => {
    if (!nombre.trim()) return setErr('El nombre es obligatorio')
    setSaving(true); setErr('')
    try {
      const r = await fetch('/api/kds/elaboraciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({
          nombre: nombre.trim(),
          cantidad: parseFloat(cantidad) || 1,
          unidad: unidad || 'unidad',
          num_raciones: numRaciones ? parseInt(numRaciones) : null,
          dias_caducidad: !usarFechaManual ? parseInt(diasCad) : null,
          fecha_caducidad_manual: usarFechaManual ? fechaCadManual : null,
          alergenos,
          temperatura_min: tempMin ? parseFloat(tempMin) : null,
          temperatura_max: tempMax ? parseFloat(tempMax) : null,
          instrucciones: instrucciones.trim() || null,
          notas: notas.trim() || null,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Error creando elaboración')
      await cargar()
      setModalOpen(false)
      resetForm()

      // Imprimir etiqueta automáticamente al crear
      imprimirEtiqueta(d.elaboracion)
    } catch (e) {
      setErr(String(e))
    } finally {
      setSaving(false)
    }
  }

  const imprimirEtiqueta = (elab: Elaboracion) => {
    const html = htmlEtiqueta(elab, restauranteNombre)
    const win = window.open('', '_blank', 'width=400,height=600')
    if (win) {
      win.document.write(html)
      win.document.close()
      win.focus()
      setTimeout(() => { win.print(); }, 500)
    }
    // Registrar impresión
    fetch(`/api/kds/elaboraciones/${elab.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ etiqueta_impresa: true }),
    }).catch(() => {})
  }

  const cambiarEstado = async (id: string, estado: string) => {
    await fetch(`/api/kds/elaboraciones/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ estado }),
    })
    await cargar()
  }

  const criticas  = elaboraciones.filter(e => e.urgencia === 'critica')
  const activas   = elaboraciones.filter(e => e.urgencia !== 'caducada')

  return (
    <div style={{ fontFamily: SN }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: SE, fontStyle:'italic', fontSize: 22, color: C.ink }}>Elaboraciones propias</div>
          <div style={{ fontSize: 12, color: C.ink3 }}>Registro APPCC · alertas de caducidad</div>
        </div>
        <button onClick={() => { resetForm(); setModalOpen(true) }} style={{
          padding: '10px 18px', background: C.red, color: '#fff', border: 'none',
          borderRadius: 8, fontFamily: SN, fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}>
          + Nueva etiqueta
        </button>
      </div>

      {/* Alertas críticas */}
      {criticas.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {criticas.map(e => (
            <div key={e.id} style={{
              padding: '12px 16px', background: '#2E1010', border: `1px solid ${C.red}66`,
              borderRadius: 10, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontFamily: SM, fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 2 }}>
                  ⚠️ CADUCA EN {fmtHoras(e.horas_restantes)} — {e.nombre}
                </div>
                <div style={{ fontSize: 11, color: C.ink3 }}>Lote {e.lote} · {fmtFecha(e.fecha_caducidad)}</div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => imprimirEtiqueta(e)} style={{ padding:'6px 12px', background:'transparent', border:`1px solid ${C.ink4}`, borderRadius:6, color:C.ink3, fontSize:11, cursor:'pointer' }}>
                  🖨️ Imprimir
                </button>
                <button onClick={() => cambiarEstado(e.id, 'consumida')} style={{ padding:'6px 12px', background:C.green, border:'none', borderRadius:6, color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                  ✅ Consumida
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lista elaboraciones */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', fontFamily:SE, fontStyle:'italic', color:C.ink3 }}>Cargando…</div>
      ) : activas.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px', color:C.ink3 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏷️</div>
          <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:15 }}>Sin elaboraciones activas</div>
          <div style={{ fontSize:12, marginTop:4 }}>Pulsa "+ Nueva etiqueta" para registrar una preparación</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {activas.map(e => {
            const urg = URGENCIA_CONFIG[e.urgencia]
            return (
              <div key={e.id} style={{
                background: urg.bg, border:`1px solid ${urg.color}44`,
                borderRadius: 10, padding: '12px 16px',
              }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                      <span style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:urg.color, padding:'2px 8px', background:`${urg.color}22`, borderRadius:10 }}>
                        {urg.label} — {fmtHoras(e.horas_restantes)}
                      </span>
                      {e.etiqueta_impresa_at && (
                        <span style={{ fontSize:10, color:C.ink4 }}>🖨️ ×{e.etiqueta_impresa_veces}</span>
                      )}
                    </div>
                    <div style={{ fontSize:15, fontWeight:700, color:C.ink, marginBottom:3 }}>{e.nombre}</div>
                    <div style={{ fontSize:11, color:C.ink3 }}>
                      Lote {e.lote} · {e.cantidad} {e.unidad}
                      {e.num_raciones ? ` · ${e.num_raciones} raciones` : ''}
                      {' · '}Elaborado por {e.elaborado_por_nombre}
                    </div>
                    <div style={{ fontSize:11, color:C.ink4, marginTop:2 }}>
                      Elaborado: {fmtFecha(e.fecha_elaboracion)} · Caduca: {fmtFecha(e.fecha_caducidad)}
                    </div>
                    {e.alergenos.length > 0 && (
                      <div style={{ fontSize:10, color:C.amber, marginTop:4 }}>
                        ⚠️ {e.alergenos.map(a => ALERGENOS_LIST.find(x => x.id === a)?.label ?? a).join(', ')}
                      </div>
                    )}
                    {e.temperatura_min !== null && (
                      <div style={{ fontSize:10, color:C.ink4, marginTop:2 }}>
                        🌡️ {e.temperatura_min}°C – {e.temperatura_max}°C
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:5, flexShrink:0 }}>
                    <button onClick={() => imprimirEtiqueta(e)} style={{
                      padding:'6px 12px', background:'transparent', border:`1px solid ${C.ink4}44`,
                      borderRadius:6, color:C.ink3, fontSize:11, cursor:'pointer',
                    }}>🖨️ Imprimir</button>
                    <button onClick={() => cambiarEstado(e.id, 'consumida')} style={{
                      padding:'6px 12px', background:C.green, border:'none',
                      borderRadius:6, color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer',
                    }}>✅ Consumida</button>
                    <button onClick={() => cambiarEstado(e.id, 'retirada')} style={{
                      padding:'6px 12px', background:'transparent', border:`1px solid ${C.ink4}33`,
                      borderRadius:6, color:C.ink4, fontSize:11, cursor:'pointer',
                    }}>🗑️ Retirar</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal crear elaboración */}
      {modalOpen && (
        <div style={{ position:'fixed', inset:0, background:'#00000088', zIndex:300, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div style={{
            background:C.bg2, borderRadius:'16px 16px 0 0', padding:'24px 20px',
            width:'100%', maxWidth:600, maxHeight:'90dvh', overflowY:'auto',
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:20, color:C.ink }}>🏷️ Nueva elaboración</div>
              <button onClick={() => setModalOpen(false)} style={{ background:'none', border:'none', color:C.ink3, fontSize:20, cursor:'pointer' }}>✕</button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              {/* Nombre */}
              <div>
                <label style={{ display:'block', fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink3, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>Nombre del producto *</label>
                <input value={nombre} onChange={e => setNombre(e.target.value)}
                  placeholder="Ej: Ensaladilla rusa, Salsa romesco..."
                  style={{ width:'100%', padding:'10px 14px', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:8, fontFamily:SN, fontSize:15, color:C.ink, outline:'none', boxSizing:'border-box' as const }} />
              </div>

              {/* Cantidad + unidad */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                <div>
                  <label style={{ display:'block', fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink3, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>Cantidad</label>
                  <input type="number" min="0" step="0.1" value={cantidad} onChange={e => setCantidad(e.target.value)}
                    style={{ width:'100%', padding:'10px', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:8, fontFamily:SN, fontSize:14, color:C.ink, outline:'none', boxSizing:'border-box' as const }} />
                </div>
                <div>
                  <label style={{ display:'block', fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink3, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>Unidad</label>
                  <select value={unidad} onChange={e => setUnidad(e.target.value)}
                    style={{ width:'100%', padding:'10px', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:8, fontFamily:SN, fontSize:14, color:C.ink, outline:'none', boxSizing:'border-box' as const }}>
                    {['kg','g','l','ml','unidad','bandeja','cubeta','bote'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display:'block', fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink3, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>Raciones</label>
                  <input type="number" min="0" value={numRaciones} onChange={e => setNumRaciones(e.target.value)}
                    placeholder="—" style={{ width:'100%', padding:'10px', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:8, fontFamily:SN, fontSize:14, color:C.ink, outline:'none', boxSizing:'border-box' as const }} />
                </div>
              </div>

              {/* Caducidad */}
              <div>
                <label style={{ display:'block', fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink3, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>Caducidad</label>
                <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                  <button onClick={() => setUsarFechaManual(false)} style={{
                    flex:1, padding:'8px', borderRadius:8,
                    background: !usarFechaManual ? C.teal : C.bg3,
                    border:`1px solid ${!usarFechaManual ? C.teal : C.rule}`,
                    color: !usarFechaManual ? '#fff' : C.ink3, fontFamily:SN, fontSize:12, cursor:'pointer',
                  }}>Por días</button>
                  <button onClick={() => setUsarFechaManual(true)} style={{
                    flex:1, padding:'8px', borderRadius:8,
                    background: usarFechaManual ? C.teal : C.bg3,
                    border:`1px solid ${usarFechaManual ? C.teal : C.rule}`,
                    color: usarFechaManual ? '#fff' : C.ink3, fontFamily:SN, fontSize:12, cursor:'pointer',
                  }}>Fecha exacta</button>
                </div>
                {!usarFechaManual ? (
                  <div style={{ display:'flex', gap:8 }}>
                    {[1,2,3,5,7].map(d => (
                      <button key={d} onClick={() => setDiasCad(String(d))} style={{
                        flex:1, padding:'8px', borderRadius:8,
                        background: diasCad === String(d) ? C.red : C.bg3,
                        border:`1px solid ${diasCad === String(d) ? C.red : C.rule}`,
                        color: diasCad === String(d) ? '#fff' : C.ink3,
                        fontFamily:SN, fontSize:12, fontWeight: diasCad === String(d) ? 700 : 400, cursor:'pointer',
                      }}>{d}d</button>
                    ))}
                  </div>
                ) : (
                  <input type="datetime-local" value={fechaCadManual} onChange={e => setFechaCadManual(e.target.value)}
                    style={{ width:'100%', padding:'10px', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:8, fontFamily:SN, fontSize:14, color:C.ink, outline:'none', boxSizing:'border-box' as const }} />
                )}
              </div>

              {/* Temperatura */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={{ display:'block', fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink3, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>Temp. mín (°C)</label>
                  <input type="number" step="0.5" value={tempMin} onChange={e => setTempMin(e.target.value)}
                    placeholder="0" style={{ width:'100%', padding:'10px', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:8, fontFamily:SN, fontSize:14, color:C.ink, outline:'none', boxSizing:'border-box' as const }} />
                </div>
                <div>
                  <label style={{ display:'block', fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink3, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>Temp. máx (°C)</label>
                  <input type="number" step="0.5" value={tempMax} onChange={e => setTempMax(e.target.value)}
                    placeholder="4" style={{ width:'100%', padding:'10px', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:8, fontFamily:SN, fontSize:14, color:C.ink, outline:'none', boxSizing:'border-box' as const }} />
                </div>
              </div>

              {/* Alérgenos */}
              <div>
                <label style={{ display:'block', fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink3, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>Alérgenos</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {ALERGENOS_LIST.map(a => (
                    <button key={a.id} onClick={() => toggleAlergeno(a.id)} style={{
                      padding:'5px 10px', borderRadius:20,
                      background: alergenos.includes(a.id) ? C.amber : C.bg3,
                      border:`1px solid ${alergenos.includes(a.id) ? C.amber : C.rule}`,
                      color: alergenos.includes(a.id) ? '#000' : C.ink4,
                      fontFamily:SN, fontSize:11, cursor:'pointer',
                    }}>{a.icon} {a.label}</button>
                  ))}
                </div>
              </div>

              {/* Instrucciones */}
              <div>
                <label style={{ display:'block', fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink3, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>Instrucciones de conservación</label>
                <input value={instrucciones} onChange={e => setInstrucciones(e.target.value)}
                  placeholder="Ej: Conservar en frío. Agitar antes de servir."
                  style={{ width:'100%', padding:'10px', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:8, fontFamily:SN, fontSize:13, color:C.ink, outline:'none', boxSizing:'border-box' as const }} />
              </div>

              {err && (
                <div style={{ padding:'10px', background:'#2E1010', borderRadius:8, fontSize:13, color:C.red }}>{err}</div>
              )}

              <button onClick={crear} disabled={saving} style={{
                padding:'14px', background: saving ? C.ink4 : C.red, color:'#fff', border:'none',
                borderRadius:10, fontFamily:SN, fontSize:15, fontWeight:700,
                cursor: saving ? 'default' : 'pointer',
              }}>
                {saving ? 'Guardando…' : '✅ Crear e imprimir etiqueta'}
              </button>
            </div>
          </div>
        </div>
      )}

      <iframe ref={imprimirRef} style={{ display:'none' }} />
    </div>
  )
}

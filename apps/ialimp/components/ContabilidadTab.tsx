'use client'
import { useState, useEffect, useRef } from 'react'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)',
  bg:'#f1f5f9', text:'#1e293b', muted:'#64748b', border:'#e2e8f0',
  ok:'#16a34a', okBg:'#f0fdf4', okBorder:'#bbf7d0',
  warn:'#d97706', warnBg:'#fffbeb',
  red:'#dc2626', redBg:'#fef2f2',
  white:'#ffffff',
}

const CATEGORIAS: Record<string,{icon:string,label:string,color:string}> = {
  hipoteca:           { icon:'🏦', label:'Hipoteca',           color:'#6366f1' },
  alquiler_prop:      { icon:'🤝', label:'Alquiler propietario',color:'#7c3aed' },
  comunidad:          { icon:'🏢', label:'Comunidad',           color:'#0ea5e9' },
  seguro:             { icon:'🛡️', label:'Seguro',              color:'#8b5cf6' },
  suministros:        { icon:'⚡', label:'Suministros',         color:'#f59e0b' },
  internet:           { icon:'📡', label:'Internet/TV',         color:'#06b6d4' },
  limpieza:           { icon:'🧹', label:'Limpieza',            color:'#10b981' },
  lavanderia:         { icon:'👕', label:'Lavandería',          color:'#14b8a6' },
  reparacion:         { icon:'🔧', label:'Reparación',          color:'#ef4444' },
  menaje:             { icon:'🛋️', label:'Menaje/Lencería',     color:'#ec4899' },
  gestion:            { icon:'📋', label:'Gestión/Gestoría',    color:'#64748b' },
  plataforma:         { icon:'💻', label:'Plataformas',         color:'#0284c7' },
  impuesto:           { icon:'📑', label:'Impuestos',           color:'#dc2626' },
  marketing:          { icon:'📣', label:'Marketing',           color:'#f97316' },
  otros:              { icon:'📦', label:'Otros',               color:'#94a3b8' },
}

const PORTALES = ['booking','airbnb','expedia','vrbo','directo','otro']

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const PERIODICIDAD: Record<string,{label:string,icon:string,vecesAnio:number}> = {
  semanal:      { label:'Semanal',      icon:'📅', vecesAnio:52  },
  mensual:      { label:'Mensual',      icon:'🔁', vecesAnio:12  },
  bimestral:    { label:'Bimestral',    icon:'🔁', vecesAnio:6   },
  trimestral:   { label:'Trimestral',   icon:'🗓️', vecesAnio:4   },
  semestral:    { label:'Semestral',    icon:'🗓️', vecesAnio:2   },
  anual:        { label:'Anual',        icon:'📆', vecesAnio:1   },
  puntual:      { label:'Puntual',      icon:'1️⃣', vecesAnio:1   },
}

// Calcula coste anual proyectado de un gasto recurrente
function proyectarAnual(importe: number, periodicidad: string): number {
  const cfg = PERIODICIDAD[periodicidad]
  if (!cfg) return importe
  return importe * cfg.vecesAnio
}

// Próximo cargo estimado desde hoy
function proximoCargo(periodicidad: string, fechaInicio?: string): string {
  const hoy = new Date()
  if (!fechaInicio) return '—'
  const inicio = new Date(fechaInicio)
  if (periodicidad === 'puntual') return inicio.toLocaleDateString('es-ES',{day:'numeric',month:'short'})
  // Calcular siguiente ocurrencia
  const dias: Record<string,number> = { semanal:7, mensual:30, bimestral:60, trimestral:90, semestral:180, anual:365 }
  const intervalo = dias[periodicidad] || 30
  let siguiente = new Date(inicio)
  while (siguiente <= hoy) siguiente = new Date(siguiente.getTime() + intervalo * 86400000)
  const diff = Math.round((siguiente.getTime() - hoy.getTime()) / 86400000)
  if (diff <= 7)  return `En ${diff}d ⚠️`
  if (diff <= 30) return `En ${diff}d`
  return siguiente.toLocaleDateString('es-ES',{day:'numeric',month:'short'})
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)
}
function fmtD(n: number) {
  return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',minimumFractionDigits:2}).format(n)
}

/* ── Mini barra horizontal ── */
function BarraH({ value, max, color }: { value:number; max:number; color:string }) {
  const pct = max > 0 ? Math.min(100, (value/max)*100) : 0
  return (
    <div style={{ height:6, background:'#e2e8f0', borderRadius:4, overflow:'hidden', flex:1 }}>
      <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:4, transition:'width .4s' }} />
    </div>
  )
}

/* ── Modal nuevo gasto ── */
function NuevoGastoModal({ token, propiedades, onClose, onGuardado }: any) {
  const [form, setForm] = useState({
    nombre:'', categoria:'otros', importe:'', periodicidad:'mensual',
    mes: String(new Date().getMonth()+1), anio: new Date().getFullYear().toString(),
    recurrente:false, fecha_inicio: new Date().toISOString().split('T')[0],
    proveedor:'', notas:'', propiedad_id:'',
    fecha_vencimiento:'', es_ingreso:false,
  })
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState('')
  const [scanning, setScanning] = useState(false)
  const [imgPreview, setImgPreview] = useState<string|null>(null)
  const [iaResultado, setIaResultado] = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (k: string, v: any) => setForm(p => ({...p, [k]: v}))

  // Mapeo categorías IA → categorías del formulario
  const mapCategoria = (cat: string) => {
    const m: Record<string,string> = {
      limpieza:'limpieza', suministros:'suministros', mantenimiento:'reparacion',
      lenceria:'menaje', alimentacion:'otros', otros:'otros',
      seguro:'seguro', hipoteca:'hipoteca', comunidad:'comunidad',
      impuesto:'impuesto', gestion:'gestion',
    }
    return m[cat] || 'otros'
  }

  async function escanearFoto(file: File) {
    setScanning(true); setErr('')
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = e => res((e.target?.result as string).split(',')[1])
        r.onerror = () => rej(new Error('Error leyendo imagen'))
        r.readAsDataURL(file)
      })
      setImgPreview(URL.createObjectURL(file))

      const resp = await fetch(`/api/propietario/${token}/escanear`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ imagen_base64: base64, media_type: file.type || 'image/jpeg' })
      })
      const d = await resp.json()
      if (!resp.ok) throw new Error(d.error || 'Error IA')

      const ia = d.datos_ia
      setIaResultado(d)

      // Rellenar formulario con datos IA
      setForm(prev => ({
        ...prev,
        nombre:    ia.descripcion_corta || ia.proveedor || prev.nombre,
        categoria: mapCategoria(ia.categoria || 'otros'),
        importe:   d.total ? String(d.total) : prev.importe,
        proveedor: ia.proveedor || prev.proveedor,
        notas:     ia.notas || prev.notas,
        mes:       ia.fecha ? String(new Date(ia.fecha).getMonth()+1) : prev.mes,
        anio:      ia.fecha ? String(new Date(ia.fecha).getFullYear()) : prev.anio,
      }))
    } catch(e: any) {
      setErr('IA: ' + e.message)
    }
    setScanning(false)
  }

  async function guardar() {
    if (!form.nombre || !form.importe) { setErr('Nombre e importe obligatorios'); return }
    setSaving(true); setErr('')
    const r = await fetch(`/api/propietario/${token}/gastos`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        ...form,
        importe: Number(form.importe),
        mes: form.recurrente ? null : (form.mes ? Number(form.mes) : null),
        anio: form.anio ? Number(form.anio) : null,
        propiedad_id: form.propiedad_id || null,
        fecha_vencimiento: form.fecha_vencimiento || null,
        fecha_inicio: form.recurrente ? (form.fecha_inicio || null) : null,
        periodicidad: form.periodicidad,
      })
    })
    const d = await r.json()
    if (d.ok || d.id) { onGuardado() }
    else { setErr(d.error || 'Error'); setSaving(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:300, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:20, width:'100%', maxWidth:480, maxHeight:'92vh', overflowY:'auto' }}>
        <div style={{ padding:'18px 20px 14px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'white', zIndex:1 }}>
          <div style={{ fontWeight:800, fontSize:17, color:C.text }}>➕ Nuevo gasto</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, color:C.muted, cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:14 }}>

          {/* ── Escáner IA ── */}
          <div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
              onChange={e => { const f = e.target.files?.[0]; if(f) escanearFoto(f); e.target.value='' }} />

            {!imgPreview && !scanning && (
              <button onClick={() => fileRef.current?.click()}
                style={{ width:'100%', padding:'14px', borderRadius:12, border:`2px dashed ${C.primary}`,
                  background:C.light, color:C.primary, fontSize:14, fontWeight:700, cursor:'pointer',
                  fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                <span style={{ fontSize:22 }}>📷</span> Fotografiar ticket o factura · IA rellena sola
              </button>
            )}

            {scanning && (
              <div style={{ width:'100%', padding:'18px', borderRadius:12, background:C.light, textAlign:'center' }}>
                <div style={{ fontSize:28, marginBottom:6 }}>🤖</div>
                <div style={{ fontSize:13, fontWeight:700, color:C.primary }}>Analizando con IA...</div>
                <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>Extrayendo importe, proveedor y categoría</div>
              </div>
            )}

            {imgPreview && !scanning && (
              <div style={{ position:'relative', borderRadius:10, overflow:'hidden', marginBottom:2 }}>
                <img src={imgPreview} style={{ width:'100%', maxHeight:140, objectFit:'cover', display:'block' }} />
                <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.35)', display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
                  {iaResultado && (
                    <div style={{ background:'rgba(79,70,229,.9)', borderRadius:10, padding:'8px 14px', textAlign:'center' }}>
                      <div style={{ fontSize:11, color:'rgba(255,255,255,.7)' }}>✨ IA extrajo</div>
                      <div style={{ fontSize:15, fontWeight:800, color:'white' }}>{iaResultado.total?.toFixed(2)} €</div>
                      <div style={{ fontSize:11, color:'#a5b4fc' }}>{iaResultado.datos_ia?.proveedor || '—'}</div>
                    </div>
                  )}
                  <button onClick={() => { setImgPreview(null); setIaResultado(null); fileRef.current?.click() }}
                    style={{ background:'rgba(255,255,255,.2)', border:'1px solid rgba(255,255,255,.4)', color:'white', borderRadius:8, padding:'6px 10px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                    🔄 Cambiar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Concepto */}
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:C.muted, display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Concepto *</label>
            <input value={form.nombre} onChange={e => set('nombre', e.target.value)}
              placeholder="Ej: Seguro hogar Mapfre, Cuota comunidad..."
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:14, fontFamily:'inherit', color:C.text }} />
          </div>

          {/* Categoría */}
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:C.muted, display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>Categoría</label>
            <div style={{ display:'flex', gap:6, overflowX:'auto', scrollbarWidth:'none', paddingBottom:2 }}>
              {Object.entries(CATEGORIAS).filter(([k]) => k !== 'limpieza').map(([k, v]) => (
                <button key={k} onClick={() => set('categoria', k)}
                  style={{ flexShrink:0, padding:'7px 10px', borderRadius:20, border:`2px solid ${form.categoria===k ? v.color : C.border}`,
                    background: form.categoria===k ? v.color+'15' : 'white', cursor:'pointer', fontFamily:'inherit',
                    display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ fontSize:14 }}>{v.icon}</span>
                  <span style={{ fontSize:11, fontWeight: form.categoria===k ? 700 : 500, color: form.categoria===k ? v.color : C.muted, whiteSpace:'nowrap' }}>{v.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Importe */}
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:C.muted, display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Importe € *</label>
            <input type="number" step="0.01" value={form.importe} onChange={e => set('importe', e.target.value)}
              placeholder="0,00"
              style={{ width:'100%', padding:'12px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:20, fontWeight:800, fontFamily:'inherit', color:C.primary }} />
          </div>

          {/* ── Recurrente toggle ── */}
          <div style={{ background: form.recurrente ? C.light : C.bg, borderRadius:12, padding:'12px 14px', border:`2px solid ${form.recurrente ? C.primary : C.border}` }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: form.recurrente ? 14 : 0 }}>
              <div>
                <div style={{ fontWeight:700, fontSize:13, color: form.recurrente ? C.primary : C.text }}>🔁 Gasto recurrente</div>
                <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                  {form.recurrente && form.importe
                    ? `${fmt(proyectarAnual(Number(form.importe), form.periodicidad))}/año proyectado`
                    : 'Alquiler, hipoteca, suministros, suscripciones...'}
                </div>
              </div>
              <button onClick={() => set('recurrente', !form.recurrente)}
                style={{ width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', position:'relative', flexShrink:0,
                  background: form.recurrente ? C.primary : '#cbd5e1', transition:'background .2s' }}>
                <div style={{ position:'absolute', top:2, width:20, height:20, borderRadius:'50%', background:'white',
                  boxShadow:'0 1px 3px rgba(0,0,0,.2)', transition:'left .2s',
                  left: form.recurrente ? 22 : 2 }} />
              </button>
            </div>

            {form.recurrente && (
              <>
                {/* Frecuencia */}
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:8, textTransform:'uppercase', letterSpacing:'.05em' }}>Frecuencia</div>
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                    {Object.entries(PERIODICIDAD).filter(([k]) => k !== 'puntual').map(([k, v]) => (
                      <button key={k} onClick={() => set('periodicidad', k)}
                        style={{ padding:'6px 12px', borderRadius:20, border:`2px solid ${form.periodicidad===k ? C.primary : C.border}`,
                          background: form.periodicidad===k ? C.primary : 'white', cursor:'pointer', fontFamily:'inherit',
                          fontSize:12, fontWeight: form.periodicidad===k ? 700 : 500,
                          color: form.periodicidad===k ? 'white' : C.muted }}>
                        {v.icon} {v.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fecha inicio + proyección */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Desde</div>
                    <input type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)}
                      style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, fontFamily:'inherit', color:C.text }} />
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Próximo cargo</div>
                    <div style={{ padding:'8px 10px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, color:C.text, background:'white', fontWeight:700 }}>
                      {proximoCargo(form.periodicidad, form.fecha_inicio)}
                    </div>
                  </div>
                </div>

                {/* Hasta (opcional) */}
                <div style={{ marginTop:10 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Hasta (opcional)</div>
                  <input type="date" value={form.fecha_vencimiento} onChange={e => set('fecha_vencimiento', e.target.value)}
                    style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, fontFamily:'inherit', color:C.text }} />
                  <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>Dejar vacío si el gasto no tiene fecha de fin</div>
                </div>
              </>
            )}

            {!form.recurrente && (
              <div style={{ marginTop:12, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Mes</div>
                  <select value={form.mes} onChange={e => set('mes', e.target.value)}
                    style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, fontFamily:'inherit', color:C.text }}>
                    <option value="">— Todos —</option>
                    {MESES.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Año</div>
                  <input type="number" value={form.anio} onChange={e => set('anio', e.target.value)}
                    style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, fontFamily:'inherit', color:C.text }} />
                </div>
              </div>
            )}
          </div>

          {/* Apartamento */}
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:C.muted, display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Apartamento</label>
            <select value={form.propiedad_id} onChange={e => set('propiedad_id', e.target.value)}
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, fontFamily:'inherit', color:C.text }}>
              <option value="">— General (todos) —</option>
              {propiedades.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>

          {/* Proveedor */}
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:C.muted, display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Proveedor / Empresa</label>
            <input value={form.proveedor} onChange={e => set('proveedor', e.target.value)}
              placeholder="Ej: Mapfre, Endesa, Comunidad propietarios..."
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:14, fontFamily:'inherit', color:C.text }} />
          </div>

          {/* Notas */}
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:C.muted, display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Notas</label>
            <textarea value={form.notas} onChange={e => set('notas', e.target.value)}
              rows={2} placeholder="Número de póliza, contrato, observaciones..."
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, fontFamily:'inherit', resize:'none', color:C.text }} />
          </div>

          {err && <div style={{ background:C.redBg, border:'1px solid #fca5a5', borderRadius:8, padding:'10px 14px', fontSize:13, color:C.red }}>{err}</div>}

          <div style={{ display:'flex', gap:10 }}>
            <button onClick={onClose}
              style={{ flex:1, padding:'12px', borderRadius:10, border:`1px solid ${C.border}`, background:'white', color:C.muted, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
              Cancelar
            </button>
            <button onClick={guardar} disabled={saving}
              style={{ flex:2, padding:'12px', borderRadius:10, border:'none', background:C.primary, color:'white', fontSize:13, fontWeight:700, cursor:saving?'wait':'pointer', fontFamily:'inherit', opacity:saving?.6:1 }}>
              {saving ? 'Guardando...' : '💾 Guardar gasto'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Modal nuevo ingreso ── */
function NuevoIngresoModal({ token, propiedades, onClose, onGuardado }: any) {
  const [form, setForm] = useState({
    concepto:'', importe:'', fecha: new Date().toISOString().split('T')[0],
    portal:'directo', num_noches:'', notas:'', propiedad_id:'',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const set = (k: string, v: any) => setForm(p => ({...p, [k]: v}))

  async function guardar() {
    if (!form.concepto || !form.importe) { setErr('Concepto e importe obligatorios'); return }
    setSaving(true); setErr('')
    const r = await fetch(`/api/propietario/${token}/contabilidad`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ ...form, importe: Number(form.importe), num_noches: form.num_noches ? Number(form.num_noches) : null, propiedad_id: form.propiedad_id || null })
    })
    const d = await r.json()
    if (d.ok) { onGuardado() }
    else { setErr(d.error || 'Error'); setSaving(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:300, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:20, width:'100%', maxWidth:480, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ padding:'18px 20px 14px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'white', zIndex:1 }}>
          <div style={{ fontWeight:800, fontSize:17, color:C.text }}>💰 Nuevo ingreso</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, color:C.muted, cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:C.muted, display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Concepto *</label>
            <input value={form.concepto} onChange={e => set('concepto', e.target.value)}
              placeholder="Ej: Reserva 3-7 junio, Ingreso Booking..."
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:14, fontFamily:'inherit', color:C.text }} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:C.muted, display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Importe € *</label>
              <input type="number" step="0.01" value={form.importe} onChange={e => set('importe', e.target.value)}
                placeholder="0,00"
                style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:16, fontWeight:700, fontFamily:'inherit', color:C.ok }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:C.muted, display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Nº noches</label>
              <input type="number" value={form.num_noches} onChange={e => set('num_noches', e.target.value)}
                placeholder="7"
                style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:14, fontFamily:'inherit', color:C.text }} />
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:C.muted, display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Fecha</label>
              <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)}
                style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, fontFamily:'inherit', color:C.text }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:C.muted, display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Portal</label>
              <select value={form.portal} onChange={e => set('portal', e.target.value)}
                style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, fontFamily:'inherit', color:C.text }}>
                {PORTALES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:C.muted, display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Apartamento</label>
            <select value={form.propiedad_id} onChange={e => set('propiedad_id', e.target.value)}
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, fontFamily:'inherit', color:C.text }}>
              <option value="">— General —</option>
              {propiedades.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:C.muted, display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Notas</label>
            <input value={form.notas} onChange={e => set('notas', e.target.value)}
              placeholder="Referencia Booking, número reserva..."
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, fontFamily:'inherit', color:C.text }} />
          </div>
          {err && <div style={{ background:C.redBg, border:'1px solid #fca5a5', borderRadius:8, padding:'10px 14px', fontSize:13, color:C.red }}>{err}</div>}
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={onClose}
              style={{ flex:1, padding:'12px', borderRadius:10, border:`1px solid ${C.border}`, background:'white', color:C.muted, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
              Cancelar
            </button>
            <button onClick={guardar} disabled={saving}
              style={{ flex:2, padding:'12px', borderRadius:10, border:'none', background:C.ok, color:'white', fontSize:13, fontWeight:700, cursor:saving?'wait':'pointer', fontFamily:'inherit', opacity:saving?.6:1 }}>
              {saving ? 'Guardando...' : '💰 Guardar ingreso'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Componente principal ── */
export default function ContabilidadTab({ token }: { token: string }) {
  const anioActual = new Date().getFullYear()
  const [data, setData]             = useState<any>(null)
  const [loading, setLoading]       = useState(true)
  const [anio, setAnio]             = useState(anioActual)
  const [propFiltro, setPropFiltro] = useState('')
  const [seccion, setSeccion]       = useState<'resumen'|'gastos'|'ingresos'|'pisos'|'facturas'>('resumen')
  const [showGasto, setShowGasto]   = useState(false)
  const [showIngreso, setShowIngreso] = useState(false)

  useEffect(() => { cargar() }, [anio, propFiltro])

  async function cargar() {
    setLoading(true)
    const qs = new URLSearchParams({ anio: anio.toString() })
    if (propFiltro) qs.set('propiedad_id', propFiltro)
    const r = await fetch(`/api/propietario/${token}/contabilidad?${qs}`)
    const d = await r.json()
    setData(d)
    setLoading(false)
  }

  if (loading && !data) return (
    <div style={{ textAlign:'center', padding:'48px 16px', color:C.muted }}>
      <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
      <div style={{ fontSize:13 }}>Cargando contabilidad...</div>
    </div>
  )

  const { totales, kpisMes, categorias, porPropiedad, gastos, ingresos, propiedades, facturas } = data || {}
  const maxBar = Math.max(...(kpisMes||[]).map((m: any) => Math.max(m.ingresos, m.gastos, 1)))
  const maxCat = Math.max(...Object.values(categorias||{}).map((v: any) => v), 1)

  return (
    <div style={{ fontFamily:"'Nunito',sans-serif", paddingBottom:40 }}>

      {/* ── Header ── */}
      <div style={{ background:`linear-gradient(135deg, ${C.primary} 0%, ${C.brand} 100%)`, borderRadius:16, padding:'18px 16px', marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
          <div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.6)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em' }}>Contabilidad</div>
            <div style={{ fontSize:24, fontWeight:800, color:'white', marginTop:2 }}>{anio}</div>
          </div>
          {/* Selector año */}
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <button onClick={() => setAnio(a => a-1)}
              style={{ background:'rgba(255,255,255,.15)', border:'none', color:'white', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>‹</button>
            <span style={{ color:'white', fontWeight:700, fontSize:14 }}>{anio}</span>
            <button onClick={() => setAnio(a => a+1)} disabled={anio >= anioActual}
              style={{ background: anio >= anioActual ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.15)', border:'none', color: anio >= anioActual ? 'rgba(255,255,255,.3)' : 'white', borderRadius:8, width:32, height:32, cursor: anio >= anioActual ? 'default' : 'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>›</button>
          </div>
        </div>

        {/* KPIs principales */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          {[
            { label:'Ingresos', value: fmt(totales?.totalIngresos||0), color:'#4ade80', sub:'' },
            { label:'Gastos',   value: fmt(totales?.totalGastos||0),   color:'#f87171', sub:'' },
            { label:'Beneficio',value: fmt(Math.abs(totales?.beneficioNeto||0)),
              color: (totales?.beneficioNeto||0) >= 0 ? '#4ade80' : '#f87171',
              sub: `${totales?.margen||0}% margen` },
          ].map(k => (
            <div key={k.label} style={{ background:'rgba(255,255,255,.12)', borderRadius:12, padding:'10px 12px' }}>
              <div style={{ fontSize:10, color:'rgba(255,255,255,.6)', fontWeight:700, textTransform:'uppercase' }}>{k.label}</div>
              <div style={{ fontSize:16, fontWeight:800, color:k.color, marginTop:3, letterSpacing:'-.01em' }}>{k.value}</div>
              {k.sub && <div style={{ fontSize:10, color:'rgba(255,255,255,.5)', marginTop:2 }}>{k.sub}</div>}
            </div>
          ))}
        </div>

        {/* Filtro apartamento */}
        {propiedades?.length > 1 && (
          <div style={{ marginTop:12 }}>
            <select value={propFiltro} onChange={e => setPropFiltro(e.target.value)}
              style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)', background:'rgba(255,255,255,.1)', color:'white', fontSize:12, fontFamily:'inherit' }}>
              <option value="">🏢 Todos los apartamentos</option>
              {propiedades.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ── Botones acción ── */}
      <div style={{ fontSize:12, color:C.muted, fontWeight:600, marginBottom:8, textAlign:'center' }}>
        Registra aquí tus propios ingresos y gastos
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
        <button onClick={() => setShowGasto(true)}
          style={{ padding:'12px', borderRadius:12, border:`2px solid ${C.border}`, background:'white', color:C.text, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
          <span style={{ fontSize:18 }}>➕</span> Añadir gasto
        </button>
        <button onClick={() => setShowIngreso(true)}
          style={{ padding:'12px', borderRadius:12, border:`2px solid ${C.ok}`, background:C.okBg, color:C.ok, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
          <span style={{ fontSize:18 }}>💰</span> Añadir ingreso
        </button>
      </div>

      {/* ── Tabs sección ── */}
      <div style={{ display:'flex', background:'white', borderRadius:12, padding:4, marginBottom:16, gap:2 }}>
        {([
          {k:'resumen', label:'📊 Resumen'},
          {k:'gastos',  label:'📉 Gastos'},
          {k:'ingresos',label:'📈 Ingresos'},
          {k:'pisos',   label:'🏢 Por piso'},
          {k:'facturas',label:'🧾 Facturas'},
        ] as const).map(s => (
          <button key={s.k} onClick={() => setSeccion(s.k)}
            style={{ flex:1, padding:'8px 4px', borderRadius:8, border:'none', background: seccion===s.k ? C.primary : 'transparent',
              color: seccion===s.k ? 'white' : C.muted, fontSize:11, fontWeight: seccion===s.k ? 700 : 500,
              cursor:'pointer', fontFamily:'inherit', transition:'all .15s' }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ══ SECCIÓN RESUMEN ══ */}
      {seccion === 'resumen' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

          {/* ── Proyección anual de recurrentes ── */}
          {(() => {
            const recurrentes = (gastos||[]).filter((g: any) => g.recurrente)
            if (recurrentes.length === 0) return null
            const mesActual = new Date().getMonth() + 1
            const mesesRestantes = 12 - mesActual
            const proyAnual = recurrentes.reduce((a: number, g: any) =>
              a + proyectarAnual(g.importe || 0, g.periodicidad || 'mensual'), 0)
            const proyResto = recurrentes.reduce((a: number, g: any) =>
              a + (g.importe || 0) * (PERIODICIDAD[g.periodicidad]?.vecesAnio || 12) / 12 * mesesRestantes, 0)
            return (
              <div style={{ background:`linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)`, borderRadius:14, padding:'16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                  <div>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em' }}>Proyección gastos fijos</div>
                    <div style={{ fontSize:22, fontWeight:800, color:'white', marginTop:3 }}>{fmt(proyAnual)}<span style={{ fontSize:12, color:'rgba(255,255,255,.5)', fontWeight:400 }}>/año</span></div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,.5)' }}>Resto {anio}</div>
                    <div style={{ fontSize:16, fontWeight:700, color:'#f87171' }}>{fmt(proyResto)}</div>
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {recurrentes.slice(0,4).map((g: any) => {
                    const cfg = CATEGORIAS[g.categoria] || CATEGORIAS.otros
                    const pAnual = proyectarAnual(g.importe||0, g.periodicidad||'mensual')
                    const pct = proyAnual > 0 ? (pAnual/proyAnual)*100 : 0
                    return (
                      <div key={g.id}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                          <span style={{ fontSize:11, color:'rgba(255,255,255,.7)' }}>{cfg.icon} {g.nombre}</span>
                          <span style={{ fontSize:11, color:'rgba(255,255,255,.9)', fontWeight:700 }}>{fmt(pAnual)}/año</span>
                        </div>
                        <div style={{ height:4, background:'rgba(255,255,255,.1)', borderRadius:2 }}>
                          <div style={{ width:`${pct}%`, height:'100%', background:cfg.color, borderRadius:2, transition:'width .4s' }} />
                        </div>
                      </div>
                    )
                  })}
                  {recurrentes.length > 4 && (
                    <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', marginTop:2 }}>+{recurrentes.length-4} más → ver tab Gastos</div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Gráfico barras por mes */}
          <div style={{ background:'white', borderRadius:14, border:`1px solid ${C.border}`, padding:'16px' }}>
            <div style={{ fontWeight:800, fontSize:14, color:C.text, marginBottom:14 }}>📊 Ingresos vs Gastos por mes</div>
            <div style={{ display:'flex', alignItems:'flex-end', gap:3, height:100 }}>
              {(kpisMes||[]).map((m: any) => {
                const hI = maxBar > 0 ? (m.ingresos / maxBar) * 90 : 0
                const hG = maxBar > 0 ? (m.gastos   / maxBar) * 90 : 0
                return (
                  <div key={m.mes} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:1 }}>
                    <div style={{ display:'flex', alignItems:'flex-end', gap:1, height:90 }}>
                      <div title={`Ingresos: ${fmt(m.ingresos)}`}
                        style={{ width:8, height:Math.max(2, hI), background:'#4ade80', borderRadius:'3px 3px 0 0', transition:'height .3s' }} />
                      <div title={`Gastos: ${fmt(m.gastos)}`}
                        style={{ width:8, height:Math.max(2, hG), background:'#f87171', borderRadius:'3px 3px 0 0', transition:'height .3s' }} />
                    </div>
                    <div style={{ fontSize:8, color:C.muted, fontWeight:600 }}>{m.nombre}</div>
                  </div>
                )
              })}
            </div>
            <div style={{ display:'flex', gap:16, marginTop:10, justifyContent:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:C.muted }}>
                <div style={{ width:10, height:10, background:'#4ade80', borderRadius:2 }} />Ingresos
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:C.muted }}>
                <div style={{ width:10, height:10, background:'#f87171', borderRadius:2 }} />Gastos
              </div>
            </div>
          </div>

          {/* Beneficio por mes */}
          <div style={{ background:'white', borderRadius:14, border:`1px solid ${C.border}`, padding:'16px' }}>
            <div style={{ fontWeight:800, fontSize:14, color:C.text, marginBottom:12 }}>📈 Beneficio mensual</div>
            {(kpisMes||[]).filter((m: any) => m.ingresos > 0 || m.gastos > 0).map((m: any) => (
              <div key={m.mes} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.muted, width:28 }}>{m.nombre}</div>
                <BarraH value={Math.abs(m.beneficio)} max={Math.max(...(kpisMes||[]).map((x: any) => Math.abs(x.beneficio)), 1)} color={m.beneficio >= 0 ? C.ok : C.red} />
                <div style={{ fontSize:12, fontWeight:700, color: m.beneficio >= 0 ? C.ok : C.red, width:72, textAlign:'right' }}>
                  {m.beneficio >= 0 ? '+' : ''}{fmt(m.beneficio)}
                </div>
              </div>
            ))}
            {(kpisMes||[]).every((m: any) => m.ingresos === 0 && m.gastos === 0) && (
              <div style={{ textAlign:'center', color:C.muted, padding:'20px 0', fontSize:13 }}>Sin datos este año</div>
            )}
          </div>

          {/* Gastos por categoría */}
          <div style={{ background:'white', borderRadius:14, border:`1px solid ${C.border}`, padding:'16px' }}>
            <div style={{ fontWeight:800, fontSize:14, color:C.text, marginBottom:12 }}>🥧 Gastos por categoría</div>
            {Object.entries(categorias||{}).sort((a,b) => (b[1] as number)-(a[1] as number)).map(([cat, val]: any) => {
              const cfg = CATEGORIAS[cat] || CATEGORIAS.otros
              return (
                <div key={cat} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                  <span style={{ fontSize:18, width:24, textAlign:'center' }}>{cfg.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:C.text }}>{cfg.label}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:cfg.color }}>{fmt(val)}</span>
                    </div>
                    <BarraH value={val} max={maxCat} color={cfg.color} />
                  </div>
                </div>
              )
            })}
            {Object.keys(categorias||{}).length === 0 && (
              <div style={{ textAlign:'center', color:C.muted, padding:'20px 0', fontSize:13 }}>Sin gastos registrados</div>
            )}
          </div>

          {/* Métricas adicionales */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {[
              { icon:'🧹', label:'Limpiezas', value: totales?.totalLimpiezas || 0, suffix:' sesiones', color:C.brand },
              { icon:'📅', label:'Coste/mes promedio', value: fmt((totales?.totalGastos||0)/12), suffix:'', color:C.warn },
              { icon:'💶', label:'Gasto/limpieza', value: totales?.totalLimpiezas > 0 ? fmt((totales?.totalGastos||0)/totales.totalLimpiezas) : '—', suffix:'', color:C.red },
              { icon:'📊', label:'Rentabilidad', value: `${totales?.margen||0}%`, suffix:' margen neto', color: (totales?.margen||0) > 0 ? C.ok : C.red },
            ].map(k => (
              <div key={k.label} style={{ background:'white', borderRadius:12, border:`1px solid ${C.border}`, padding:'14px 12px' }}>
                <div style={{ fontSize:22, marginBottom:4 }}>{k.icon}</div>
                <div style={{ fontSize:11, color:C.muted, fontWeight:600 }}>{k.label}</div>
                <div style={{ fontSize:18, fontWeight:800, color:k.color, marginTop:2 }}>{k.value}<span style={{ fontSize:11, fontWeight:400 }}>{k.suffix}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ SECCIÓN GASTOS ══ */}
      {seccion === 'gastos' && (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>

          {/* Recurrentes primero */}
          {(gastos||[]).filter((g: any) => g.recurrente).length > 0 && (
            <div style={{ background:'white', borderRadius:14, border:`1px solid ${C.border}`, overflow:'hidden', marginBottom:4 }}>
              <div style={{ padding:'12px 14px', background:'#f8f7ff', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:16 }}>🔁</span>
                <span style={{ fontWeight:800, fontSize:13, color:C.primary }}>Gastos recurrentes</span>
                <span style={{ fontSize:11, color:C.muted, marginLeft:'auto' }}>
                  {fmt((gastos||[]).filter((g: any) => g.recurrente).reduce((a: number, g: any) =>
                    a + proyectarAnual(g.importe||0, g.periodicidad||'mensual'), 0))}/año
                </span>
              </div>
              {(gastos||[]).filter((g: any) => g.recurrente).map((g: any) => {
                const cfg = CATEGORIAS[g.categoria] || CATEGORIAS.otros
                const prox = proximoCargo(g.periodicidad, g.fecha_inicio || g.creado_at)
                const urgente = prox.includes('⚠️')
                return (
                  <div key={g.id} style={{ padding:'11px 14px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:18, flexShrink:0 }}>{cfg.icon}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g.nombre}</div>
                      <div style={{ display:'flex', gap:4, marginTop:3, flexWrap:'wrap' }}>
                        <span style={{ fontSize:10, padding:'1px 6px', borderRadius:20, background:C.light, color:C.brand, fontWeight:700 }}>
                          {PERIODICIDAD[g.periodicidad]?.icon} {PERIODICIDAD[g.periodicidad]?.label || g.periodicidad}
                        </span>
                        {g.propiedad_nombre && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:20, background:'#f1f5f9', color:C.muted, fontWeight:600 }}>🏢 {g.propiedad_nombre}</span>}
                        <span style={{ fontSize:10, padding:'1px 6px', borderRadius:20,
                          background: urgente ? C.redBg : C.bg, color: urgente ? C.red : C.muted, fontWeight: urgente ? 700 : 600 }}>
                          📅 {prox}
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontWeight:800, fontSize:14, color:C.red }}>{fmtD(g.importe)}</div>
                      <div style={{ fontSize:10, color:C.muted }}>{fmt(proyectarAnual(g.importe||0, g.periodicidad||'mensual'))}/año</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Gastos puntuales */}
          <div style={{ fontSize:12, color:C.muted, fontWeight:700, marginBottom:2, marginTop:4 }}>
            PUNTUALES · {(gastos||[]).filter((g: any) => !g.recurrente).length} gastos · {fmt((gastos||[]).filter((g: any) => !g.recurrente).reduce((a: number, g: any) => a + (g.importe||0), 0))}
          </div>
          {gastos?.length === 0 && (
            <div style={{ textAlign:'center', padding:'40px 0', color:C.muted }}>
              <div style={{ fontSize:36, marginBottom:8 }}>📭</div>
              <div>Sin gastos registrados</div>
              <button onClick={() => setShowGasto(true)}
                style={{ marginTop:10, color:C.primary, background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                + Añadir primer gasto
              </button>
            </div>
          )}
          {(gastos||[]).filter((g: any) => !g.recurrente).map((g: any) => {
            const cfg = CATEGORIAS[g.categoria] || CATEGORIAS.otros
            const venc = g.estado_vencimiento
            return (
              <div key={g.id} style={{ background:'white', borderRadius:12, border:`1px solid ${venc==='vencido'?C.red:venc==='proximo'?C.warn:C.border}`, padding:'12px 14px', borderLeft:`4px solid ${cfg.color}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                      <span style={{ fontSize:16 }}>{cfg.icon}</span>
                      <span style={{ fontWeight:700, fontSize:14, color:C.text }}>{g.nombre}</span>
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                      <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:cfg.color+'15', color:cfg.color, fontWeight:700 }}>{cfg.label}</span>
                      {g.periodicidad && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:C.light, color:C.brand, fontWeight:700 }}>{g.periodicidad}</span>}
                      {g.propiedad_nombre && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:'#f1f5f9', color:C.muted, fontWeight:600 }}>🏢 {g.propiedad_nombre}</span>}
                      {g.mes && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:'#f1f5f9', color:C.muted, fontWeight:600 }}>{MESES[g.mes-1]}</span>}
                      {venc === 'vencido' && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:C.redBg, color:C.red, fontWeight:700 }}>⚠ Vencido</span>}
                      {venc === 'proximo' && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:C.warnBg, color:C.warn, fontWeight:700 }}>⏰ Vence pronto</span>}
                    </div>
                    {g.proveedor && <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>🏢 {g.proveedor}</div>}
                    {g.notas && <div style={{ fontSize:11, color:C.muted, marginTop:2, fontStyle:'italic' }}>{g.notas}</div>}
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontWeight:800, fontSize:16, color:C.red }}>{fmtD(g.importe)}</div>
                    {g.fecha_vencimiento && <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>Vence {g.fecha_vencimiento}</div>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ══ SECCIÓN INGRESOS ══ */}
      {seccion === 'ingresos' && (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ fontSize:13, color:C.muted, marginBottom:4 }}>
            {ingresos?.length || 0} ingresos · Total: <strong style={{ color:C.ok }}>{fmt(totales?.totalIngresos||0)}</strong>
          </div>
          {ingresos?.length === 0 && (
            <div style={{ textAlign:'center', padding:'40px 0', color:C.muted }}>
              <div style={{ fontSize:36, marginBottom:8 }}>💸</div>
              <div>Sin ingresos registrados</div>
              <button onClick={() => setShowIngreso(true)}
                style={{ marginTop:10, color:C.ok, background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                + Añadir primer ingreso
              </button>
            </div>
          )}
          {(ingresos||[]).map((i: any) => (
            <div key={i.id} style={{ background:'white', borderRadius:12, border:`1px solid ${C.border}`, padding:'12px 14px', borderLeft:`4px solid ${C.ok}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:C.text, marginBottom:4 }}>{i.concepto}</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                    <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:'#f0fdf4', color:C.ok, fontWeight:700, textTransform:'uppercase' }}>{i.portal}</span>
                    {i.propiedad_nombre && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:'#f1f5f9', color:C.muted, fontWeight:600 }}>🏢 {i.propiedad_nombre}</span>}
                    {i.num_noches && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:C.light, color:C.brand, fontWeight:600 }}>{i.num_noches} noches</span>}
                  </div>
                  {i.notas && <div style={{ fontSize:11, color:C.muted, marginTop:4, fontStyle:'italic' }}>{i.notas}</div>}
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontWeight:800, fontSize:16, color:C.ok }}>+{fmtD(i.importe)}</div>
                  <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{i.fecha}</div>
                  {i.num_noches > 0 && <div style={{ fontSize:10, color:C.brand, marginTop:1 }}>{fmtD(i.importe/i.num_noches)}/noche</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══ SECCIÓN POR PISO ══ */}
      {seccion === 'pisos' && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {Object.entries(porPropiedad||{}).map(([id, p]: any) => {
            const ben = p.ingresos - p.gastos
            const margenP = p.ingresos > 0 ? Math.round((ben/p.ingresos)*100) : 0
            return (
              <div key={id} style={{ background:'white', borderRadius:14, border:`1px solid ${C.border}`, overflow:'hidden' }}>
                <div style={{ background:`linear-gradient(135deg, ${C.primary}15 0%, ${C.brand}10 100%)`, padding:'14px 16px', borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ fontWeight:800, fontSize:15, color:C.text }}>🏢 {p.nombre}</div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{p.limpiezas} limpiezas · {anio}</div>
                </div>
                <div style={{ padding:'14px 16px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                  <div>
                    <div style={{ fontSize:10, color:C.muted, fontWeight:700, textTransform:'uppercase' }}>Ingresos</div>
                    <div style={{ fontSize:16, fontWeight:800, color:C.ok, marginTop:2 }}>{fmt(p.ingresos)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:C.muted, fontWeight:700, textTransform:'uppercase' }}>Gastos</div>
                    <div style={{ fontSize:16, fontWeight:800, color:C.red, marginTop:2 }}>{fmt(p.gastos)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:C.muted, fontWeight:700, textTransform:'uppercase' }}>Beneficio</div>
                    <div style={{ fontSize:16, fontWeight:800, color: ben >= 0 ? C.ok : C.red, marginTop:2 }}>
                      {ben >= 0 ? '+' : ''}{fmt(ben)}
                    </div>
                  </div>
                </div>
                <div style={{ padding:'0 16px 14px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:11, color:C.muted }}>Margen neto</span>
                    <span style={{ fontSize:12, fontWeight:700, color: margenP >= 0 ? C.ok : C.red }}>{margenP}%</span>
                  </div>
                  <div style={{ height:6, background:'#e2e8f0', borderRadius:4, overflow:'hidden' }}>
                    <div style={{ width:`${Math.max(0, Math.min(100, margenP))}%`, height:'100%', background: margenP >= 0 ? C.ok : C.red, borderRadius:4, transition:'width .4s' }} />
                  </div>
                </div>
              </div>
            )
          })}
          {Object.keys(porPropiedad||{}).length === 0 && (
            <div style={{ textAlign:'center', padding:'40px 0', color:C.muted }}>
              <div style={{ fontSize:36, marginBottom:8 }}>🏢</div>
              <div>Sin propiedades configuradas</div>
            </div>
          )}
        </div>
      )}

      {/* ══ SECCIÓN FACTURAS ══ */}
      {seccion === 'facturas' && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {(facturas||[]).map((f:any) => {
            const porPiso: Record<string, number> = {}
            ;(f.lineas||[]).forEach((l:any) => {
              const k = l.propiedad_nombre || 'Sin piso'
              porPiso[k] = (porPiso[k]||0) + Number(l.importe||0)
            })
            const estadoColor = f.estado==='pagada' ? C.ok : f.estado==='vencida' ? C.red : C.primary
            return (
              <div key={f.id} style={{ background:'white', borderRadius:14, border:`1px solid ${C.border}`, overflow:'hidden' }}>
                <div style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
                  <div>
                    <div style={{ fontWeight:800, fontSize:15, color:C.text }}>🧾 {f.numero_factura}</div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{f.periodo_desde} – {f.periodo_hasta}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontWeight:800, fontSize:16, color:C.text }}>{fmt(f.total||0)}</div>
                    <span style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:estadoColor }}>{f.estado}</span>
                  </div>
                </div>
                <div style={{ padding:'12px 16px' }}>
                  <div style={{ fontSize:10, color:C.muted, fontWeight:700, textTransform:'uppercase', marginBottom:6 }}>Desglose por piso</div>
                  {Object.entries(porPiso).map(([piso, imp]: any) => (
                    <div key={piso} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'4px 0' }}>
                      <span style={{ color:C.text }}>🏢 {piso}</span>
                      <span style={{ fontWeight:700, color:C.text }}>{fmt(imp)}</span>
                    </div>
                  ))}
                  {Object.keys(porPiso).length===0 && <div style={{ fontSize:12, color:C.muted }}>Sin líneas</div>}
                </div>
                <div style={{ padding:'0 16px 14px' }}>
                  <a href={`/api/propietario/${token}/factura/${f.id}`} target="_blank" rel="noopener noreferrer"
                     style={{ display:'inline-flex', alignItems:'center', gap:8, background:C.primary, color:'white', textDecoration:'none', fontSize:13, fontWeight:700, padding:'10px 16px', borderRadius:10 }}>
                    ⬇ Descargar PDF
                  </a>
                </div>
              </div>
            )
          })}
          {(facturas||[]).length===0 && (
            <div style={{ textAlign:'center', padding:'40px 0', color:C.muted }}>
              <div style={{ fontSize:36, marginBottom:8 }}>🧾</div>
              <div>Sin facturas emitidas en {anio}</div>
            </div>
          )}
        </div>
      )}

      {/* Modales */}
      {showGasto && (
        <NuevoGastoModal token={token} propiedades={propiedades||[]}
          onClose={() => setShowGasto(false)}
          onGuardado={() => { setShowGasto(false); cargar() }} />
      )}
      {showIngreso && (
        <NuevoIngresoModal token={token} propiedades={propiedades||[]}
          onClose={() => setShowIngreso(false)}
          onGuardado={() => { setShowIngreso(false); cargar() }} />
      )}
    </div>
  )
}

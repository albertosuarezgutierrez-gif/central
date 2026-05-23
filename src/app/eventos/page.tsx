'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'
import { useAuth } from '@/hooks/useAuth'
import PanelGastosEvento from '@/components/eventos/PanelGastosEvento'

type Espacio = { id: string; nombre: string; tipo: string; aforo_maximo: number | null }
type Bloqueo = { id: string; espacio_id: string; fecha_inicio: string; fecha_fin: string; tipo: string; eventos: { numero_evento: string; tipo: string; cliente_nombre: string; estado: string; coordinador_id: string } | null }
type Evento = { id: string; numero_evento: string; tipo: string; estado: string; fecha_evento: string; hora_inicio: string | null; cliente_nombre: string; cliente_telefono: string | null; aforo_previsto: number; precio_total: number | null; senial_pagada: boolean; espacio_id: string | null; espacios_evento: { nombre: string } | null }

const TIPO_L: Record<string, string> = { boda: '💍 Boda', comunion: '⛪ Comunión', bautizo: '👶 Bautizo', cumpleanos: '🎂 Cumpleaños', empresa: '🏢 Empresa', otro: '📅 Otro' }
const EST_C: Record<string, string> = { presupuesto: C.amber, confirmado: C.green, en_curso: C.red, completado: '#6B7280', facturado: '#2B6A6E', cancelado: '#9CA3AF' }
const EST_L: Record<string, string> = { presupuesto: 'Presupuesto', confirmado: 'Confirmado', en_curso: 'En curso', completado: 'Completado', facturado: 'Facturado', cancelado: 'Cancelado' }
const fmtEur = (n: number | null) => n ? `${n.toLocaleString('es-ES', { minimumFractionDigits: 0 })} €` : '—'
const fmtFecha = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
const diasHasta = (d: string) => { const diff = Math.ceil((new Date(d+'T00:00:00').getTime()-Date.now())/86400000); if(diff<0)return null; if(diff===0)return '¡HOY!'; if(diff===1)return 'mañana'; return `en ${diff}d` }

function CalendarioDisponibilidad({ sh }: { sh: () => Record<string, string> }) {
  const [espacios, setEspacios] = useState<Espacio[]>([])
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([])
  const [mesActual, setMesActual] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` })
  const [checkFecha, setCheckFecha] = useState('')
  const [dispFecha, setDispFecha] = useState<Record<string, boolean>>({})

  const cargar = useCallback(async () => {
    const [a, m] = mesActual.split('-').map(Number)
    const desde = `${a}-${String(m).padStart(2,'0')}-01`
    const hasta = `${a}-${String(m).padStart(2,'0')}-${new Date(a, m, 0).getDate()}`
    const res = await fetch(`/api/eventos?accion=disponibilidad&fecha=${desde}&hasta=${hasta}`, { headers: sh() })
    const data = await res.json()
    setEspacios(data.espacios ?? [])
    setBloqueos(data.bloqueos ?? [])
  }, [mesActual, sh])

  useEffect(() => { cargar() }, [cargar])

  const checkDisp = async () => {
    if (!checkFecha) return
    const res = await fetch(`/api/owner/eventos/disponibilidad?check_fecha=${checkFecha}&desde=${checkFecha}&hasta=${checkFecha}`, { headers: sh() })
    const data = await res.json()
    setDispFecha(data.disponibilidad_fecha ?? {})
  }

  const [a, m] = mesActual.split('-').map(Number)
  const dias = Array.from({ length: new Date(a, m, 0).getDate() }, (_, i) => `${a}-${String(m).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`)
  const blqEnDia = (eid: string, dia: string) => bloqueos.filter(b => b.espacio_id === eid && b.fecha_inicio <= dia && b.fecha_fin >= dia)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => { const [a,m]=mesActual.split('-').map(Number); const d=new Date(a,m-2,1); setMesActual(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`) }}
          style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.rule}`, background: 'transparent', color: C.ink2, cursor: 'pointer', fontFamily: SN, fontSize: 13 }}>←</button>
        <div style={{ fontFamily: SE, fontSize: 17, fontWeight: 700, color: C.paper, fontStyle: 'italic', flex: 1 }}>
          {new Date(a, m-1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
        </div>
        <button onClick={() => { const [a,m]=mesActual.split('-').map(Number); const d=new Date(a,m,1); setMesActual(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`) }}
          style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.rule}`, background: 'transparent', color: C.ink2, cursor: 'pointer', fontFamily: SN, fontSize: 13 }}>→</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={checkFecha} onChange={e => setCheckFecha(e.target.value)}
          style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '7px 10px', fontFamily: SN, fontSize: 13, color: C.paper }} />
        <button onClick={checkDisp} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: C.paper, color: C.ink, fontFamily: SN, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Verificar disponibilidad
        </button>
        {espacios.map(e => dispFecha[e.id] !== undefined && (
          <span key={e.id} style={{ padding: '4px 10px', borderRadius: 99, fontFamily: SN, fontSize: 11, fontWeight: 600, background: dispFecha[e.id]?C.green+'22':C.red+'22', color: dispFecha[e.id]?C.green:C.red }}>
            {dispFecha[e.id]?'✓':'✗'} {e.nombre}
          </span>
        ))}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ padding: '8px 12px', background: C.dark, borderBottom: `1px solid ${C.rule}`, fontFamily: SN, fontSize: 11, color: C.ink3, textAlign: 'left', position: 'sticky', left: 0, zIndex: 1 }}>Espacio</th>
              {dias.map(d => { const day=parseInt(d.slice(-2)); const dow=new Date(d+'T12:00:00').getDay(); const fs=dow===0||dow===6; const pas=d<new Date().toISOString().slice(0,10); return (
                <th key={d} style={{ padding:'4px 2px', background: C.dark, borderBottom:`1px solid ${C.rule}`, fontFamily: SM, fontSize:10, color: pas?C.ink4:fs?C.amber:C.ink3, textAlign:'center', minWidth:26 }}>{day}</th>
              )})}
            </tr>
          </thead>
          <tbody>
            {espacios.map(e => (
              <tr key={e.id} style={{ borderBottom: `1px solid ${C.rule}` }}>
                <td style={{ padding:'8px 12px', background: C.bg2, fontFamily: SN, fontSize: 12, color: C.paper, whiteSpace:'nowrap', position:'sticky', left:0, borderRight:`1px solid ${C.rule}` }}>
                  <div style={{ fontWeight: 600 }}>{e.nombre}</div>
                  {e.aforo_maximo && <div style={{ fontSize: 10, color: C.ink3 }}>max. {e.aforo_maximo}</div>}
                </td>
                {dias.map(d => { const bls=blqEnDia(e.id,d); const libre=bls.length===0; const pas=d<new Date().toISOString().slice(0,10); return (
                  <td key={d} title={bls[0]?.eventos?.cliente_nombre??''} style={{ padding:2, textAlign:'center', background: libre?'transparent':C.red+'22' }}>
                    <div style={{ width:20, height:20, borderRadius:4, margin:'0 auto', background: libre?(pas?'transparent':C.green+'33'):C.red+'55', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, color: libre?(pas?C.ink4:C.green):C.red, fontWeight:700 }}>
                      {libre?(pas?'':'✓'):'✗'}
                    </div>
                  </td>
                )})}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function EventosPage() {
  const { session, checking: authLoading } = useAuth()
  const [tab, setTab] = useState<'eventos'|'calendario'|'gastos'>('eventos')
  const [eventoSeleccionado, setEventoSeleccionado] = useState<string | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [espacios, setEspacios] = useState<Espacio[]>([])
  const [stats, setStats] = useState<{total:number;proximos:number;ingresos_previstos:number}|null>(null)
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ tipo:'boda', cliente_nombre:'', cliente_telefono:'', cliente_email:'', fecha_evento:'', hora_inicio:'', hora_fin:'', espacio_id:'', aforo_previsto:'', precio_por_persona:'', notas_internas:'', senial_importe:'' })
  const [dispCheck, setDispCheck] = useState<boolean|null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const sh = useCallback((): Record<string,string> => {
    if (!session) return {}
    return { 'x-session-id': session.id, 'x-restaurante-id': session.restaurante_id }
  }, [session])

  const cargar = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const [evRes, espRes] = await Promise.all([
        fetch('/api/eventos', { headers: sh() }),
        fetch('/api/eventos?accion=disponibilidad', { headers: sh() }),
      ])
      const [evD, espD] = await Promise.all([evRes.json(), espRes.json()])
      setEventos(evD.eventos??[]); setStats(evD.stats??null); setEspacios(espD.espacios??[])
    } finally { setLoading(false) }
  }, [session, sh])

  useEffect(() => { if (session) cargar() }, [session, cargar])

  useEffect(() => {
    if (!form.espacio_id || !form.fecha_evento) { setDispCheck(null); return }
    fetch(`/api/owner/eventos/disponibilidad?check_fecha=${form.fecha_evento}&desde=${form.fecha_evento}&hasta=${form.fecha_evento}`, { headers: sh() })
      .then(r => r.json()).then(d => setDispCheck(d.disponibilidad_fecha?.[form.espacio_id] ?? true))
  }, [form.espacio_id, form.fecha_evento, sh])

  const handleGuardar = async () => {
    if (!form.cliente_nombre||!form.fecha_evento||!form.aforo_previsto) { setFormError('Cliente, fecha y aforo son obligatorios'); return }
    if (dispCheck===false) { setFormError('El espacio no está disponible'); return }
    setSaving(true); setFormError('')
    try {
      const res = await fetch('/api/eventos', { method:'POST', headers:{'Content-Type':'application/json',...sh()}, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error||'Error'); return }
      setMostrarForm(false); setForm({ tipo:'boda', cliente_nombre:'', cliente_telefono:'', cliente_email:'', fecha_evento:'', hora_inicio:'', hora_fin:'', espacio_id:'', aforo_previsto:'', precio_por_persona:'', notas_internas:'', senial_importe:'' }); cargar()
    } finally { setSaving(false) }
  }

  if (authLoading || !session) return null
  if (!['coordinador_eventos','owner','jefe_sala','super_admin'].includes(session.rol)) {
    return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:C.dark, color:C.ink2, fontFamily:SN }}>Sin acceso</div>
  }

  const hoy = new Date().toISOString().slice(0,10)
  const precioTotal = form.precio_por_persona&&form.aforo_previsto ? parseFloat(form.precio_por_persona)*parseInt(form.aforo_previsto) : null
  const inp = (f: string, type='text', ph='') => <input type={type} placeholder={ph} value={(form as Record<string,string>)[f]} onChange={e=>setForm(p=>({...p,[f]:e.target.value}))} style={{ width:'100%', background:C.bg2, border:`1px solid ${C.rule}`, borderRadius:6, padding:'8px 10px', fontFamily:SN, fontSize:13, color:C.paper, boxSizing:'border-box' as const }} />

  return (
    <div style={{ minHeight:'100vh', background:C.dark, color:C.paper }}>
      <div style={{ background:C.bg2, borderBottom:`1px solid ${C.rule}`, padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontFamily:SE, fontSize:20, fontWeight:700, color:C.paper, fontStyle:'italic' }}>Mis Eventos</div>
          <div style={{ fontFamily:SN, fontSize:12, color:C.ink3 }}>{session.nombre}</div>
        </div>
        <button onClick={()=>{ setMostrarForm(true); setTab('eventos') }} style={{ padding:'8px 16px', borderRadius:6, border:'none', background:C.red, color:'#fff', fontFamily:SN, fontSize:13, fontWeight:600, cursor:'pointer' }}>+ Nuevo evento</button>
      </div>
      <div style={{ padding:'20px 16px', maxWidth:900, margin:'0 auto' }}>
        {stats && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
            {[{l:'Total',v:stats.total.toString(),s:'en cartera'},{l:'Próximos',v:stats.proximos.toString(),s:'activos'},{l:'Ingresos previstos',v:fmtEur(stats.ingresos_previstos),s:'confirmados'}].map(s => (
              <div key={s.l} style={{ background:C.bg2, border:`1px solid ${C.rule}`, borderRadius:8, padding:'12px 14px' }}>
                <div style={{ fontFamily:SN, fontSize:10, color:C.ink3, textTransform:'uppercase' as const, letterSpacing:'.08em', marginBottom:2 }}>{s.l}</div>
                <div style={{ fontFamily:SE, fontSize:22, fontWeight:700, color:C.paper, fontStyle:'italic' }}>{s.v}</div>
                <div style={{ fontFamily:SN, fontSize:11, color:C.ink3 }}>{s.s}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display:'flex', gap:4, marginBottom:16 }}>
          {(['eventos','calendario','gastos'] as const).map(t => (
            <button key={t} onClick={()=>setTab(t)} style={{ padding:'7px 16px', borderRadius:6, border:`1px solid ${C.rule}`, background:tab===t?C.paper:'transparent', color:tab===t?C.ink:C.ink3, fontFamily:SN, fontSize:13, cursor:'pointer', fontWeight:tab===t?600:400 }}>
              {t==='eventos'?'📋 Mis eventos':t==='calendario'?'📅 Disponibilidad':'💶 Gastos'}
            </button>
          ))}
        </div>
        {tab==='calendario' && <div style={{ background:C.bg2, border:`1px solid ${C.rule}`, borderRadius:10, padding:20 }}><CalendarioDisponibilidad sh={sh} /></div>}
        {tab==='gastos' && (
          <div>
            {/* Selector de evento */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontFamily:SN, fontSize:11, color:C.ink3, marginBottom:6, textTransform:'uppercase' as const, letterSpacing:'.08em' }}>Selecciona el evento</div>
              <select value={eventoSeleccionado ?? ''} onChange={e=>setEventoSeleccionado(e.target.value||null)}
                style={{ width:'100%', background:C.bg2, border:`1px solid ${C.rule}`, borderRadius:6, padding:'9px 12px', fontFamily:SN, fontSize:13, color:C.paper }}>
                <option value=''>— Elige un evento —</option>
                {eventos.map(ev=>(
                  <option key={ev.id} value={ev.id}>{ev.numero_evento} · {ev.cliente_nombre} ({ev.fecha_evento})</option>
                ))}
              </select>
            </div>
            {eventoSeleccionado ? (
              <PanelGastosEvento eventoId={eventoSeleccionado} sh={sh} esCoordinador={true} />
            ) : (
              <div style={{ textAlign:'center' as const, padding:32, background:C.bg2, borderRadius:10, border:`1px solid ${C.rule}` }}>
                <div style={{ fontSize:28, marginBottom:8 }}>💶</div>
                <div style={{ fontFamily:SN, fontSize:13, color:C.ink3 }}>Selecciona un evento para ver y añadir sus gastos</div>
              </div>
            )}
          </div>
        )}
        {tab==='eventos' && (
          <>
            {mostrarForm && (
              <div style={{ background:C.bg2, border:`1px solid ${C.rule}`, borderRadius:10, padding:20, marginBottom:16 }}>
                <div style={{ fontFamily:SE, fontSize:17, fontWeight:700, color:C.paper, marginBottom:16 }}>Nuevo evento</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                  <div><div style={{ fontFamily:SN, fontSize:11, color:C.ink3, marginBottom:4, textTransform:'uppercase' as const, letterSpacing:'.08em' }}>Tipo</div>
                    <select value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={{ width:'100%', background:C.bg2, border:`1px solid ${C.rule}`, borderRadius:6, padding:'8px 10px', fontFamily:SN, fontSize:13, color:C.paper }}>
                      {Object.entries(TIPO_L).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div><div style={{ fontFamily:SN, fontSize:11, color:C.ink3, marginBottom:4, textTransform:'uppercase' as const, letterSpacing:'.08em' }}>Cliente *</div>{inp('cliente_nombre','text','Nombre del cliente')}</div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                  <div><div style={{ fontFamily:SN, fontSize:11, color:C.ink3, marginBottom:4, textTransform:'uppercase' as const, letterSpacing:'.08em' }}>Teléfono</div>{inp('cliente_telefono','tel','600 000 000')}</div>
                  <div><div style={{ fontFamily:SN, fontSize:11, color:C.ink3, marginBottom:4, textTransform:'uppercase' as const, letterSpacing:'.08em' }}>Email</div>{inp('cliente_email','email','email@cliente.com')}</div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
                  <div><div style={{ fontFamily:SN, fontSize:11, color:C.ink3, marginBottom:4, textTransform:'uppercase' as const, letterSpacing:'.08em' }}>Fecha *</div>{inp('fecha_evento','date')}</div>
                  <div><div style={{ fontFamily:SN, fontSize:11, color:C.ink3, marginBottom:4, textTransform:'uppercase' as const, letterSpacing:'.08em' }}>Hora inicio</div>{inp('hora_inicio','time')}</div>
                  <div><div style={{ fontFamily:SN, fontSize:11, color:C.ink3, marginBottom:4, textTransform:'uppercase' as const, letterSpacing:'.08em' }}>Hora fin</div>{inp('hora_fin','time')}</div>
                </div>
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontFamily:SN, fontSize:11, color:C.ink3, marginBottom:4, textTransform:'uppercase' as const, letterSpacing:'.08em' }}>
                    Espacio {dispCheck!==null&&<span style={{ marginLeft:8, color:dispCheck?C.green:C.red, fontWeight:700 }}>{dispCheck?'✓ Disponible':'✗ Ocupado'}</span>}
                  </div>
                  <select value={form.espacio_id} onChange={e=>setForm(f=>({...f,espacio_id:e.target.value}))}
                    style={{ width:'100%', background:C.bg2, border:`1px solid ${dispCheck===false?C.red:C.rule}`, borderRadius:6, padding:'8px 10px', fontFamily:SN, fontSize:13, color:C.paper }}>
                    <option value="">— Sin espacio —</option>
                    {espacios.map(e=><option key={e.id} value={e.id}>{e.nombre}{e.aforo_maximo?` (max. ${e.aforo_maximo})`:''}</option>)}
                  </select>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
                  <div><div style={{ fontFamily:SN, fontSize:11, color:C.ink3, marginBottom:4, textTransform:'uppercase' as const, letterSpacing:'.08em' }}>Aforo *</div>{inp('aforo_previsto','number','200')}</div>
                  <div><div style={{ fontFamily:SN, fontSize:11, color:C.ink3, marginBottom:4, textTransform:'uppercase' as const, letterSpacing:'.08em' }}>€/persona</div>{inp('precio_por_persona','number','50')}</div>
                  <div style={{ display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
                    <div style={{ fontFamily:SN, fontSize:11, color:C.ink3, textTransform:'uppercase' as const, letterSpacing:'.08em' }}>Total</div>
                    <div style={{ fontFamily:SE, fontSize:22, fontWeight:700, color:precioTotal?C.green:C.ink3, fontStyle:'italic' }}>{precioTotal?fmtEur(precioTotal):'—'}</div>
                  </div>
                </div>
                <div style={{ marginBottom:10 }}><div style={{ fontFamily:SN, fontSize:11, color:C.ink3, marginBottom:4, textTransform:'uppercase' as const, letterSpacing:'.08em' }}>Señal</div>{inp('senial_importe','number','0')}</div>
                {formError&&<div style={{ color:C.red, fontFamily:SN, fontSize:13, marginBottom:10 }}>{formError}</div>}
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                  <button onClick={()=>setMostrarForm(false)} style={{ padding:'8px 16px', borderRadius:6, border:`1px solid ${C.rule}`, background:'transparent', fontFamily:SN, fontSize:13, color:C.ink3, cursor:'pointer' }}>Cancelar</button>
                  <button onClick={handleGuardar} disabled={saving||dispCheck===false}
                    style={{ padding:'8px 18px', borderRadius:6, border:'none', background:C.red, color:'#fff', fontFamily:SN, fontSize:13, fontWeight:600, cursor:'pointer', opacity:saving||dispCheck===false?0.6:1 }}>
                    {saving?'Guardando...':'Crear evento'}
                  </button>
                </div>
              </div>
            )}
            {loading ? <div style={{ textAlign:'center', padding:40, color:C.ink3, fontFamily:SN, fontSize:13 }}>Cargando...</div>
            : eventos.length===0 ? (
              <div style={{ textAlign:'center', padding:40, background:C.bg2, borderRadius:10, border:`1px solid ${C.rule}` }}>
                <div style={{ fontSize:32, marginBottom:8 }}>💍</div>
                <div style={{ fontFamily:SE, fontSize:17, color:C.paper, marginBottom:4 }}>Sin eventos todavía</div>
                <div style={{ fontFamily:SN, fontSize:13, color:C.ink3 }}>Pulsa "Nuevo evento" para empezar.</div>
              </div>
            ) : eventos.map(ev => {
              const dias = diasHasta(ev.fecha_evento)
              return (
                <div key={ev.id} style={{ background:C.bg2, border:`1px solid ${C.rule}`, borderRadius:10, padding:'14px 16px', marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                    <div>
                      <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:2 }}>
                        <span style={{ fontFamily:SM, fontSize:11, color:C.ink3 }}>{ev.numero_evento}</span>
                        <span style={{ fontFamily:SN, fontSize:11, padding:'2px 7px', borderRadius:99, background:(EST_C[ev.estado]||C.amber)+'22', color:EST_C[ev.estado]||C.amber, fontWeight:600 }}>{EST_L[ev.estado]||ev.estado}</span>
                        {dias&&<span style={{ fontFamily:SN, fontSize:11, padding:'2px 7px', borderRadius:99, background:dias==='¡HOY!'?C.red+'22':C.amber+'22', color:dias==='¡HOY!'?C.red:C.amber, fontWeight:700 }}>{dias}</span>}
                      </div>
                      <div style={{ fontFamily:SE, fontSize:17, fontWeight:700, color:C.paper }}>{TIPO_L[ev.tipo]||ev.tipo} — {ev.cliente_nombre}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontFamily:SE, fontSize:20, fontWeight:700, color:C.paper, fontStyle:'italic' }}>{fmtEur(ev.precio_total)}</div>
                      <div style={{ fontFamily:SN, fontSize:11, color:C.ink3 }}>{ev.aforo_previsto} personas</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:12, flexWrap:'wrap', fontFamily:SN, fontSize:12, color:C.ink2, marginBottom:10 }}>
                    <span>📅 {fmtFecha(ev.fecha_evento)}{ev.hora_inicio?` · ${ev.hora_inicio}`:''}</span>
                    {ev.espacios_evento&&<span>📍 {(ev.espacios_evento as {nombre:string}).nombre}</span>}
                    {ev.senial_pagada&&<span style={{ color:C.green }}>✓ Señal cobrada</span>}
                    {ev.cliente_telefono&&<span>📞 {ev.cliente_telefono}</span>}
                  </div>
                  <button onClick={()=>window.open(`/api/owner/eventos/presupuesto?evento_id=${ev.id}`,'_blank')}
                    style={{ padding:'5px 12px', borderRadius:5, border:`1px solid ${C.rule}`, background:'transparent', fontFamily:SN, fontSize:12, color:'#5BA3A8', cursor:'pointer' }}>
                    📄 Ver presupuesto
                  </button>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

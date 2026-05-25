'use client'
import { useState } from 'react'
import { C, SE, SN } from '@/lib/colors'

const TIPOS = [{ value:'boda',label:'Boda',icon:'💍' },{ value:'comunion',label:'Comunión',icon:'✝️' },{ value:'empresa',label:'Empresa',icon:'💼' },{ value:'cumpleanos',label:'Cumpleaños',icon:'🎂' },{ value:'graduacion',label:'Graduación',icon:'🎓' },{ value:'otro',label:'Otro',icon:'🎉' }]

export default function CateringLead({ params }: { params: Promise<{ slug: string }> }) {
  const [tipo, setTipo] = useState('')
  const [form, setForm] = useState({ fecha_tentativa:'', num_comensales:'', presupuesto_orientativo:'', nombre_contacto:'', telefono:'', email:'', espacio_preferido:'', mensaje:'' })
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')

  const upd = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }))
  const inp = { width:'100%', padding:'.7rem .9rem', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:8, color:C.paper, fontFamily:SN, fontSize:'.88rem', outline:'none', boxSizing:'border-box' as const }

  const enviar = async () => {
    if (!tipo || !form.nombre_contacto || (!form.telefono && !form.email)) { setError('Completa tipo, nombre y teléfono o email'); return }
    setError(''); setEnviando(true)
    try {
      const slug = await params.then(p => p.slug)
      const r = await fetch('/api/eventos-catering/lead', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...form, tipo_evento:tipo, restaurante_id:slug, num_comensales:form.num_comensales?+form.num_comensales:null, presupuesto_orientativo:form.presupuesto_orientativo?+form.presupuesto_orientativo:null }) })
      const d = await r.json(); if(d.ok) setEnviado(true); else setError(d.error||'Error')
    } catch { setError('Error de conexión') } finally { setEnviando(false) }
  }

  if (enviado) return <div style={{minHeight:'100dvh',background:C.dark,display:'flex',alignItems:'center',justifyContent:'center',padding:'2rem',fontFamily:SN,color:C.paper}}><div style={{textAlign:'center'}}><div style={{fontSize:'2.5rem',marginBottom:'.75rem'}}>✅</div><div style={{fontFamily:SE,fontSize:'1.35rem',marginBottom:'.5rem'}}>¡Recibido!</div><div style={{color:C.ink2,fontSize:'.9rem'}}>Te contactaremos en menos de 24 horas.</div></div></div>

  return (
    <div style={{minHeight:'100dvh',background:C.dark,color:C.paper}}>
      <div style={{background:C.bg2,borderBottom:`1px solid ${C.rule}`,padding:'2rem 1.25rem 1.5rem',textAlign:'center'}}>
        <div style={{color:C.red,fontSize:'.72rem',fontFamily:SN,textTransform:'uppercase',letterSpacing:'.12em',marginBottom:'.6rem'}}>Eventos &amp; Catering</div>
        <div style={{fontFamily:SE,fontSize:'1.65rem',fontWeight:600,lineHeight:1.2,marginBottom:'.5rem'}}>Cuéntanos tu evento</div>
        <div style={{color:C.ink3,fontSize:'.85rem'}}>Propuesta personalizada en 24h</div>
      </div>
      <div style={{padding:'1.25rem',maxWidth:540,margin:'0 auto'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'.45rem',marginBottom:'1.25rem'}}>
          {TIPOS.map(t=><button key={t.value} onClick={()=>setTipo(t.value)} style={{background:tipo===t.value?`${C.red}22`:C.bg2,border:`1px solid ${tipo===t.value?C.red:C.rule}`,borderRadius:10,padding:'.65rem .4rem',color:tipo===t.value?C.paper:C.ink3,fontFamily:SN,fontSize:'.78rem',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:'.2rem'}}><span style={{fontSize:'1.2rem'}}>{t.icon}</span>{t.label}</button>)}
        </div>
        <div style={{display:'grid',gap:'.65rem',marginBottom:'1.25rem'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.65rem'}}>
            <div><L>Fecha</L><input type="date" style={inp} value={form.fecha_tentativa} onChange={e=>upd('fecha_tentativa',e.target.value)}/></div>
            <div><L>Comensales</L><input type="number" placeholder="100" style={inp} value={form.num_comensales} onChange={e=>upd('num_comensales',e.target.value)}/></div>
          </div>
          <div><L>Presupuesto (€)</L><input type="number" placeholder="15000" style={inp} value={form.presupuesto_orientativo} onChange={e=>upd('presupuesto_orientativo',e.target.value)}/></div>
          <div><L>Espacio</L><input type="text" placeholder="Hacienda, finca..." style={inp} value={form.espacio_preferido} onChange={e=>upd('espacio_preferido',e.target.value)}/></div>
        </div>
        <L>Tus datos</L>
        <div style={{display:'grid',gap:'.65rem',marginBottom:'1.25rem'}}>
          <input type="text" placeholder="Nombre completo *" style={inp} value={form.nombre_contacto} onChange={e=>upd('nombre_contacto',e.target.value)}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.65rem'}}>
            <input type="tel" placeholder="Teléfono" style={inp} value={form.telefono} onChange={e=>upd('telefono',e.target.value)}/>
            <input type="email" placeholder="Email" style={inp} value={form.email} onChange={e=>upd('email',e.target.value)}/>
          </div>
          <textarea placeholder="Más detalles..." rows={3} style={{...inp,resize:'none'}} value={form.mensaje} onChange={e=>upd('mensaje',e.target.value)}/>
        </div>
        {error&&<div style={{color:C.red,fontSize:'.82rem',background:`${C.red}15`,borderRadius:8,padding:'.65rem',marginBottom:'1rem'}}>{error}</div>}
        <button onClick={enviar} disabled={enviando} style={{width:'100%',padding:'.9rem',background:enviando?C.bg3:C.red,color:C.paper,border:'none',borderRadius:10,fontFamily:SN,fontSize:'1rem',fontWeight:700,cursor:'pointer'}}>{enviando?'Enviando…':'Solicitar propuesta →'}</button>
        <div style={{color:C.ink4,fontSize:'.68rem',textAlign:'center',marginTop:'.6rem'}}>Sin compromiso · 24h respuesta</div>
      </div>
    </div>
  )
}
function L({ children }: { children: React.ReactNode }) {
  return <div style={{ color:C.ink3, fontSize:'.72rem', fontFamily:SN, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'.5rem' }}>{children}</div>
}

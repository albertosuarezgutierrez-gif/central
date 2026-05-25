'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

interface Post { id:string; post_id:string; plantilla:string; titulo:string; caption:string; image_url:string; estado:string; likes:number; comentarios:number; alcance:number; created_at:string; tema_elegido:string }
interface Borrador { id:string; plantilla:string; titulo:string; caption:string; image_url:string; tema_elegido:string; modulo_relacionado:string; estado:string; scheduled_for:string|null; created_at:string }

export default function InstagramTab({ session }: { session: any }) {
  const [posts, setPosts] = useState<Post[]>([])
  const [borradores, setBorradores] = useState<Borrador[]>([])
  const [resumen, setResumen] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'borradores'|'publicados'|'generar'>('borradores')
  const [editingCaption, setEditingCaption] = useState<string|null>(null)
  const [captionEdit, setCaptionEdit] = useState('')
  const [publicando, setPublicando] = useState<string|null>(null)
  const [generando, setGenerando] = useState(false)
  const [tipoGenerar, setTipoGenerar] = useState('auto')

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/super/instagram', { headers: { 'x-ia-session': JSON.stringify(session) } })
      const data = await res.json()
      setPosts(data.posts ?? []); setBorradores(data.borradores ?? []); setResumen(data.resumen ?? null)
    } catch {} finally { setLoading(false) }
  }, [session])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { if (borradores.length > 0 && tab === 'publicados') setTab('borradores') }, [borradores])

  const publicarBorrador = async (id: string) => {
    setPublicando(id)
    try {
      const res = await fetch('/api/super/instagram', { method:'POST', headers:{'Content-Type':'application/json','x-ia-session':JSON.stringify(session)}, body: JSON.stringify({ accion:'publicar_borrador', borrador_id:id }) })
      const data = await res.json()
      if (data.ok) { await cargar(); setTab('publicados') }
    } catch {} finally { setPublicando(null) }
  }

  const descartarBorrador = async (id: string) => {
    await fetch('/api/super/instagram', { method:'POST', headers:{'Content-Type':'application/json','x-ia-session':JSON.stringify(session)}, body: JSON.stringify({ accion:'descartar_borrador', borrador_id:id }) })
    await cargar()
  }

  const guardarCaption = async (id: string) => {
    await fetch('/api/super/instagram', { method:'POST', headers:{'Content-Type':'application/json','x-ia-session':JSON.stringify(session)}, body: JSON.stringify({ accion:'actualizar_caption', borrador_id:id, caption:captionEdit }) })
    setEditingCaption(null); await cargar()
  }

  const generarNuevo = async () => {
    setGenerando(true)
    try {
      await fetch(`/api/cron/instagram?manual=1${tipoGenerar!=='auto'?`&tipo=${tipoGenerar}`:''}`, { headers:{'x-ia-session':JSON.stringify(session)} })
      await cargar(); setTab('borradores')
    } catch {} finally { setGenerando(false) }
  }

  const TONO: Record<string,string> = { stat:C.dark, pregunta:C.paper, comparativa:'#1E1A15', tip:C.red, cita:C.paper, producto:C.dark, slide:C.dark }
  const PLANTILLAS = ['auto','stat','pregunta','tip','comparativa','cita','producto']

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div>
        <div style={{ fontFamily:SM, fontSize:11, color:C.red, letterSpacing:'.12em', marginBottom:8 }}>INSTAGRAM · @IAREST.ES</div>
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 style={{ fontFamily:SE, fontSize:28, fontWeight:500, margin:'0 0 4px', color:C.ink }}>Instagram</h1>
            <p style={{ fontFamily:SN, fontSize:13, color:C.ink3, margin:0 }}>6 plantillas · agente mié+vie · aprobación Telegram</p>
          </div>
          {resumen && (
            <div style={{ display:'flex', gap:16 }}>
              {[{label:'publicados',val:resumen.publicados},{label:'alcance',val:(resumen.totalAlcance||0).toLocaleString('es-ES')},{label:'likes',val:resumen.totalLikes}].map(k => (
                <div key={k.label} style={{ textAlign:'right' }}>
                  <div style={{ fontFamily:SE, fontSize:22, color:C.ink }}>{k.val}</div>
                  <div style={{ fontFamily:SM, fontSize:10, color:C.ink4, letterSpacing:'.08em' }}>{k.label.toUpperCase()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display:'flex', gap:4, borderBottom:`1px solid ${C.rule}` }}>
        {([{id:'borradores',label:`Borradores${borradores.length>0?` (${borradores.length})`:''}`},{id:'publicados',label:'Publicados'},{id:'generar',label:'Generar nuevo'}] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding:'8px 16px', border:'none', borderBottom:`2px solid ${tab===t.id?C.red:'transparent'}`, background:'transparent', color:tab===t.id?C.ink:C.ink3, fontFamily:SM, fontSize:12, cursor:'pointer', ...(t.id==='borradores'&&borradores.length>0?{color:C.red}:{}) }}>{t.label.toUpperCase()}</button>
        ))}
      </div>

      {loading ? <div style={{ textAlign:'center', padding:40, color:C.ink4, fontFamily:SM, fontSize:12 }}>cargando...</div> : (
        <>
          {tab === 'borradores' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {borradores.length === 0 ? <div style={{ padding:'40px 0', textAlign:'center', color:C.ink4, fontFamily:SN, fontSize:13 }}>No hay borradores. El agente genera mié y vie a las 9:00, o usa el briefing del lunes.</div>
              : borradores.map(b => (
                <div key={b.id} style={{ background:C.paper, border:`1px solid ${C.rule}`, borderRadius:10, overflow:'hidden' }}>
                  <div style={{ display:'flex' }}>
                    <div style={{ width:80, flexShrink:0, background:TONO[b.plantilla]||C.dark, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, padding:'12px 8px' }}>
                      <div style={{ fontFamily:SM, fontSize:9, color:b.plantilla==='pregunta'||b.plantilla==='cita'?C.ink:C.paper, letterSpacing:'.1em', textTransform:'uppercase', textAlign:'center' }}>{b.plantilla}</div>
                      {b.scheduled_for && <div style={{ fontFamily:SM, fontSize:8, color:b.plantilla==='pregunta'||b.plantilla==='cita'?C.ink3:'rgba(246,241,231,0.5)', textAlign:'center' }}>{new Date(b.scheduled_for).toLocaleDateString('es-ES',{weekday:'short',day:'numeric'})}</div>}
                    </div>
                    <div style={{ flex:1, padding:'14px 16px', display:'flex', flexDirection:'column', gap:8 }}>
                      <div style={{ fontFamily:SN, fontSize:13, fontWeight:600, color:C.ink }}>{b.titulo}</div>
                      {b.tema_elegido && <div style={{ fontFamily:SM, fontSize:10, color:C.red, letterSpacing:'.08em' }}>📅 {b.tema_elegido}</div>}
                      {editingCaption === b.id ? (
                        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                          <textarea value={captionEdit} onChange={e => setCaptionEdit(e.target.value)} rows={4} style={{ width:'100%', background:C.bone, border:`1px solid ${C.rule}`, borderRadius:6, color:C.ink, fontSize:12, padding:'8px 10px', fontFamily:SN, resize:'vertical', outline:'none' }} />
                          <div style={{ display:'flex', gap:6 }}>
                            <button onClick={() => guardarCaption(b.id)} style={{ padding:'5px 12px', borderRadius:6, border:'none', background:C.green, color:'#fff', fontFamily:SM, fontSize:11, cursor:'pointer' }}>Guardar</button>
                            <button onClick={() => setEditingCaption(null)} style={{ padding:'5px 12px', borderRadius:6, border:`1px solid ${C.rule}`, background:'none', color:C.ink4, fontFamily:SM, fontSize:11, cursor:'pointer' }}>Cancelar</button>
                          </div>
                        </div>
                      ) : <div style={{ fontFamily:SN, fontSize:12, color:C.ink3, lineHeight:1.5 }}>{b.caption?.slice(0,120)}...</div>}
                      <div style={{ display:'flex', gap:6, marginTop:4 }}>
                        <button onClick={() => publicarBorrador(b.id)} disabled={publicando===b.id} style={{ padding:'6px 14px', borderRadius:6, border:'none', background:publicando===b.id?C.rule:C.red, color:publicando===b.id?C.ink4:'#fff', fontFamily:SM, fontSize:11, cursor:publicando===b.id?'default':'pointer' }}>{publicando===b.id?'Publicando...':'✅ Publicar'}</button>
                        <button onClick={() => { setEditingCaption(b.id); setCaptionEdit(b.caption) }} style={{ padding:'6px 12px', borderRadius:6, border:`1px solid ${C.rule}`, background:'none', color:C.ink3, fontFamily:SM, fontSize:11, cursor:'pointer' }}>✏️ Editar</button>
                        <button onClick={() => window.open(b.image_url,'_blank')} style={{ padding:'6px 12px', borderRadius:6, border:`1px solid ${C.rule}`, background:'none', color:C.ink3, fontFamily:SM, fontSize:11, cursor:'pointer' }}>🖼️ Ver</button>
                        <button onClick={() => descartarBorrador(b.id)} style={{ padding:'6px 10px', borderRadius:6, border:`1px solid ${C.rule}`, background:'none', color:C.ink4, fontFamily:SM, fontSize:11, cursor:'pointer' }}>🗑️</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'publicados' && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:12 }}>
              {posts.filter(p => p.estado==='publicado').map(post => (
                <div key={post.id} style={{ background:C.paper, border:`1px solid ${C.rule}`, borderRadius:10, overflow:'hidden' }}>
                  <div style={{ height:40, background:TONO[post.plantilla]||C.dark, display:'flex', alignItems:'center', padding:'0 12px' }}>
                    <span style={{ fontFamily:SM, fontSize:9, color:post.plantilla==='pregunta'||post.plantilla==='cita'?C.ink:C.paper, letterSpacing:'.12em', textTransform:'uppercase' }}>{post.plantilla}</span>
                  </div>
                  <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ fontFamily:SN, fontSize:12, color:C.ink, lineHeight:1.4 }}>{post.titulo?.slice(0,60)}</div>
                    <div style={{ display:'flex', gap:12 }}>
                      {[{icon:'♥',val:post.likes||0},{icon:'👁',val:(post.alcance||0).toLocaleString('es-ES')}].map(m => (
                        <div key={m.icon} style={{ textAlign:'center' }}>
                          <div style={{ fontFamily:SE, fontSize:14, color:post.alcance>0?C.ink:C.ink4 }}>{m.icon} {m.val}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontFamily:SM, fontSize:10, color:C.ink4 }}>{new Date(post.created_at).toLocaleDateString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'generar' && (
            <div style={{ display:'flex', flexDirection:'column', gap:20, maxWidth:480 }}>
              <div style={{ fontFamily:SN, fontSize:13, color:C.ink3, lineHeight:1.6 }}>El agente genera contenido basándose en noticias del sector + módulos ia.rest. El resultado va a Telegram para aprobar antes de publicar.</div>
              <div>
                <div style={{ fontFamily:SM, fontSize:11, color:C.ink3, letterSpacing:'.08em', marginBottom:8 }}>PLANTILLA</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {PLANTILLAS.map(p => (
                    <button key={p} onClick={() => setTipoGenerar(p)} style={{ padding:'6px 12px', borderRadius:6, border:`1.5px solid ${tipoGenerar===p?C.red:C.rule}`, background:tipoGenerar===p?C.red+'12':C.bone, color:tipoGenerar===p?C.ink:C.ink3, fontFamily:SM, fontSize:11, cursor:'pointer' }}>{p==='auto'?'🔄 AUTO':p.toUpperCase()}</button>
                  ))}
                </div>
              </div>
              <button onClick={generarNuevo} disabled={generando} style={{ padding:'12px 24px', borderRadius:8, border:'none', background:generando?C.rule:C.red, color:generando?C.ink4:'#fff', fontFamily:SM, fontSize:13, cursor:generando?'default':'pointer', alignSelf:'flex-start' }}>{generando?'Generando...':'📸 Generar borrador'}</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

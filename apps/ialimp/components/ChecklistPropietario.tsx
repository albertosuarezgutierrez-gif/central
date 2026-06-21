
'use client'
import { useState, useEffect } from 'react'
import { photoSrc } from '@/lib/photo'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)',
  bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', red: '#dc2626',
}

interface Props {
  token:    string
  sesionId: string
  titulo:   string
  onClose:  () => void
}

export default function ChecklistPropietario({ token, sesionId, titulo, onClose }: Props) {
  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [fotoOpen,setFoto]    = useState<string|null>(null)
  const [tab,     setTab]     = useState<'checklist'|'fotos'>('checklist')

  useEffect(() => {
    fetch(`/api/propietario/${token}/sesion/${sesionId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [sesionId])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:C.bg }}>
      <div style={{ textAlign:'center', color:C.muted }}>
        <div style={{ fontSize:32, marginBottom:10 }}>🔍</div>
        <div style={{ fontSize:13, fontWeight:600 }}>Cargando...</div>
      </div>
    </div>
  )

  if (data?.error) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:C.bg, padding:24 }}>
      <div style={{ textAlign:'center', color:C.muted }}>
        <div style={{ fontSize:32, marginBottom:10 }}>🔒</div>
        <div style={{ fontSize:14, fontWeight:700, color:C.text }}>Sin acceso</div>
        <div style={{ fontSize:12, marginTop:6 }}>La empresa no ha activado esta vista</div>
        <button onClick={onClose} style={{ marginTop:16, padding:'10px 20px', borderRadius:10, border:'none', background:C.primary, color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          Volver
        </button>
      </div>
    </div>
  )

  const { sesion, fotos = [], checklist = [], permisos = {} } = data || {}
  const done  = checklist.filter((i:any) => i.checked).length
  const total = checklist.length
  const pct   = total > 0 ? Math.round((done/total)*100) : 0

  // Agrupar por frequency (diaria, semanal, etc.) — campo real
  const grupos: Record<string, any[]> = {}
  for (const item of checklist) {
    const grupo = item.frequency === 'weekly' ? '📅 Semanal'
                : item.frequency === 'monthly' ? '🗓 Mensual'
                : '🧹 Cada limpieza'
    if (!grupos[grupo]) grupos[grupo] = []
    grupos[grupo].push(item)
  }

  // Si solo hay un grupo (o todos son "Cada limpieza"), no agrupar
  const agrupar = Object.keys(grupos).length > 1

  return (
    <div style={{ fontFamily:"'Nunito',-apple-system,sans-serif", background:C.bg, minHeight:'100vh', maxWidth:480, margin:'0 auto' }}>

      {/* Header */}
      <div style={{ background:C.primary, padding:'14px 16px', position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: (permisos.ver_checklist && permisos.ver_fotos) ? 10 : 0 }}>
          <button onClick={onClose}
            style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:32, height:32, color:'white', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            ←
          </button>
          <div style={{ flex:1 }}>
            <div style={{ color:'white', fontWeight:700, fontSize:14, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{titulo}</div>
            <div style={{ color:'rgba(255,255,255,0.65)', fontSize:11 }}>
              {sesion?.session_date} {sesion?.limpiadora_nombre ? `· 🧹 ${sesion.limpiadora_nombre}` : ''}
            </div>
          </div>
          {permisos.ver_checklist && total > 0 && (
            <div style={{ background:'rgba(255,255,255,0.2)', borderRadius:8, padding:'4px 10px', fontSize:12, color:'white', fontWeight:700, flexShrink:0 }}>
              {done}/{total} ✓
            </div>
          )}
        </div>

        {/* Tabs — solo si tiene los dos permisos */}
        {permisos.ver_checklist && permisos.ver_fotos && (
          <div style={{ display:'flex', gap:2 }}>
            <button onClick={() => setTab('checklist')}
              style={{ flex:1, padding:'8px 0', border:'none', background:'transparent', color: tab==='checklist' ? 'white' : 'rgba(255,255,255,0.5)', fontWeight: tab==='checklist' ? 700 : 500, fontSize:13, borderBottom:`2px solid ${tab==='checklist' ? 'white' : 'transparent'}`, cursor:'pointer', fontFamily:'inherit' }}>
              ✅ Checklist
            </button>
            <button onClick={() => setTab('fotos')}
              style={{ flex:1, padding:'8px 0', border:'none', background:'transparent', color: tab==='fotos' ? 'white' : 'rgba(255,255,255,0.5)', fontWeight: tab==='fotos' ? 700 : 500, fontSize:13, borderBottom:`2px solid ${tab==='fotos' ? 'white' : 'transparent'}`, cursor:'pointer', fontFamily:'inherit' }}>
              📸 Fotos ({fotos.length})
            </button>
          </div>
        )}
      </div>

      <div style={{ padding:14 }}>

        {/* CHECKLIST */}
        {(tab === 'checklist' || !permisos.ver_fotos) && permisos.ver_checklist && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

            {total > 0 && (
              <div style={{ background:'white', borderRadius:12, padding:'14px 16px', border:`1px solid ${C.border}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:C.text }}>Progreso</span>
                  <span style={{ fontSize:13, fontWeight:800, color: pct===100 ? C.ok : C.primary }}>{pct}%</span>
                </div>
                <div style={{ height:8, background:'#e2e8f0', borderRadius:99, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${pct}%`, background: pct===100 ? C.ok : C.primary, borderRadius:99, transition:'width 0.3s' }} />
                </div>
                <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>{done} de {total} tareas completadas</div>
              </div>
            )}

            {/* Items — agrupados o lista plana */}
            {agrupar ? Object.entries(grupos).map(([grupo, items]) => {
              const gdone = items.filter((i:any) => i.checked).length
              return (
                <div key={grupo} style={{ background:'white', borderRadius:12, border:`1px solid ${C.border}`, overflow:'hidden' }}>
                  <div style={{ padding:'9px 14px', background: gdone===items.length ? C.okBg : C.light, borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between' }}>
                    <span style={{ fontSize:12, fontWeight:700, color: gdone===items.length ? C.ok : C.primary }}>{grupo}</span>
                    <span style={{ fontSize:11, color:C.muted }}>{gdone}/{items.length}</span>
                  </div>
                  {renderItems(items, setFoto)}
                </div>
              )
            }) : (
              <div style={{ background:'white', borderRadius:12, border:`1px solid ${C.border}`, overflow:'hidden' }}>
                {renderItems(checklist, setFoto)}
              </div>
            )}

            {checklist.length === 0 && (
              <div style={{ textAlign:'center', padding:'40px 0', color:C.muted }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
                <div style={{ fontWeight:600 }}>Sin checklist para esta sesión</div>
              </div>
            )}
          </div>
        )}

        {/* FOTOS */}
        {(tab === 'fotos' || !permisos.ver_checklist) && permisos.ver_fotos && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {fotos.length === 0 && (
              <div style={{ textAlign:'center', padding:'40px 0', color:C.muted }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📸</div>
                <div style={{ fontWeight:600 }}>Sin fotos aún</div>
              </div>
            )}

            {fotos.filter((f:any) => f.tipo !== 'item').length > 0 && (
              <div style={{ background:'white', borderRadius:12, border:`1px solid ${C.border}`, overflow:'hidden' }}>
                <div style={{ padding:'9px 14px', background:C.light, borderBottom:`1px solid ${C.border}` }}>
                  <span style={{ fontSize:12, fontWeight:700, color:C.primary }}>📸 Antes y después</span>
                </div>
                <div style={{ padding:12, display:'flex', gap:10, flexWrap:'wrap' }}>
                  {fotos.filter((f:any) => f.tipo !== 'item').map((f:any, i:number) => (
                    <div key={i} style={{ textAlign:'center' }}>
                      <button onClick={() => setFoto(f.url)}
                        style={{ width:150, height:110, borderRadius:10, backgroundImage:`url(${photoSrc(f.url)})`, backgroundSize:'cover', backgroundPosition:'center', border:`1px solid ${C.border}`, cursor:'pointer', display:'block' }} />
                      <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>
                        {f.tipo === 'antes' ? '🔴 Antes' : '🟢 Después'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fotos.filter((f:any) => f.tipo === 'item').length > 0 && (
              <div style={{ background:'white', borderRadius:12, border:`1px solid ${C.border}`, overflow:'hidden' }}>
                <div style={{ padding:'9px 14px', background:C.light, borderBottom:`1px solid ${C.border}` }}>
                  <span style={{ fontSize:12, fontWeight:700, color:C.primary }}>📋 Fotos del checklist</span>
                </div>
                <div style={{ padding:12, display:'flex', flexDirection:'column', gap:10 }}>
                  {fotos.filter((f:any) => f.tipo === 'item').map((f:any, i:number) => (
                    <div key={i} style={{ display:'flex', gap:10, alignItems:'center' }}>
                      <button onClick={() => setFoto(f.url)}
                        style={{ width:72, height:72, borderRadius:8, backgroundImage:`url(${photoSrc(f.url)})`, backgroundSize:'cover', backgroundPosition:'center', border:`1px solid ${C.border}`, cursor:'pointer', flexShrink:0 }} />
                      <div>
                        <div style={{ fontSize:12, fontWeight:600, color:C.text }}>{f.descripcion}</div>
                        {f.notas && <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>💬 {f.notas}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {fotoOpen && (
        <div onClick={() => setFoto(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.9)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:20 }}>
          <img src={photoSrc(fotoOpen)} style={{ maxWidth:'100%', maxHeight:'88vh', borderRadius:12 }} alt="" />
        </div>
      )}
    </div>
  )
}

function renderItems(items: any[], setFoto: (url: string) => void) {
  return items.map((item: any, i: number) => (
    <div key={item.id} style={{ padding:'11px 14px', borderBottom: i < items.length-1 ? `1px solid ${C.border}` : 'none', display:'flex', gap:10, alignItems:'flex-start' }}>
      <div style={{
        width:20, height:20, borderRadius:6, flexShrink:0, marginTop:1,
        background: item.checked ? C.ok : 'white',
        border: `2px solid ${item.checked ? C.ok : C.border}`,
        display:'flex', alignItems:'center', justifyContent:'center'
      }}>
        {item.checked && <span style={{ color:'white', fontSize:11, fontWeight:900 }}>✓</span>}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, color: item.checked ? C.muted : C.text, fontWeight: item.es_critico ? 700 : 500, textDecoration: item.checked ? 'line-through' : 'none' }}>
          {item.description}
          {item.es_critico && (
            <span style={{ marginLeft:6, fontSize:10, background:'#fef2f2', color:C.red, padding:'1px 6px', borderRadius:4, fontWeight:700, textDecoration:'none', display:'inline-block' }}>
              CRÍTICO
            </span>
          )}
        </div>
        {item.notes && <div style={{ fontSize:11, color:C.brand, marginTop:3 }}>💬 {item.notes}</div>}
        {item.photo_url && (
          <button onClick={() => setFoto(item.photo_url)}
            style={{ marginTop:6, width:60, height:60, borderRadius:8, backgroundImage:`url(${photoSrc(item.photo_url)})`, backgroundSize:'cover', border:`1px solid ${C.border}`, cursor:'pointer', display:'block' }} />
        )}
      </div>
    </div>
  ))
}

'use client'
import { useEffect, useState, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

const D = {
  dark:'#14110E', bg2:'#1E1A15', bg3:'#2A221A',
  paper:'#F6F1E7', ink2:'#D8CDB6', ink3:'#9C8E7E', ink4:'#6B5F52',
  red:'#D9442B', red2:'#A8311E', green:'#3F7D44', rule:'#2E2720'
}

interface Item { id:string; nombre:string; descripcion:string|null; precio_eur:number; pdf_url:string|null }
interface Portal { titulo:string; descripcion:string|null; estado:string; items:Item[]; restaurantes:{nombre:string;logo_url:string|null} }

function CobroInner() {
  const { slug } = useParams<{slug:string}>()
  const sp = useSearchParams()
  const pagoOk = sp.get('pago') === 'ok'

  const [portal, setPortal] = useState<Portal|null>(null)
  const [notFound, setNotFound] = useState(false)
  const [selIdx, setSelIdx] = useState<number|null>(null)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/cobros/${slug}`)
      .then(r => r.json())
      .then(d => { if (d.portal) setPortal(d.portal); else setNotFound(true) })
      .catch(() => setNotFound(true))
  }, [slug])

  const pagar = async () => {
    if (selIdx === null || !nombre.trim()) { setError('Selecciona un menú e introduce tu nombre'); return }
    setCargando(true); setError('')
    const item = portal!.items[selIdx]
    const res = await fetch(`/api/cobros/${slug}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: item.id, nombre_pagador: nombre, email_pagador: email })
    })
    const d = await res.json()
    if (d.checkout_url) { window.location.href = d.checkout_url }
    else { setError(d.error ?? 'Error al procesar el pago'); setCargando(false) }
  }

  const s = {
    card: { background: D.bg2, border: `1px solid ${D.rule}`, borderRadius: 14, padding: '1.25rem', marginBottom: '1rem' } as React.CSSProperties,
    inp: { width:'100%', padding:'11px 14px', background:D.bg3, border:`1px solid ${D.rule}`, borderRadius:10, color:D.paper, fontSize:14, fontFamily:'Inter Tight,sans-serif', outline:'none', boxSizing:'border-box' as const },
    btn: { width:'100%', padding:14, background:D.red, color:D.paper, border:'none', borderRadius:12, fontSize:15, fontWeight:600, fontFamily:'Inter Tight,sans-serif', cursor:'pointer' } as React.CSSProperties,
  }

  if (!portal && !notFound) return (
    <div style={{minHeight:'100vh',background:D.dark,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <p style={{color:D.ink3,fontFamily:'Inter Tight,sans-serif'}}>Cargando...</p>
    </div>
  )

  if (notFound) return (
    <div style={{minHeight:'100vh',background:D.dark,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <p style={{color:D.ink3,fontFamily:'Inter Tight,sans-serif'}}>Portal no encontrado</p>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:D.dark,fontFamily:'Inter Tight,sans-serif'}}>
      {/* Footer ia.rest top */}
      <div style={{background:D.dark,borderBottom:`1px solid ${D.rule}`,padding:'10px 20px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        {portal!.restaurantes.logo_url
          ? <img src={portal!.restaurantes.logo_url} alt={portal!.restaurantes.nombre} style={{maxHeight:36,maxWidth:160,objectFit:'contain'}} />
          : <span style={{color:D.paper,fontWeight:600}}>{portal!.restaurantes.nombre}</span>
        }
        <a href="https://www.iarest.es" target="_blank" style={{display:'flex',alignItems:'center',gap:5,textDecoration:'none'}}>
          <div style={{width:6,height:6,background:D.red,borderRadius:'50%'}}></div>
          <span style={{color:D.ink4,fontSize:11,fontWeight:500}}>ia.rest</span>
        </a>
      </div>

      <div style={{maxWidth:480,margin:'0 auto',padding:'2rem 1rem 4rem'}}>
        <div style={{textAlign:'center',marginBottom:'1.75rem'}}>
          <h1 style={{fontFamily:'Newsreader,serif',fontSize:'1.5rem',color:D.paper,margin:'0 0 6px'}}>{portal!.titulo}</h1>
          {portal!.descripcion && <p style={{fontSize:13,color:D.ink3,margin:0,lineHeight:1.6}}>{portal!.descripcion}</p>}
        </div>

        {pagoOk && (
          <div style={{...s.card,background:'rgba(63,125,68,.1)',border:`1px solid ${D.green}`,textAlign:'center',marginBottom:'1.25rem'}}>
            <p style={{color:D.green,margin:0,fontWeight:600}}>✓ Pago confirmado. ¡Gracias!</p>
          </div>
        )}

        {portal!.estado === 'cerrado' ? (
          <div style={{...s.card,textAlign:'center',padding:'2rem'}}>
            <p style={{color:D.ink3,margin:0}}>Este portal de pago está cerrado.</p>
          </div>
        ) : (
          <>
            <div style={s.card}>
              <p style={{fontSize:11,color:D.ink3,textTransform:'uppercase',letterSpacing:'.05em',fontWeight:600,marginBottom:'.75rem'}}>Elige tu menú</p>
              {portal!.items.map((item, i) => (
                <div key={item.id} onClick={() => setSelIdx(i)}
                  style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:12,
                    border:`1.5px solid ${selIdx===i ? D.red : D.rule}`,borderRadius:12,cursor:'pointer',
                    background:selIdx===i ? 'rgba(217,68,43,.06)' : D.bg3,marginBottom:'.5rem',transition:'all .2s'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:20,height:20,borderRadius:'50%',border:`1.5px solid ${selIdx===i ? D.red : D.rule}`,
                      background:selIdx===i ? D.red : 'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      {selIdx===i && <div style={{width:8,height:8,borderRadius:'50%',background:D.paper}}/>}
                    </div>
                    <div>
                      <div style={{fontSize:14,fontWeight:500,color:D.paper}}>{item.nombre}</div>
                      {item.descripcion && <div style={{fontSize:12,color:D.ink4}}>{item.descripcion}</div>}
                      {item.pdf_url && <a href={item.pdf_url} target="_blank" style={{fontSize:11,color:D.red,textDecoration:'none'}}>📄 Ver carta completa</a>}
                    </div>
                  </div>
                  <span style={{fontFamily:'Newsreader,serif',fontSize:'1.1rem',color:D.red,fontWeight:500,flexShrink:0,marginLeft:10}}>
                    {(item.precio_eur * 1.01).toFixed(2)} €
                  </span>
                </div>
              ))}
            </div>

            <div style={s.card}>
              <p style={{fontSize:11,color:D.ink3,textTransform:'uppercase',letterSpacing:'.05em',fontWeight:600,marginBottom:'.75rem'}}>Tus datos</p>
              <input style={{...s.inp,marginBottom:8}} value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Nombre y apellidos *" />
              <input style={s.inp} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email (para confirmación)" />
            </div>

            {error && <p style={{color:'#E8A33B',fontSize:13,marginBottom:'1rem'}}>{error}</p>}

            <button style={{...s.btn, opacity:selIdx===null||!nombre.trim()||cargando ? .5 : 1}}
              disabled={selIdx===null||!nombre.trim()||cargando} onClick={pagar}>
              {cargando ? 'Procesando...' : selIdx!==null ? `Pagar ${(portal!.items[selIdx].precio_eur*1.01).toFixed(2)} € con tarjeta` : 'Pagar con tarjeta'}
            </button>
            <p style={{fontSize:11,color:D.ink4,textAlign:'center',marginTop:8}}>🔒 Pago seguro procesado por Stripe</p>
          </>
        )}

        <div style={{textAlign:'center',marginTop:'2.5rem',paddingTop:'1.5rem',borderTop:`1px solid ${D.rule}`}}>
          <a href="https://www.iarest.es" target="_blank" style={{display:'inline-flex',alignItems:'center',gap:5,textDecoration:'none',color:D.ink4,fontSize:12}}>
            <div style={{width:6,height:6,background:D.red,borderRadius:'50%'}}/>
            Cobros gestionados por <strong style={{color:D.ink2,marginLeft:3}}>ia.rest</strong>
          </a>
        </div>
      </div>
    </div>
  )
}

export default function CobroPage() {
  return <Suspense fallback={null}><CobroInner /></Suspense>
}

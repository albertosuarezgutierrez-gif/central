'use client'
// ia.rest · /feedback/[token] — Valoración post-visita del cliente

import { useState, useEffect, use } from 'react'

const C = {
  dark: '#14110E', bg1: '#1E1A15', bg2: '#2A221A',
  paper: '#F6F1E7', ink: '#E8E0D0', ink3: '#9C8E7E', ink4: '#6B5F52',
  red: '#D9442B', green: '#3F7D44', amb: '#E8A33B', rule: '#2E2720',
}

const NOTAS = [
  { n: 1, emoji: '😞', label: 'Malo',      color: '#ef4444' },
  { n: 2, emoji: '😐', label: 'Regular',   color: '#f97316' },
  { n: 3, emoji: '🙂', label: 'Bien',      color: '#eab308' },
  { n: 4, emoji: '😊', label: 'Muy bien',  color: '#84cc16' },
  { n: 5, emoji: '🤩', label: 'Excelente', color: '#22c55e' },
]

export default function FeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)

  const [nota, setNota]           = useState<number | null>(null)
  const [comentario, setComentario] = useState('')
  const [estado, setEstado]       = useState<'idle'|'enviando'|'ok'|'error'|'ya_valorado'>('idle')
  const [restauranteNombre, setRestauranteNombre] = useState('')
  const [mostrarGoogle, setMostrarGoogle] = useState(false)
  const [googleUrl, setGoogleUrl]         = useState<string | null>(null)
  const [loading, setLoading]             = useState(true)

  // Leer nota de URL si viene del email
  useEffect(() => {
    const url = new URL(window.location.href)
    const n = parseInt(url.searchParams.get('nota') ?? '0')
    if (n >= 1 && n <= 5) setNota(n)
  }, [])

  // Cargar info del token
  useEffect(() => {
    fetch(`/api/feedback/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.estado === 'respondido') { setEstado('ya_valorado'); return }
        setRestauranteNombre(d.restaurante_nombre ?? '')
        setGoogleUrl(d.google_review_url ?? null)
      })
      .catch(() => setEstado('error'))
      .finally(() => setLoading(false))
  }, [token])

  const enviar = async () => {
    if (!nota) return
    setEstado('enviando')
    const r = await fetch(`/api/feedback/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nota, comentario }),
    })
    const d = await r.json()
    if (!r.ok) { setEstado('error'); return }
    setEstado('ok')
    if (nota >= 4 && d.google_url) {
      setGoogleUrl(d.google_url)
      setMostrarGoogle(true)
    }
  }

  if (loading) return (
    <div style={{minHeight:'100dvh',background:C.dark,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{color:C.ink3,fontSize:14}}>Cargando…</div>
    </div>
  )

  if (estado === 'ya_valorado') return (
    <div style={{minHeight:'100dvh',background:C.dark,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{textAlign:'center',color:C.paper}}>
        <div style={{fontSize:48,marginBottom:16}}>✅</div>
        <div style={{fontSize:20,fontWeight:700,marginBottom:8}}>Ya nos diste tu opinión</div>
        <div style={{color:C.ink3,fontSize:14}}>¡Gracias por tu valoración!</div>
      </div>
    </div>
  )

  if (estado === 'ok') return (
    <div style={{minHeight:'100dvh',background:C.dark,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{textAlign:'center',maxWidth:380}}>
        <div style={{fontSize:56,marginBottom:16}}>{nota && NOTAS[nota-1].emoji}</div>
        <div style={{color:C.paper,fontSize:22,fontWeight:700,marginBottom:8}}>¡Gracias!</div>
        <div style={{color:C.ink3,fontSize:15,marginBottom:32,lineHeight:1.5}}>
          Tu valoración nos ayuda a mejorar cada visita.
        </div>
        {mostrarGoogle && googleUrl && (
          <div style={{background:C.bg2,border:`1px solid ${C.rule}`,borderRadius:16,padding:24}}>
            <div style={{fontSize:28,marginBottom:10}}>⭐</div>
            <div style={{color:C.paper,fontSize:16,fontWeight:600,marginBottom:8}}>
              ¿Nos dejas una reseña en Google?
            </div>
            <div style={{color:C.ink3,fontSize:13,marginBottom:20,lineHeight:1.5}}>
              Solo 30 segundos. Nos ayuda muchísimo a llegar a más personas.
            </div>
            <a href={googleUrl} target="_blank" rel="noopener noreferrer"
              style={{
                display:'block',padding:'14px 24px',
                background:'#4285f4',color:'#fff',
                borderRadius:12,textDecoration:'none',
                fontWeight:700,fontSize:15,
              }}>
              Escribir reseña en Google
            </a>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div style={{minHeight:'100dvh',background:C.dark,padding:'32px 20px',display:'flex',flexDirection:'column',alignItems:'center'}}>
      <div style={{width:'100%',maxWidth:420}}>
        {/* Header */}
        <div style={{textAlign:'center',marginBottom:36}}>
          <div style={{fontSize:40,marginBottom:12}}>🍽️</div>
          <div style={{color:C.paper,fontSize:22,fontWeight:700,marginBottom:8}}>
            {restauranteNombre || '¿Cómo fue tu visita?'}
          </div>
          <div style={{color:C.ink3,fontSize:14}}>Tu opinión nos ayuda a mejorar</div>
        </div>

        {/* Estrellas */}
        <div style={{display:'flex',justifyContent:'center',gap:10,marginBottom:32,flexWrap:'wrap'}}>
          {NOTAS.map(n => (
            <button key={n.n} onClick={()=>setNota(n.n)}
              style={{
                width:64,border:'none',cursor:'pointer',
                background: nota === n.n ? `${n.color}22` : C.bg2,
                borderRadius:14,padding:'12px 6px',
                outline: nota === n.n ? `2px solid ${n.color}` : `1.5px solid ${C.rule}`,
                transition:'all .15s',
              }}>
              <div style={{fontSize:26}}>{n.emoji}</div>
              <div style={{fontSize:10,color: nota === n.n ? n.color : C.ink4,fontWeight:700,marginTop:4}}>{n.label}</div>
            </button>
          ))}
        </div>

        {/* Comentario */}
        {nota && (
          <div style={{marginBottom:24,animation:'fadeIn .2s ease'}}>
            <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>
            <textarea
              value={comentario}
              onChange={e=>setComentario(e.target.value)}
              placeholder="¿Algo que quieras contarnos? (opcional)"
              rows={3}
              style={{
                width:'100%',background:C.bg2,border:`1px solid ${C.rule}`,
                borderRadius:12,padding:'12px 16px',color:C.paper,
                fontSize:14,resize:'none',outline:'none',boxSizing:'border-box',
                fontFamily:'Arial,sans-serif',
              }}
            />
          </div>
        )}

        {/* Botón enviar */}
        <button
          onClick={enviar}
          disabled={!nota || estado === 'enviando'}
          style={{
            width:'100%',padding:'16px',
            background: nota ? C.red : C.bg2,
            border:'none',borderRadius:14,
            color: nota ? '#fff' : C.ink4,
            fontSize:16,fontWeight:700,cursor: nota ? 'pointer' : 'default',
            opacity: estado === 'enviando' ? .7 : 1,
            transition:'all .2s',
          }}>
          {estado === 'enviando' ? 'Enviando…' : 'Enviar valoración'}
        </button>

        {estado === 'error' && (
          <div style={{marginTop:16,color:'#ef4444',fontSize:13,textAlign:'center'}}>
            Algo fue mal. Inténtalo de nuevo.
          </div>
        )}
      </div>
    </div>
  )
}

'use client'
// ia.rest · /propina/[token] — Propina digital post-cobro

import { useState, useEffect, use } from 'react'

const C = {
  dark: '#14110E', bg1: '#1E1A15', bg2: '#2A221A',
  paper: '#F6F1E7', ink: '#E8E0D0', ink3: '#9C8E7E', ink4: '#6B5F52',
  red: '#D9442B', green: '#3F7D44', amb: '#E8A33B', rule: '#2E2720',
}

export default function PropinaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)

  const [info, setInfo]           = useState<{ restauranteNombre: string; camareroNombre: string | null; estado: string } | null>(null)
  const [importe, setImporte]     = useState<number | null>(null)
  const [custom, setCustom]       = useState('')
  const [opciones, setOpciones]   = useState<number[]>([1, 2, 3, 5])
  const [estado, setEstado]       = useState<'idle'|'procesando'|'ok'|'error'|'ya_pagada'>('idle')
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    fetch(`/api/propinas/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.estado === 'pagada') { setEstado('ya_pagada'); return }
        setInfo({ restauranteNombre: d.restaurante_nombre, camareroNombre: d.camarero_nombre, estado: d.estado })
        setOpciones(d.opciones ?? [1, 2, 3, 5])
      })
      .catch(() => setEstado('error'))
      .finally(() => setLoading(false))
  }, [token])

  const importeFinal = importe ?? (custom ? parseFloat(custom) : null)

  const pagar = async () => {
    if (!importeFinal || importeFinal <= 0) return
    setEstado('procesando')
    const r = await fetch(`/api/propinas/${token}/pagar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ importe: importeFinal }),
    })
    const d = await r.json()
    if (!r.ok || !d.url) { setEstado('error'); return }
    // Redirigir a Stripe Checkout
    window.location.href = d.url
  }

  if (loading) return (
    <div style={{minHeight:'100dvh',background:C.dark,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{color:C.ink3,fontSize:14}}>Cargando…</div>
    </div>
  )

  if (estado === 'ya_pagada') return (
    <div style={{minHeight:'100dvh',background:C.dark,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{textAlign:'center',color:C.paper}}>
        <div style={{fontSize:48,marginBottom:16}}>💝</div>
        <div style={{fontSize:20,fontWeight:700,marginBottom:8}}>¡Propina enviada!</div>
        <div style={{color:C.ink3,fontSize:14}}>Gracias por tu generosidad</div>
      </div>
    </div>
  )

  if (estado === 'ok') return (
    <div style={{minHeight:'100dvh',background:C.dark,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{textAlign:'center',color:C.paper}}>
        <div style={{fontSize:56,marginBottom:16}}>💝</div>
        <div style={{fontSize:22,fontWeight:700,marginBottom:8}}>¡Muchas gracias!</div>
        <div style={{color:C.ink3,fontSize:15,lineHeight:1.5}}>
          Tu propina de <strong style={{color:C.amb}}>{importeFinal?.toFixed(2)}€</strong> ha llegado.<br/>
          {info?.camareroNombre && `${info.camareroNombre} lo agradece enormemente.`}
        </div>
      </div>
    </div>
  )

  return (
    <div style={{minHeight:'100dvh',background:C.dark,padding:'32px 20px',display:'flex',flexDirection:'column',alignItems:'center'}}>
      <div style={{width:'100%',maxWidth:400}}>
        {/* Header */}
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontSize:40,marginBottom:12}}>💰</div>
          <div style={{color:C.paper,fontSize:22,fontWeight:700,marginBottom:6}}>
            {info?.restauranteNombre ?? 'Dejar propina'}
          </div>
          {info?.camareroNombre && (
            <div style={{color:C.ink3,fontSize:14}}>
              Para {info.camareroNombre} y el equipo
            </div>
          )}
        </div>

        {/* Importes sugeridos */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:20}}>
          {opciones.map(o => (
            <button key={o} onClick={()=>{setImporte(o);setCustom('')}}
              style={{
                padding:'16px 8px',border:'none',cursor:'pointer',
                background: importe === o ? `${C.amb}22` : C.bg2,
                borderRadius:14,
                outline: importe === o ? `2px solid ${C.amb}` : `1.5px solid ${C.rule}`,
                transition:'all .15s',
              }}>
              <div style={{color: importe === o ? C.amb : C.paper,fontSize:18,fontWeight:700}}>{o}€</div>
            </button>
          ))}
        </div>

        {/* Importe personalizado */}
        <div style={{marginBottom:24}}>
          <input
            type="number"
            min="0.50"
            step="0.50"
            value={custom}
            onChange={e=>{setCustom(e.target.value);setImporte(null)}}
            placeholder="Otro importe (€)"
            style={{
              width:'100%',background:C.bg2,border:`1.5px solid ${custom ? C.amb : C.rule}`,
              borderRadius:12,padding:'14px 16px',color:C.paper,
              fontSize:16,outline:'none',boxSizing:'border-box',
              fontFamily:'Arial,sans-serif',
            }}
          />
        </div>

        {/* Botón pagar */}
        <button
          onClick={pagar}
          disabled={!importeFinal || importeFinal <= 0 || estado === 'procesando'}
          style={{
            width:'100%',padding:'18px',
            background: importeFinal ? C.green : C.bg2,
            border:'none',borderRadius:14,
            color: importeFinal ? '#fff' : C.ink4,
            fontSize:17,fontWeight:700,
            cursor: importeFinal ? 'pointer' : 'default',
            opacity: estado === 'procesando' ? .7 : 1,
            transition:'all .2s',
          }}>
          {estado === 'procesando'
            ? 'Redirigiendo…'
            : importeFinal
              ? `Dejar ${importeFinal.toFixed(2)}€ de propina`
              : 'Elige un importe'}
        </button>

        <div style={{marginTop:16,textAlign:'center',color:C.ink4,fontSize:11}}>
          Pago seguro con Stripe · No guardamos datos de tu tarjeta
        </div>
      </div>
    </div>
  )
}

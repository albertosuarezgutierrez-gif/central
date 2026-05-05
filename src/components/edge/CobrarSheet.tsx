'use client'
// ia.rest · CobrarSheet
// Sheet de cobro: selecciona método, calcula cambio, genera factura VeriFactu

import React, { useState, useEffect, useCallback } from 'react'

const C = {
  bg:'#F6F1E7',bg1:'#FBF8F1',bg2:'#EFE7D6',bg3:'#E5DAC2',
  ink:'#1A1714',ink2:'#3A332C',ink3:'#6B5F52',ink4:'#9A8D7C',
  rule:'#D8CDB6',
  verm:'#D9442B',vermD:'#A8311E',vermS:'#F4D8CF',
  amb:'#E8A33B',ambS:'#F7E3B6',
  gr:'#3F7D44',grS:'#D4E4D2',
  teal:'#2B6A6E',
}
const SN="'Inter Tight',system-ui,sans-serif"
const SE="'Newsreader',Georgia,serif"
const SM="'JetBrains Mono',ui-monospace,monospace"

interface MetodoPago { id:string; nombre:string; tipo:string; icono:string; color:string }

interface Props {
  comandaId: string
  mesaLabel: string
  total: number            // total estimado (puede ser 0 si no hay precios)
  session: { id:string; nombre:string; rol:string }
  onCerrado: (result: { factura: Record<string,unknown>; cambio: number; metodo: string }) => void
  onCancel: () => void
}

export default function CobrarSheet({ comandaId, mesaLabel, total, session, onCerrado, onCancel }: Props) {
  const [metodos, setMetodos]       = useState<MetodoPago[]>([])
  const [metodoSel, setMetodoSel]   = useState<MetodoPago | null>(null)
  const [entregado, setEntregado]   = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [totalReal, setTotalReal]   = useState(total)
  const [loadingTotal, setLoadingTotal] = useState(false)

  const session_str = JSON.stringify(session)

  // Cargar métodos de pago y total real
  useEffect(() => {
    const headers = { 'x-ia-session': session_str }

    // Total real desde la API si el prop es 0
    if (total <= 0) {
      setLoadingTotal(true)
      fetch(`/api/mesa/x/comanda`, { headers })  // se obtiene desde el sheet de mesa
      setLoadingTotal(false)
    }

    // Métodos de pago del restaurante
    fetch('/api/metodos-pago', { headers })
      .then(r => r.json())
      .then(d => {
        const lista: MetodoPago[] = d.metodos ?? []
        setMetodos(lista)
        // Seleccionar el primero por defecto
        if (lista.length > 0) setMetodoSel(lista[0])
      })
      .catch(() => {
        // Fallback demo si la API no está lista
        const demo = [
          { id:'demo-ef', nombre:'Efectivo', tipo:'efectivo', icono:'💵', color:C.gr },
          { id:'demo-ta', nombre:'Tarjeta',  tipo:'tarjeta',  icono:'💳', color:C.teal },
          { id:'demo-bi', nombre:'Bizum',    tipo:'bizum',    icono:'📱', color:C.ink3 },
        ]
        setMetodos(demo)
        setMetodoSel(demo[0])
      })
  }, [session_str, total])

  const cambio = metodoSel?.tipo === 'efectivo' && parseFloat(entregado) > totalReal
    ? Math.round((parseFloat(entregado) - totalReal) * 100) / 100
    : 0

  const entregadoValido = metodoSel?.tipo !== 'efectivo' || parseFloat(entregado) >= totalReal || entregado === ''

  const cobrar = useCallback(async () => {
    if (!metodoSel) { setError('Selecciona un método de pago'); return }
    if (metodoSel.tipo === 'efectivo' && entregado && parseFloat(entregado) < totalReal) {
      setError('El importe entregado es menor que el total'); return
    }
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/factura/cerrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ia-session': session_str },
        body: JSON.stringify({
          comanda_id: comandaId,
          mesa_label: mesaLabel,
          metodo_id: metodoSel.id,
          entregado: metodoSel.tipo === 'efectivo' ? parseFloat(entregado) || totalReal : 0,
        })
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Error al cobrar'); setLoading(false); return }
      onCerrado({ factura: d.factura, cambio: d.cambio ?? 0, metodo: metodoSel.nombre })
    } catch { setError('Error de red'); setLoading(false) }
  }, [metodoSel, entregado, totalReal, comandaId, mesaLabel, session_str, onCerrado])

  // Atajos de importe entregado (billetes comunes)
  const atajos = totalReal > 0
    ? [10, 20, 50, 100].filter(b => b >= totalReal).slice(0, 3)
    : []
  if (atajos.length === 0 && totalReal > 0) atajos.push(...[50, 100, 200].filter(b => b >= totalReal).slice(0, 3))

  return (
    <>
      <div onClick={onCancel}
        style={{position:'fixed',inset:0,background:'rgba(26,23,20,.35)',zIndex:40,backdropFilter:'blur(2px)'}}/>

      <div style={{
        position:'fixed',bottom:0,left:0,right:0,zIndex:50,
        background:C.bg1,borderTop:`1px solid ${C.rule}`,
        borderRadius:'20px 20px 0 0',
        display:'flex',flexDirection:'column',
        maxHeight:'92dvh',
        boxShadow:'0 -8px 32px rgba(26,23,20,.14)',
        fontFamily:SN,color:C.ink,
        animation:'slideUp .3s cubic-bezier(.32,1,.28,1)',
      }}>
        <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
        <div style={{width:36,height:3,background:C.rule,borderRadius:2,margin:'10px auto 0',flexShrink:0}}/>

        {/* HEADER */}
        <div style={{padding:'12px 20px 10px',borderBottom:`1px solid ${C.rule}`,flexShrink:0}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontFamily:SE,fontStyle:'italic',fontSize:20,color:C.ink}}>Cobrar · {mesaLabel}</div>
              <div style={{fontFamily:SM,fontSize:22,fontWeight:700,color:C.verm,marginTop:2}}>
                {loadingTotal ? '…' : `${totalReal.toFixed(2).replace('.',',')} €`}
              </div>
            </div>
            <button onClick={onCancel} style={{background:'none',border:'none',fontSize:20,color:C.ink3,cursor:'pointer',padding:4}}>×</button>
          </div>
        </div>

        <div style={{flex:1,overflowY:'auto',scrollbarWidth:'none' as const}}>
          {/* MÉTODO DE PAGO */}
          <div style={{padding:'14px 20px 0'}}>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'1px',color:C.ink4,marginBottom:10}}>
              Método de pago
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              {metodos.map(m => {
                const on = metodoSel?.id === m.id
                return (
                  <button key={m.id} onClick={() => { setMetodoSel(m); setEntregado('') }}
                    style={{
                      padding:'12px 8px',borderRadius:12,
                      background:on?`${m.color}18`:C.bg2,
                      border:`2px solid ${on?m.color:C.rule}`,
                      display:'flex',flexDirection:'column',alignItems:'center',gap:4,
                      cursor:'pointer',transition:'all .12s',
                    }}>
                    <span style={{fontSize:24}}>{m.icono}</span>
                    <span style={{fontSize:12,fontWeight:on?700:400,color:on?m.color:C.ink2}}>{m.nombre}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* EFECTIVO: importe entregado + cambio */}
          {metodoSel?.tipo === 'efectivo' && (
            <div style={{padding:'14px 20px 0'}}>
              <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'1px',color:C.ink4,marginBottom:10}}>
                ¿Cuánto entrega el cliente?
              </div>

              {/* Atajos de billetes */}
              {atajos.length > 0 && (
                <div style={{display:'flex',gap:6,marginBottom:10}}>
                  <button onClick={()=>setEntregado(String(totalReal.toFixed(2)))}
                    style={{flex:1,padding:'8px',borderRadius:8,background:C.grS,border:`1px solid ${C.gr}55`,
                      fontSize:12,fontWeight:600,color:C.gr,cursor:'pointer'}}>
                    Justo
                  </button>
                  {atajos.map(b => (
                    <button key={b} onClick={()=>setEntregado(String(b))}
                      style={{flex:1,padding:'8px',borderRadius:8,background:C.bg2,border:`1px solid ${C.rule}`,
                        fontSize:12,fontWeight:500,color:C.ink2,cursor:'pointer'}}>
                      {b} €
                    </button>
                  ))}
                </div>
              )}

              {/* Input manual */}
              <div style={{position:'relative'}}>
                <input
                  type="number" inputMode="decimal"
                  value={entregado}
                  onChange={e=>setEntregado(e.target.value)}
                  placeholder={`${totalReal.toFixed(2)} €`}
                  style={{
                    width:'100%',background:C.bg2,border:`1px solid ${!entregadoValido?C.verm:C.rule}`,
                    borderRadius:10,padding:'12px 44px 12px 14px',
                    fontFamily:SM,fontSize:20,color:C.ink,outline:'none',
                    boxSizing:'border-box',
                  }}/>
                <span style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',
                  fontFamily:SM,fontSize:14,color:C.ink3}}>€</span>
              </div>

              {/* Cambio */}
              {parseFloat(entregado) > 0 && (
                <div style={{
                  marginTop:10,padding:'12px 14px',borderRadius:10,
                  background:cambio>0?C.grS:C.vermS,
                  border:`1px solid ${cambio>0?C.gr+'55':C.verm+'55'}`,
                  display:'flex',justifyContent:'space-between',alignItems:'center',
                }}>
                  <span style={{fontSize:13,fontWeight:600,color:cambio>0?C.gr:C.verm}}>
                    {cambio>0?'Cambio a devolver':'Falta'}
                  </span>
                  <span style={{fontFamily:SM,fontSize:20,fontWeight:700,color:cambio>0?C.gr:C.verm}}>
                    {cambio>0
                      ? `${cambio.toFixed(2).replace('.',',')} €`
                      : `${(totalReal-parseFloat(entregado)).toFixed(2).replace('.',',')} €`}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Bizum/Tarjeta: solo confirmar */}
          {metodoSel && metodoSel.tipo !== 'efectivo' && (
            <div style={{padding:'14px 20px 0'}}>
              <div style={{padding:'12px 14px',borderRadius:10,background:C.bg2,border:`1px solid ${C.rule}`,
                display:'flex',alignItems:'center',gap:12}}>
                <span style={{fontSize:22}}>{metodoSel.icono}</span>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:C.ink}}>
                    {metodoSel.nombre} · {totalReal.toFixed(2).replace('.',',')} €
                  </div>
                  <div style={{fontSize:11,color:C.ink3,marginTop:2}}>
                    {metodoSel.tipo==='tarjeta'?'Pasa el datáfono al cliente':'Envía el código QR de Bizum'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div style={{margin:'10px 20px 0',padding:'10px 14px',borderRadius:8,
              background:C.vermS,border:`1px solid ${C.verm}44`,
              fontFamily:SM,fontSize:11,color:C.verm}}>
              {error}
            </div>
          )}
        </div>

        {/* BOTÓN COBRAR */}
        <div style={{padding:'12px 20px 24px',borderTop:`1px solid ${C.rule}`,flexShrink:0}}>
          <button onClick={cobrar} disabled={loading||!metodoSel||!entregadoValido}
            style={{
              width:'100%',padding:'15px',
              background:loading||!metodoSel?C.rule:C.verm,
              border:'none',borderRadius:12,
              fontFamily:SN,fontSize:15,fontWeight:700,color:'#fff',
              cursor:loading||!metodoSel?'default':'pointer',
              transition:'background .15s',
              display:'flex',alignItems:'center',justifyContent:'center',gap:8,
            }}>
            {loading ? (
              <><span style={{fontFamily:SM,fontSize:12}}>Generando factura…</span></>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                Cobrar · {metodoSel?.nombre ?? '—'} · {totalReal.toFixed(2).replace('.',',')} €
              </>
            )}
          </button>
          {cambio > 0 && !loading && (
            <div style={{textAlign:'center',marginTop:8,fontFamily:SM,fontSize:13,color:C.gr,fontWeight:700}}>
              💵 Dar cambio: {cambio.toFixed(2).replace('.',',')} €
            </div>
          )}
        </div>
      </div>
    </>
  )
}

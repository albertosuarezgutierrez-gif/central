'use client'
// ia.rest · CobrarSheet v2
// Sheet de cobro con numpad táctil para efectivo, cálculo de cambio en tiempo real

import React, { useState, useEffect, useCallback } from 'react'

const C = {
  bg:'#F6F1E7',bg1:'#FBF8F1',bg2:'#EFE7D6',bg3:'#E5DAC2',
  ink:'#1A1714',ink2:'#3A332C',ink3:'#6B5F52',ink4:'#9A8D7C',
  rule:'#D8CDB6',
  verm:'#D9442B',vermD:'#A8311E',vermS:'#F4D8CF',
  amb:'#E8A33B',ambS:'#F7E3B6',
  gr:'#3F7D44',grS:'#D4E4D2',
  teal:'#2B6A6E',
  numBg:'#1A1714', numKey:'#2A2420', numKeyHL:'#3A3028',
}
const SN="'Inter Tight',system-ui,sans-serif"
const SE="'Newsreader',Georgia,serif"
const SM="'JetBrains Mono',ui-monospace,monospace"

interface MetodoPago { id:string; nombre:string; tipo:string; icono:string; color:string }

interface Props {
  comandaId: string
  mesaLabel: string
  total: number
  session: { id:string; nombre:string; rol:string }
  onCerrado: (result: { factura: Record<string,unknown>; cambio: number; metodo: string }) => void
  onCancel: () => void
}

// ─── Numpad ────────────────────────────────────────────────────────────────
function NumpadEfectivo({
  total,
  onConfirm,
}: {
  total: number
  onConfirm: (entregado: number) => void
}) {
  const [input, setInput] = useState('')

  const parsed   = parseFloat(input.replace(',', '.')) || 0
  const cambio   = parsed > total ? Math.round((parsed - total) * 100) / 100 : null
  const falta    = parsed > 0 && parsed < total ? Math.round((total - parsed) * 100) / 100 : null
  const exacto   = parsed === total

  const press = (key: string) => {
    if (key === 'C') { setInput(''); return }
    if (key === '⌫') { setInput(p => p.slice(0, -1)); return }
    // Justo
    if (key === '✓') { setInput(total.toFixed(2).replace('.', ',')); return }
    // Billetes rápidos
    if (typeof key === 'string' && key.endsWith('€')) {
      setInput(key.replace('€', '')); return
    }
    // Punto decimal — solo uno
    if (key === ',' && input.includes(',')) return
    // Max 2 decimales
    const partes = input.split(',')
    if (partes.length === 2 && partes[1].length >= 2) return
    // Max 6 chars antes del decimal
    if (!input.includes(',') && input.length >= 6 && key !== ',') return
    setInput(p => p + key)
  }

  // Billetes que tienen sentido para este total
  const billetes = [5,10,20,50,100,200].filter(b => b >= total).slice(0, 3)

  const canConfirm = parsed >= total

  const keyStyle = (col = C.numKey): React.CSSProperties => ({
    background: col,
    border: 'none',
    borderRadius: 12,
    fontFamily: SM,
    fontSize: 22,
    fontWeight: 600,
    color: '#F6F1E7',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
    transition: 'background .08s',
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none',
  })

  return (
    <div style={{ background: C.numBg, borderRadius: 16, overflow: 'hidden', margin: '0 20px 14px' }}>

      {/* DISPLAY ──────────────────────────────────── */}
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #2A2420' }}>

        {/* Total */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 8 }}>
          <span style={{ fontFamily:SN, fontSize:11, fontWeight:700, textTransform:'uppercase',
            letterSpacing:'1px', color:'#6B5F52' }}>Total a cobrar</span>
          <span style={{ fontFamily:SM, fontSize:18, color:'#F6F1E7', fontWeight:600 }}>
            {total.toFixed(2).replace('.',',')} €
          </span>
        </div>

        {/* Entregado — el "display" principal */}
        <div style={{
          background: '#0D0B09',
          borderRadius: 10,
          padding: '10px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          minHeight: 52,
          marginBottom: 10,
          border: `1px solid ${input ? '#3A3028' : '#1F1A15'}`,
        }}>
          <span style={{ fontFamily:SN, fontSize:11, fontWeight:700, textTransform:'uppercase',
            letterSpacing:'1px', color:'#4A4038' }}>Entrega</span>
          <span style={{
            fontFamily: SM,
            fontSize: input ? 28 : 18,
            fontWeight: 700,
            color: input ? '#F6F1E7' : '#3A3028',
            letterSpacing: '-0.5px',
          }}>
            {input ? `${input} €` : '_ _  €'}
          </span>
        </div>

        {/* Resultado: cambio / falta / exacto */}
        {parsed > 0 && (
          <div style={{
            borderRadius: 8,
            padding: '8px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: cambio ? '#1A2E1B' : falta ? '#2E1A1A' : '#1A2518',
            border: `1px solid ${cambio ? C.gr+'44' : falta ? C.verm+'44' : C.gr+'44'}`,
          }}>
            <span style={{
              fontFamily: SN, fontSize: 12, fontWeight: 700,
              color: cambio ? C.gr : falta ? C.verm : C.gr,
            }}>
              {cambio ? 'Cambio' : falta ? 'Falta' : '✓ Exacto'}
            </span>
            <span style={{
              fontFamily: SM, fontSize: 20, fontWeight: 700,
              color: cambio ? C.gr : falta ? C.verm : C.gr,
            }}>
              {cambio ? `${cambio.toFixed(2).replace('.',',')} €`
                : falta ? `${falta.toFixed(2).replace('.',',')} €`
                : ''}
            </span>
          </div>
        )}
      </div>

      {/* ATAJOS BILLETES ────────────────────────────── */}
      <div style={{ padding:'10px 12px 8px', display:'flex', gap:6, borderBottom:'1px solid #1F1A15' }}>
        <button onClick={() => press('✓')}
          style={{ ...keyStyle(C.gr+'CC'), flex:1, fontSize:12, fontWeight:700, height:38, borderRadius:8 }}>
          Justo
        </button>
        {billetes.map(b => (
          <button key={b} onClick={() => press(`${b}€`)}
            style={{ ...keyStyle('#2A2420'), flex:1, fontSize:13, height:38, borderRadius:8 }}>
            {b} €
          </button>
        ))}
      </div>

      {/* NUMPAD 3×4 ────────────────────────────────── */}
      <div style={{ padding:'10px 12px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
        {['7','8','9','4','5','6','1','2','3',',','0','⌫'].map(k => (
          <button key={k} onClick={() => press(k)}
            style={{
              ...keyStyle(k === '⌫' ? C.verm+'CC' : C.numKey),
              fontSize: k === '⌫' ? 18 : 22,
            }}>
            {k}
          </button>
        ))}
      </div>

      {/* BOTÓN CONFIRMAR EFECTIVO */}
      <div style={{ padding:'4px 12px 14px' }}>
        <button
          onClick={() => canConfirm && onConfirm(parsed)}
          disabled={!canConfirm}
          style={{
            width: '100%',
            height: 56,
            borderRadius: 12,
            border: 'none',
            background: canConfirm ? C.gr : '#1F1A15',
            fontFamily: SN,
            fontSize: 15,
            fontWeight: 700,
            color: canConfirm ? '#fff' : '#4A4038',
            cursor: canConfirm ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'background .15s',
          }}>
          {canConfirm ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Confirmar efectivo
              {cambio ? ` · Cambio ${cambio.toFixed(2).replace('.',',')} €` : exacto ? ' · Exacto' : ''}
            </>
          ) : (
            'Introduce el importe'
          )}
        </button>
      </div>
    </div>
  )
}

// ─── CobrarSheet ───────────────────────────────────────────────────────────
export default function CobrarSheet({ comandaId, mesaLabel, total, session, onCerrado, onCancel }: Props) {
  const [metodos, setMetodos]       = useState<MetodoPago[]>([])
  const [metodoSel, setMetodoSel]   = useState<MetodoPago | null>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [totalReal, setTotalReal]   = useState(total)
  const [entregadoFinal, setEntregadoFinal] = useState<number | null>(null)

  const session_str = JSON.stringify(session)

  useEffect(() => {
    const headers = { 'x-ia-session': session_str }
    fetch('/api/metodos-pago', { headers })
      .then(r => r.json())
      .then(d => {
        const lista: MetodoPago[] = d.metodos ?? []
        setMetodos(lista)
        if (lista.length > 0) setMetodoSel(lista[0])
      })
      .catch(() => {
        const demo = [
          { id:'demo-ef', nombre:'Efectivo', tipo:'efectivo', icono:'💵', color:C.gr },
          { id:'demo-ta', nombre:'Tarjeta',  tipo:'tarjeta',  icono:'💳', color:C.teal },
          { id:'demo-bi', nombre:'Bizum',    tipo:'bizum',    icono:'📱', color:C.ink3 },
        ]
        setMetodos(demo)
        setMetodoSel(demo[0])
      })
  }, [session_str, total])

  // Cuando cambia método, resetear entregado
  const seleccionarMetodo = (m: MetodoPago) => {
    setMetodoSel(m)
    setEntregadoFinal(null)
    setError('')
  }

  const cobrar = useCallback(async (entregado?: number) => {
    if (!metodoSel) { setError('Selecciona un método de pago'); return }
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/factura/cerrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ia-session': session_str },
        body: JSON.stringify({
          comanda_id: comandaId,
          mesa_label: mesaLabel,
          metodo_id: metodoSel.id,
          entregado: metodoSel.tipo === 'efectivo' ? (entregado ?? totalReal) : 0,
        })
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Error al cobrar'); setLoading(false); return }
      onCerrado({ factura: d.factura, cambio: d.cambio ?? 0, metodo: metodoSel.nombre })
    } catch { setError('Error de red'); setLoading(false) }
  }, [metodoSel, totalReal, comandaId, mesaLabel, session_str, onCerrado])

  const handleNumpadConfirm = (entregado: number) => {
    setEntregadoFinal(entregado)
    cobrar(entregado)
  }

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
        <style>{`
          @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
          button:active { opacity: 0.85; transform: scale(0.97); }
        `}</style>
        <div style={{width:36,height:3,background:C.rule,borderRadius:2,margin:'10px auto 0',flexShrink:0}}/>

        {/* HEADER */}
        <div style={{padding:'12px 20px 10px',borderBottom:`1px solid ${C.rule}`,flexShrink:0}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontFamily:SE,fontStyle:'italic',fontSize:20,color:C.ink}}>
                Cobrar · {mesaLabel}
              </div>
              <div style={{fontFamily:SM,fontSize:22,fontWeight:700,color:C.verm,marginTop:2}}>
                {`${totalReal.toFixed(2).replace('.',',')} €`}
              </div>
            </div>
            <button onClick={onCancel}
              style={{background:'none',border:'none',fontSize:22,color:C.ink3,cursor:'pointer',padding:4}}>
              ×
            </button>
          </div>
        </div>

        <div style={{flex:1,overflowY:'auto',scrollbarWidth:'none' as const}}>

          {/* MÉTODO DE PAGO */}
          <div style={{padding:'14px 20px 14px'}}>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'1px',color:C.ink4,marginBottom:10}}>
              Método de pago
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              {metodos.map(m => {
                const on = metodoSel?.id === m.id
                return (
                  <button key={m.id} onClick={() => seleccionarMetodo(m)}
                    style={{
                      padding:'12px 8px',borderRadius:12,
                      background:on?`${m.color}18`:C.bg2,
                      border:`2px solid ${on?m.color:C.rule}`,
                      display:'flex',flexDirection:'column',alignItems:'center',gap:4,
                      cursor:'pointer',transition:'all .12s',
                    }}>
                    <span style={{fontSize:24}}>{m.icono}</span>
                    <span style={{fontSize:12,fontWeight:on?700:400,color:on?m.color:C.ink2}}>
                      {m.nombre}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── EFECTIVO: NUMPAD ── */}
          {metodoSel?.tipo === 'efectivo' && !loading && (
            <NumpadEfectivo
              total={totalReal}
              onConfirm={handleNumpadConfirm}
            />
          )}

          {/* ── TARJETA / BIZUM: instrucción + botón directo ── */}
          {metodoSel && metodoSel.tipo !== 'efectivo' && !loading && (
            <div style={{padding:'0 20px 14px'}}>
              <div style={{
                padding:'14px 16px',borderRadius:12,
                background:C.bg2,border:`1px solid ${C.rule}`,
                display:'flex',alignItems:'center',gap:12,marginBottom:14,
              }}>
                <span style={{fontSize:28}}>{metodoSel.icono}</span>
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:C.ink}}>
                    {metodoSel.nombre} · {totalReal.toFixed(2).replace('.',',')} €
                  </div>
                  <div style={{fontSize:12,color:C.ink3,marginTop:3}}>
                    {metodoSel.tipo==='tarjeta'
                      ? 'Pasa el datáfono al cliente'
                      : 'Envía el código QR de Bizum'}
                  </div>
                </div>
              </div>

              <button onClick={() => cobrar()}
                style={{
                  width:'100%',height:54,borderRadius:12,border:'none',
                  background:C.verm,
                  fontFamily:SN,fontSize:15,fontWeight:700,color:'#fff',
                  cursor:'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                Confirmar cobro · {totalReal.toFixed(2).replace('.',',')} €
              </button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{padding:'24px 20px',textAlign:'center'}}>
              <div style={{fontFamily:SM,fontSize:13,color:C.ink3}}>Generando factura…</div>
            </div>
          )}

          {error && (
            <div style={{margin:'0 20px 14px',padding:'10px 14px',borderRadius:8,
              background:C.vermS,border:`1px solid ${C.verm}44`,
              fontFamily:SM,fontSize:11,color:C.verm}}>
              {error}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

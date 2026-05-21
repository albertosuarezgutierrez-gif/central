'use client'
// AsnClientApp — Portal del proveedor para pre-notificar envío (ASN)
// Acceso: /asn/[token] — sin login, token válido 72h
// El proveedor confirma cantidades, sube albarán y la recepción queda pre-cargada en ia.rest

import { useState, useEffect } from 'react'

const C = {
  bg: '#14110E', bg2: '#1E1A15', bg3: '#2A221A',
  red: '#D9442B', cream: '#F6F1E7', creamMid: '#D8CDB6',
  creamDim: '#8C7B69', green: '#3F7D44', rule: '#2E2720', amber: '#E8A33B',
}

type PedidoASN = {
  id: string; articulo: string; cantidad: number; unidad: string
  restaurante: string; proveedor: string; ya_subido: boolean
}

type AsnItem = {
  articulo: string; cantidad: string; unidad: string
  precio: string; lote: string; caducidad: string
}

export default function AsnClientApp({ token }: { token: string }) {
  const [screen, setScreen]   = useState<'loading' | 'error' | 'form' | 'ok'>('loading')
  const [pedido, setPedido]   = useState<PedidoASN | null>(null)
  const [error,  setError]    = useState('')
  const [items,  setItems]    = useState<AsnItem[]>([])
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [albaran,  setAlbaran] = useState('')
  const [notas,    setNotas]   = useState('')
  const [sending,  setSending] = useState(false)
  const [toast,    setToast]   = useState('')

  useEffect(() => {
    fetch(`/api/asn?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { setError(d.error ?? 'Link inválido'); setScreen('error'); return }
        setPedido(d.pedido)
        setItems([{
          articulo: d.pedido.articulo,
          cantidad: String(d.pedido.cantidad),
          unidad: d.pedido.unidad,
          precio: '', lote: '', caducidad: '',
        }])
        if (d.pedido.ya_subido) setScreen('ok')
        else setScreen('form')
      })
      .catch(() => { setError('Error de conexión'); setScreen('error') })
  }, [token])

  const enviar = async () => {
    const itemsValidos = items.filter(i => i.articulo && parseFloat(i.cantidad) > 0)
    if (!itemsValidos.length) return setToast('Añade al menos un artículo con cantidad')
    setSending(true)
    try {
      const r = await fetch('/api/asn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          items: itemsValidos.map(i => ({
            articulo: i.articulo,
            cantidad: parseFloat(i.cantidad),
            unidad: i.unidad,
            precio: i.precio ? parseFloat(i.precio) : undefined,
            lote: i.lote || undefined,
            caducidad: i.caducidad || undefined,
          })),
          fecha_entrega_estimada: fechaEntrega || undefined,
          albaran_numero: albaran || undefined,
          notas: notas || undefined,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setScreen('ok')
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Error al enviar')
    } finally { setSending(false) }
  }

  const inp = (v: string, onChange: (s: string) => void, placeholder?: string, type = 'text') => (
    <input type={type} value={v} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width:'100%', padding:'8px 12px', background:C.bg3, border:`1px solid ${C.rule}`,
        borderRadius:8, color:C.cream, fontFamily:'system-ui,sans-serif', fontSize:13,
        outline:'none', boxSizing:'border-box' as const }} />
  )

  if (screen === 'loading') return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:C.creamDim, fontFamily:'Georgia,serif', fontStyle:'italic', fontSize:18 }}>Verificando link…</div>
    </div>
  )

  if (screen === 'error') return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ textAlign:'center', maxWidth:380 }}>
        <div style={{ fontSize:40, marginBottom:16 }}>⚠️</div>
        <div style={{ color:C.cream, fontFamily:'Georgia,serif', fontStyle:'italic', fontSize:20, marginBottom:8 }}>
          Link no válido
        </div>
        <div style={{ color:C.creamDim, fontFamily:'system-ui,sans-serif', fontSize:14 }}>{error}</div>
      </div>
    </div>
  )

  if (screen === 'ok') return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ textAlign:'center', maxWidth:380 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
        <div style={{ color:C.cream, fontFamily:'Georgia,serif', fontStyle:'italic', fontSize:22, marginBottom:12 }}>
          ¡Notificación recibida!
        </div>
        <div style={{ color:C.creamDim, fontFamily:'system-ui,sans-serif', fontSize:14, lineHeight:1.6 }}>
          {pedido?.restaurante} ya tiene tu pedido pre-cargado.<br />
          Al llegar el camión solo tendrán que confirmar las cantidades.
        </div>
        <div style={{ marginTop:24, padding:'10px 18px', background:C.bg2, borderRadius:10, border:`1px solid ${C.rule}` }}>
          <div style={{ fontFamily:'monospace', fontSize:11, color:C.creamDim }}>
            {pedido?.articulo} · {pedido?.cantidad} {pedido?.unidad}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:C.bg, padding:'0 0 40px' }}>
      {/* Header */}
      <div style={{ padding:'20px 20px 16px', borderBottom:`1px solid ${C.rule}` }}>
        <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontSize:22, color:C.cream }}>
          ia.rest · Portal proveedor
        </div>
        <div style={{ fontFamily:'system-ui,sans-serif', fontSize:12, color:C.creamDim, marginTop:3 }}>
          Pre-notificación de envío — {pedido?.restaurante}
        </div>
      </div>

      <div style={{ padding:'20px 20px 0', maxWidth:520, margin:'0 auto' }}>
        {/* Info pedido */}
        <div style={{ background:C.bg2, borderRadius:12, padding:'14px 16px', marginBottom:20, border:`1px solid ${C.rule}` }}>
          <div style={{ fontFamily:'system-ui,sans-serif', fontSize:11, color:C.creamDim, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:6 }}>
            Pedido recibido
          </div>
          <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontSize:16, color:C.cream }}>
            {pedido?.articulo}
          </div>
          <div style={{ fontFamily:'monospace', fontSize:12, color:C.creamDim, marginTop:3 }}>
            {pedido?.cantidad} {pedido?.unidad} · Para {pedido?.restaurante}
          </div>
        </div>

        {/* Artículos a enviar */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontFamily:'system-ui,sans-serif', fontSize:11, color:C.creamDim, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:10 }}>
            Artículos que envías
          </div>
          {items.map((it, i) => (
            <div key={i} style={{ background:C.bg2, borderRadius:10, padding:'12px 14px', marginBottom:8, border:`1px solid ${C.rule}` }}>
              <div style={{ marginBottom:8 }}>
                <div style={{ fontFamily:'system-ui,sans-serif', fontSize:10, color:C.creamDim, marginBottom:4 }}>ARTÍCULO</div>
                {inp(it.articulo, v => setItems(ls => ls.map((x,j) => j===i ? {...x, articulo:v} : x)), 'Nombre del artículo')}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                <div>
                  <div style={{ fontFamily:'system-ui,sans-serif', fontSize:10, color:C.creamDim, marginBottom:4 }}>CANTIDAD</div>
                  {inp(it.cantidad, v => setItems(ls => ls.map((x,j) => j===i ? {...x, cantidad:v} : x)), '0', 'number')}
                </div>
                <div>
                  <div style={{ fontFamily:'system-ui,sans-serif', fontSize:10, color:C.creamDim, marginBottom:4 }}>UNIDAD</div>
                  {inp(it.unidad, v => setItems(ls => ls.map((x,j) => j===i ? {...x, unidad:v} : x)), 'kg')}
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                <div>
                  <div style={{ fontFamily:'system-ui,sans-serif', fontSize:10, color:C.creamDim, marginBottom:4 }}>€/UNIDAD</div>
                  {inp(it.precio, v => setItems(ls => ls.map((x,j) => j===i ? {...x, precio:v} : x)), '0.00', 'number')}
                </div>
                <div>
                  <div style={{ fontFamily:'system-ui,sans-serif', fontSize:10, color:C.creamDim, marginBottom:4 }}>LOTE</div>
                  {inp(it.lote, v => setItems(ls => ls.map((x,j) => j===i ? {...x, lote:v} : x)), 'L2601A')}
                </div>
                <div>
                  <div style={{ fontFamily:'system-ui,sans-serif', fontSize:10, color:C.creamDim, marginBottom:4 }}>CADUCA</div>
                  {inp(it.caducidad, v => setItems(ls => ls.map((x,j) => j===i ? {...x, caducidad:v} : x)), '', 'date')}
                </div>
              </div>
              {items.length > 1 && (
                <button onClick={() => setItems(ls => ls.filter((_,j) => j !== i))}
                  style={{ marginTop:8, background:'none', border:'none', color:C.creamDim, cursor:'pointer', fontSize:12 }}>
                  Eliminar artículo
                </button>
              )}
            </div>
          ))}
          <button onClick={() => setItems(ls => [...ls, { articulo:'', cantidad:'', unidad:'unidad', precio:'', lote:'', caducidad:'' }])}
            style={{ width:'100%', padding:'8px', background:'none', border:`1px dashed ${C.rule}`, borderRadius:8,
              color:C.creamDim, fontFamily:'system-ui,sans-serif', fontSize:12, cursor:'pointer' }}>
            + Añadir otro artículo
          </button>
        </div>

        {/* Datos del envío */}
        <div style={{ marginBottom:20 }}>
          <div style={{ fontFamily:'system-ui,sans-serif', fontSize:11, color:C.creamDim, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:10 }}>
            Datos del envío (opcionales)
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
            <div>
              <div style={{ fontFamily:'system-ui,sans-serif', fontSize:10, color:C.creamDim, marginBottom:4 }}>Nº ALBARÁN</div>
              {inp(albaran, setAlbaran, 'ALB-2026-001')}
            </div>
            <div>
              <div style={{ fontFamily:'system-ui,sans-serif', fontSize:10, color:C.creamDim, marginBottom:4 }}>FECHA ENTREGA</div>
              {inp(fechaEntrega, setFechaEntrega, '', 'date')}
            </div>
          </div>
          <div style={{ fontFamily:'system-ui,sans-serif', fontSize:10, color:C.creamDim, marginBottom:4 }}>NOTAS</div>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Alguna aclaración sobre el pedido…"
            rows={2}
            style={{ width:'100%', padding:'8px 12px', background:C.bg3, border:`1px solid ${C.rule}`,
              borderRadius:8, color:C.cream, fontFamily:'system-ui,sans-serif', fontSize:13,
              outline:'none', resize:'vertical', boxSizing:'border-box' as const }} />
        </div>

        {toast && (
          <div style={{ background:'#FEE2E2', borderRadius:8, padding:'10px 14px', fontFamily:'system-ui,sans-serif', fontSize:12, color:'#991B1B', marginBottom:12 }}>
            {toast}
          </div>
        )}

        <button onClick={enviar} disabled={sending} style={{
          width:'100%', padding:'14px', background: sending ? C.rule : C.red,
          border:'none', borderRadius:12, color:C.cream, fontFamily:'system-ui,sans-serif',
          fontSize:14, fontWeight:700, cursor: sending ? 'default' : 'pointer',
        }}>
          {sending ? 'Enviando…' : '✓ Confirmar notificación de envío'}
        </button>

        <div style={{ marginTop:12, fontFamily:'system-ui,sans-serif', fontSize:11, color:C.creamDim, textAlign:'center' }}>
          Este portal es gestionado por ia.rest · Tus datos solo se usan para gestionar este pedido
        </div>
      </div>
    </div>
  )
}

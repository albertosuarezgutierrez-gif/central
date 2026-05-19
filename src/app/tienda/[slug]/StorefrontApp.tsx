'use client'
import { C, SE, SN, SM, SC } from '@/lib/colors'

import { useEffect, useState, useCallback, useRef } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

/* ─── PALETA — idéntica a la app ──────────────────────────────── */

/* ─── Tipos ──────────────────────────────────────────────────── */
interface Producto { id:string; nombre:string; descripcion?:string; precio:number; seccion:string; alergenos?:string[] }
interface Config { slug:string; nombre_publico:string; descripcion?:string; logo_url?:string; color_primario:string; acepta_delivery:boolean; acepta_recogida:boolean; tiempo_estimado_min:number; pedido_minimo_eur:number }
interface Item { producto:Producto; cantidad:number }
type Vista = 'carta'|'datos'|'pago'|'ok'

/* ─── Stripe ─────────────────────────────────────────────────── */
function PagoStripe({ clientSecret, onOk }: { clientSecret:string; onOk:()=>void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const pagar = async () => {
    if (!stripe || !elements) return
    setBusy(true); setErr('')
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })
    if (error) { setErr(error.message ?? 'Error'); setBusy(false) }
    else onOk()
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <PaymentElement options={{ layout:'tabs' }} />
      {err && (
        <div style={{ fontFamily:SN, fontSize:12, color:C.verm, background:C.vermS, borderRadius:8, padding:'8px 12px' }}>{err}</div>
      )}
      <button
        onPointerDown={pagar} disabled={busy || !stripe}
        style={{ width:'100%', padding:14, borderRadius:8, border:'none', background:busy?C.bg3:C.ink, color:C.bg, fontFamily:SN, fontSize:14, fontWeight:700, cursor:busy?'default':'pointer', transition:'background .15s' }}
      >
        {busy ? 'Procesando…' : 'Confirmar y pagar'}
      </button>
    </div>
  )
}

/* ─── App ────────────────────────────────────────────────────── */
export default function StorefrontApp({ slug }: { slug:string }) {
  const [config, setConfig]   = useState<Config|null>(null)
  const [secciones, setSecs]  = useState<Record<string,Producto[]>>({})
  const [carrito, setCarrito] = useState<Item[]>([])
  const [vista, setVista]     = useState<Vista>('carta')
  const [tipo, setTipo]       = useState<'delivery'|'recogida'>('delivery')
  const [secActiva, setSec]   = useState('')
  const [drawer, setDrawer]   = useState(false)
  const [cargando, setLoad]   = useState(true)
  const [err, setErr]         = useState('')
  const [creando, setCreando] = useState(false)
  const [clientSecret, setCS] = useState('')
  const [pedidoId, setPid]    = useState('')
  const [pedidoNum, setNum]   = useState(0)
  const secRefs = useRef<Record<string,HTMLDivElement|null>>({})

  const [nombre, setNombre]     = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDir]     = useState('')
  const [notas, setNotas]       = useState('')

  useEffect(() => {
    fetch(`/api/storefront/carta?slug=${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErr(d.error); return }
        setConfig(d.config)
        setSecs(d.secciones)
        setSec(Object.keys(d.secciones)[0] ?? '')
        if (!d.config.acepta_delivery) setTipo('recogida')
      })
      .catch(() => setErr('No se pudo cargar la carta'))
      .finally(() => setLoad(false))
  }, [slug])

  /* Scroll spy */
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) setSec(e.target.id.replace('sec-','')) }),
      { rootMargin:'-35% 0px -60% 0px' }
    )
    Object.values(secRefs.current).forEach(el => { if (el) obs.observe(el) })
    return () => obs.disconnect()
  }, [secciones])

  const total = carrito.reduce((a,i) => a + i.producto.precio * i.cantidad, 0)
  const uds   = carrito.reduce((a,i) => a + i.cantidad, 0)

  const añadir = useCallback((p:Producto) => {
    setCarrito(prev => {
      const ex = prev.find(i => i.producto.id === p.id)
      return ex ? prev.map(i => i.producto.id===p.id ? {...i,cantidad:i.cantidad+1} : i)
                : [...prev, {producto:p, cantidad:1}]
    })
  }, [])

  const cambiar = useCallback((id:string, d:number) => {
    setCarrito(prev => prev.map(i => i.producto.id===id ? {...i,cantidad:i.cantidad+d} : i).filter(i => i.cantidad>0))
  }, [])

  const irSec = (sec:string) => {
    setSec(sec)
    secRefs.current[sec]?.scrollIntoView({ behavior:'smooth', block:'start' })
  }

  const crearPedido = async () => {
    if (!nombre.trim()||!telefono.trim()) return
    if (tipo==='delivery'&&!direccion.trim()) return
    setCreando(true); setErr('')
    const res = await fetch('/api/storefront/pedido', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        slug, tipo,
        cliente_nombre:nombre,
        cliente_telefono:telefono,
        cliente_direccion:tipo==='delivery'?direccion:null,
        cliente_notas:notas||null,
        items:carrito.map(i => ({ producto_id:i.producto.id, nombre:i.producto.nombre, cantidad:i.cantidad, precio_unitario:i.producto.precio })),
      }),
    })
    const d = await res.json()
    setCreando(false)
    if (d.error) { setErr(d.error); return }
    setCS(d.client_secret); setPid(d.pedido_id); setNum(d.numero)
    setVista('pago')
  }

  /* ── Carga ───────────────────────────────────────────────── */
  if (cargando) return (
    <div style={{ minHeight:'100dvh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:32, height:32, border:`3px solid ${C.verm}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
        <p style={{ fontFamily:SN, fontSize:13, color:C.ink3 }}>Cargando carta…</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (err&&!config) return (
    <div style={{ minHeight:'100dvh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:SE, fontSize:20, color:C.ink, marginBottom:6 }}>Tienda no disponible</div>
        <p style={{ fontFamily:SN, fontSize:13, color:C.ink3 }}>{err}</p>
      </div>
    </div>
  )
  if (!config) return null

  /* ── Confirmado ──────────────────────────────────────────── */
  if (vista==='ok') return (
    <div style={{ minHeight:'100dvh', background:C.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, fontFamily:SN }}>
      <div style={{ width:56, height:56, borderRadius:'50%', border:`2px solid ${C.gr}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:C.gr, marginBottom:20 }}>✓</div>
      <div style={{ fontFamily:SE, fontSize:24, color:C.ink, marginBottom:6, textAlign:'center' }}>Pedido #{pedidoNum} recibido</div>
      <p style={{ fontSize:13, color:C.ink3, marginBottom:28, textAlign:'center' }}>
        {tipo==='delivery' ? `Entrega en aprox. ${config.tiempo_estimado_min} min` : 'Listo para recoger en breve'}
      </p>
      <a href={`/tienda/${slug}/pedido/${pedidoId}`}
        style={{ padding:'12px 24px', borderRadius:8, border:`1px solid ${C.rule}`, fontFamily:SN, fontSize:13, fontWeight:600, color:C.ink, textDecoration:'none', background:C.bg1 }}>
        Ver estado del pedido →
      </a>
    </div>
  )

  /* ── Pago ────────────────────────────────────────────────── */
  if (vista==='pago'&&clientSecret) return (
    <div style={{ minHeight:'100dvh', background:C.bg, display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.rule}`, background:C.bg1, display:'flex', alignItems:'center', gap:10 }}>
        <button onPointerDown={() => setVista('datos')}
          style={{ border:'none', background:'none', fontFamily:SN, fontSize:13, color:C.ink3, cursor:'pointer', padding:'4px 0' }}>
          ← Volver
        </button>
        <span style={{ fontFamily:SE, fontSize:16, color:C.ink }}>Pago seguro</span>
      </div>
      <div style={{ maxWidth:480, width:'100%', margin:'0 auto', padding:20, display:'flex', flexDirection:'column', gap:16 }}>
        <div style={{ background:C.bg1, border:`1px solid ${C.rule}`, borderRadius:10, padding:'14px 16px' }}>
          <div style={{ fontFamily:SN, fontSize:11, color:C.ink4, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>Total a pagar</div>
          <div style={{ fontFamily:SE, fontSize:28, color:C.ink }}>{total.toFixed(2)} €</div>
          <div style={{ fontFamily:SN, fontSize:12, color:C.ink3, marginTop:2 }}>
            {tipo==='delivery' ? `Delivery · ${direccion}` : 'Recogida en local'}
          </div>
        </div>
        <Elements stripe={stripePromise} options={{ clientSecret, locale:'es', appearance:{ theme:'stripe', variables:{ colorPrimary:C.verm, borderRadius:'8px', fontFamily:SN } } }}>
          <PagoStripe clientSecret={clientSecret} onOk={() => setVista('ok')} />
        </Elements>
        <p style={{ fontFamily:SN, fontSize:11, color:C.ink4, textAlign:'center' }}>Pago procesado por Stripe</p>
      </div>
    </div>
  )

  /* ── Datos cliente ───────────────────────────────────────── */
  if (vista==='datos') {
    const ok = nombre.trim()&&telefono.trim()&&(tipo!=='delivery'||direccion.trim())
    return (
      <div style={{ minHeight:'100dvh', background:C.bg, display:'flex', flexDirection:'column', fontFamily:SN }}>
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.rule}`, background:C.bg1, display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <button onPointerDown={() => setVista('carta')}
            style={{ border:'none', background:'none', fontFamily:SN, fontSize:13, color:C.ink3, cursor:'pointer', padding:'4px 0' }}>
            ← Volver
          </button>
          <span style={{ fontFamily:SE, fontSize:16, color:C.ink }}>Tu pedido</span>
        </div>

        <div style={{ flex:1, overflowY:'auto' }}>
          <div style={{ maxWidth:480, width:'100%', margin:'0 auto', padding:'16px 16px 0', display:'flex', flexDirection:'column', gap:14 }}>

            {/* Tipo — solo si acepta ambos */}
            {config.acepta_delivery&&config.acepta_recogida && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {(['delivery','recogida'] as const).map(t => (
                  <button key={t} onPointerDown={() => setTipo(t)}
                    style={{ padding:'11px 0', borderRadius:8, border:`1.5px solid ${tipo===t?C.verm:C.rule}`, background:tipo===t?C.vermS:'transparent', color:tipo===t?C.verm:C.ink3, fontFamily:SN, fontSize:13, fontWeight:600, cursor:'pointer', transition:'all .12s' }}>
                    {t==='delivery' ? 'Delivery' : 'Recoger'}
                  </button>
                ))}
              </div>
            )}

            {/* Resumen carrito */}
            <div style={{ background:C.bg1, border:`1px solid ${C.rule}`, borderRadius:10, overflow:'hidden' }}>
              {carrito.map((item,i) => (
                <div key={item.producto.id}
                  style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', borderBottom:i<carrito.length-1?`1px solid ${C.rule}`:'none' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ background:C.verm, color:C.bg, borderRadius:6, padding:'1px 7px', fontFamily:SM, fontSize:10, fontWeight:700 }}>{item.cantidad}</span>
                    <span style={{ fontFamily:SN, fontSize:13, color:C.ink2 }}>{item.producto.nombre}</span>
                  </div>
                  <span style={{ fontFamily:SM, fontSize:12, color:C.ink3 }}>{(item.producto.precio*item.cantidad).toFixed(2)} €</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 14px', borderTop:`1px solid ${C.rule}` }}>
                <span style={{ fontFamily:SN, fontSize:13, fontWeight:700, color:C.ink }}>Total</span>
                <span style={{ fontFamily:SM, fontSize:13, fontWeight:700, color:C.verm }}>{total.toFixed(2)} €</span>
              </div>
            </div>

            {/* Campos */}
            {[
              { label:'Nombre', val:nombre, set:setNombre, ph:'Tu nombre completo', type:'text' },
              { label:'Teléfono', val:telefono, set:setTelefono, ph:'600 000 000', type:'tel' },
              ...(tipo==='delivery' ? [{ label:'Dirección de entrega', val:direccion, set:setDir, ph:'Calle, número, piso', type:'text' }] : []),
              { label:'Notas (opcional)', val:notas, set:setNotas, ph:'Sin cebolla, alérgenos…', type:'text' },
            ].map(f => (
              <div key={f.label}>
                <label style={{ display:'block', fontFamily:SN, fontSize:11, fontWeight:600, color:C.ink3, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>
                  {f.label}
                </label>
                <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                  style={{ width:'100%', padding:'11px 12px', borderRadius:8, border:`1px solid ${C.rule}`, background:C.bg1, fontFamily:SN, fontSize:13, color:C.ink, outline:'none', boxSizing:'border-box', transition:'border .12s' }}
                  onFocus={e => e.target.style.borderColor=C.verm}
                  onBlur={e => e.target.style.borderColor=C.rule}
                />
              </div>
            ))}

            {err && <p style={{ fontFamily:SN, fontSize:12, color:C.verm }}>{err}</p>}
            <div style={{ height:8 }} />
          </div>
        </div>

        <div style={{ padding:'12px 16px 20px', borderTop:`1px solid ${C.rule}`, background:C.bg1, flexShrink:0 }}>
          <button onPointerDown={crearPedido} disabled={!ok||creando}
            style={{ width:'100%', padding:14, borderRadius:8, border:'none', background:ok&&!creando?C.ink:C.bg3, color:ok&&!creando?C.bg:C.ink4, fontFamily:SN, fontSize:14, fontWeight:700, cursor:ok&&!creando?'pointer':'default', transition:'all .15s' }}>
            {creando ? 'Un momento…' : `Ir a pagar · ${total.toFixed(2)} €`}
          </button>
        </div>
      </div>
    )
  }

  /* ── CARTA ───────────────────────────────────────────────── */
  const secsKeys = Object.keys(secciones)

  return (
    <div style={{ minHeight:'100dvh', background:C.bg, fontFamily:SN }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        * { -webkit-tap-highlight-color:transparent; }
        button,a { touch-action:manipulation; }
        ::-webkit-scrollbar { display:none; }
      `}</style>

      {/* Header */}
      <div style={{ position:'sticky', top:0, zIndex:10, background:C.bg1, borderBottom:`1px solid ${C.rule}`, boxShadow:'0 1px 0 rgba(26,23,20,.06)' }}>
        <div style={{ maxWidth:640, margin:'0 auto', padding:'12px 16px 0' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
            {config.logo_url && (
              <img src={config.logo_url} alt="" style={{ width:40, height:40, borderRadius:10, objectFit:'cover', flexShrink:0 }} />
            )}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:SE, fontSize:18, color:C.ink, lineHeight:1.2 }}>{config.nombre_publico}</div>
              <div style={{ display:'flex', gap:8, marginTop:3, flexWrap:'wrap' }}>
                <span style={{ fontFamily:SN, fontSize:11, color:C.ink4 }}>{config.tiempo_estimado_min} min</span>
                {config.pedido_minimo_eur>0 && (
                  <><span style={{ color:C.rule }}>·</span><span style={{ fontFamily:SN, fontSize:11, color:C.ink4 }}>Mín. {config.pedido_minimo_eur} €</span></>
                )}
                {config.acepta_delivery && <><span style={{ color:C.rule }}>·</span><span style={{ fontFamily:SN, fontSize:11, color:C.gr, fontWeight:600 }}>Delivery</span></>}
                {config.acepta_recogida && <><span style={{ color:C.rule }}>·</span><span style={{ fontFamily:SN, fontSize:11, color:C.gr, fontWeight:600 }}>Recogida</span></>}
              </div>
            </div>
          </div>

          {/* Tabs secciones */}
          <div style={{ overflowX:'auto', paddingBottom:0, marginBottom:-1 }}>
            <div style={{ display:'flex', gap:0 }}>
              {secsKeys.map(sec => (
                <button key={sec} onPointerDown={() => irSec(sec)}
                  style={{ padding:'8px 12px', border:'none', background:'none', fontFamily:SN, fontSize:12, fontWeight:secActiva===sec?700:500, color:secActiva===sec?C.ink:C.ink3, borderBottom:secActiva===sec?`2px solid ${C.verm}`:'2px solid transparent', cursor:'pointer', whiteSpace:'nowrap', marginBottom:-1, transition:'all .12s' }}>
                  {sec.charAt(0).toUpperCase()+sec.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Lista productos */}
      <div style={{ maxWidth:640, margin:'0 auto', padding:'16px 16px 120px' }}>
        {secsKeys.map(sec => (
          <div key={sec} id={`sec-${sec}`} ref={el => { secRefs.current[sec]=el }} style={{ marginBottom:24 }}>
            <div style={{ fontFamily:SN, fontSize:11, fontWeight:700, color:C.ink3, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8 }}>
              {sec}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:0, background:C.bg1, border:`1px solid ${C.rule}`, borderRadius:10, overflow:'hidden' }}>
              {(secciones[sec]??[]).map((p,i,arr) => {
                const en = carrito.find(i => i.producto.id===p.id)
                return (
                  <div key={p.id}
                    style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderBottom:i<arr.length-1?`1px solid ${C.rule}`:'none' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontFamily:SN, fontSize:13, fontWeight:600, color:C.ink, lineHeight:1.3 }}>{p.nombre}</div>
                      {p.descripcion && (
                        <div style={{ fontFamily:SN, fontSize:11, color:C.ink3, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.descripcion}</div>
                      )}
                      {p.alergenos&&p.alergenos.length>0 && (
                        <div style={{ fontFamily:SN, fontSize:10, color:C.amb, marginTop:2 }}>{p.alergenos.join(' · ')}</div>
                      )}
                      <div style={{ fontFamily:SM, fontSize:12, color:C.ink3, marginTop:4 }}>{p.precio.toFixed(2)} €</div>
                    </div>
                    <div style={{ flexShrink:0 }}>
                      {en ? (
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <button onPointerDown={() => cambiar(p.id,-1)}
                            style={{ width:28, height:28, borderRadius:'50%', border:`1px solid ${C.rule}`, background:'transparent', color:C.ink, fontSize:16, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>
                            −
                          </button>
                          <span style={{ fontFamily:SM, fontSize:13, fontWeight:700, color:C.ink, minWidth:16, textAlign:'center' }}>{en.cantidad}</span>
                          <button onPointerDown={() => cambiar(p.id,1)}
                            style={{ width:28, height:28, borderRadius:'50%', border:'none', background:C.verm, color:C.bg, fontSize:16, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>
                            +
                          </button>
                        </div>
                      ) : (
                        <button onPointerDown={() => añadir(p)}
                          style={{ width:32, height:32, borderRadius:8, border:'none', background:C.ink, color:C.bg, fontSize:20, fontWeight:300, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>
                          +
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Botón carrito flotante */}
      {uds>0 && !drawer && (
        <div style={{ position:'fixed', bottom:20, left:0, right:0, display:'flex', justifyContent:'center', padding:'0 16px', zIndex:30 }}>
          <button onPointerDown={() => setDrawer(true)}
            style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 20px', borderRadius:10, border:'none', background:C.ink, color:C.bg, fontFamily:SN, fontSize:14, fontWeight:700, cursor:'pointer', width:'100%', maxWidth:480, boxShadow:'0 4px 20px rgba(26,23,20,.25)' }}>
            <span style={{ background:C.verm, color:C.bg, borderRadius:999, padding:'1px 8px', fontFamily:SM, fontSize:11, fontWeight:700 }}>{uds}</span>
            <span style={{ flex:1, textAlign:'center' }}>Ver mi pedido</span>
            <span style={{ fontFamily:SM, fontSize:13 }}>{total.toFixed(2)} €</span>
          </button>
        </div>
      )}

      {/* Drawer carrito */}
      {drawer && (
        <>
          <div onPointerDown={() => setDrawer(false)}
            style={{ position:'fixed', inset:0, background:'rgba(26,23,20,.55)', zIndex:40 }} />
          <div style={{ position:'fixed', bottom:0, left:0, right:0, zIndex:50, background:C.bg1, borderRadius:'14px 14px 0 0', boxShadow:'0 -4px 24px rgba(26,23,20,.18)', display:'flex', flexDirection:'column', maxHeight:'78dvh' }}>
            {/* Handle */}
            <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 6px' }}>
              <div style={{ width:36, height:4, borderRadius:99, background:C.rule }} />
            </div>
            {/* Título */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 16px 12px', borderBottom:`1px solid ${C.rule}`, flexShrink:0 }}>
              <span style={{ fontFamily:SE, fontSize:18, color:C.ink }}>Tu pedido</span>
              <button onPointerDown={() => setDrawer(false)}
                style={{ border:`1px solid ${C.rule}`, background:'none', borderRadius:6, padding:'4px 10px', fontFamily:SN, fontSize:12, color:C.ink3, cursor:'pointer' }}>
                Cerrar
              </button>
            </div>

            {/* Items */}
            <div style={{ flex:1, overflowY:'auto', padding:'8px 16px' }}>
              {carrito.map(item => (
                <div key={item.producto.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:`1px solid ${C.rule}` }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:SN, fontSize:13, fontWeight:600, color:C.ink }}>{item.producto.nombre}</div>
                    <div style={{ fontFamily:SM, fontSize:11, color:C.ink4, marginTop:2 }}>{item.producto.precio.toFixed(2)} € / ud.</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <button onPointerDown={() => cambiar(item.producto.id,-1)}
                      style={{ width:26, height:26, borderRadius:'50%', border:`1px solid ${C.rule}`, background:'transparent', color:C.ink, fontSize:14, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      −
                    </button>
                    <span style={{ fontFamily:SM, fontSize:12, fontWeight:700, color:C.ink, minWidth:14, textAlign:'center' }}>{item.cantidad}</span>
                    <button onPointerDown={() => cambiar(item.producto.id,1)}
                      style={{ width:26, height:26, borderRadius:'50%', border:'none', background:C.verm, color:C.bg, fontSize:14, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      +
                    </button>
                  </div>
                  <span style={{ fontFamily:SM, fontSize:12, fontWeight:700, color:C.ink, minWidth:52, textAlign:'right' }}>{(item.producto.precio*item.cantidad).toFixed(2)} €</span>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ padding:'12px 16px 28px', borderTop:`1px solid ${C.rule}`, flexShrink:0 }}>
              {config.pedido_minimo_eur>0 && total<config.pedido_minimo_eur && (
                <div style={{ fontFamily:SN, fontSize:11, color:C.amb, background:C.ambS, borderRadius:6, padding:'6px 10px', marginBottom:10, textAlign:'center' }}>
                  Pedido mínimo {config.pedido_minimo_eur} € · Faltan {(config.pedido_minimo_eur-total).toFixed(2)} €
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
                <span style={{ fontFamily:SN, fontSize:14, fontWeight:700, color:C.ink }}>Total</span>
                <span style={{ fontFamily:SM, fontSize:14, fontWeight:700, color:C.verm }}>{total.toFixed(2)} €</span>
              </div>
              <button
                onPointerDown={() => { setDrawer(false); setVista('datos') }}
                disabled={total<(config.pedido_minimo_eur??0)}
                style={{ width:'100%', padding:14, borderRadius:8, border:'none', background:total>=(config.pedido_minimo_eur??0)?C.ink:C.bg3, color:total>=(config.pedido_minimo_eur??0)?C.bg:C.ink4, fontFamily:SN, fontSize:14, fontWeight:700, cursor:total>=(config.pedido_minimo_eur??0)?'pointer':'default', transition:'background .15s' }}>
                Pedir ahora · {total.toFixed(2)} €
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

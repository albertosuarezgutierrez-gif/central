'use client'
import { C, SE, SN, SM, SC } from '@/lib/colors'

import { useEffect, useState, useCallback } from 'react'


interface Producto { id:string; nombre:string; precio:number; seccion:string }
interface CartItem  { producto:Producto; cantidad:number; notas?:string }
interface Session   { id:string; nombre:string; rol:string; restaurante_id:string }

type Canal    = 'telefono'|'mostrador'
type TipoPed  = 'delivery'|'recogida'
type Cobro    = 'efectivo'|'tarjeta'|'contraentrega'
type Paso     = 'canal'|'cliente'|'carta'|'confirmar'|'enviado'

export default function PedidoRapidoApp() {
  const [session, setSession]   = useState<Session|null>(null)
  const [productos, setProds]   = useState<Producto[]>([])
  const [secciones, setSecs]    = useState<Record<string,Producto[]>>({})
  const [carrito, setCarrito]   = useState<CartItem[]>([])
  const [secActiva, setSec]     = useState('')
  const [busqueda, setBusq]     = useState('')
  const [paso, setPaso]         = useState<Paso>('canal')
  const [canal, setCanal]       = useState<Canal>('telefono')
  const [tipo, setTipo]         = useState<TipoPed>('delivery')
  const [cobro, setCobro]       = useState<Cobro>('contraentrega')
  const [nombre, setNombre]     = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDir]     = useState('')
  const [notas, setNotas]       = useState('')
  const [tiempoMin, setTiempo]  = useState(30)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResult]  = useState<{numero:number;tiempo:number}|null>(null)
  const [err, setErr]           = useState('')

  useEffect(() => {
    try { const r = localStorage.getItem('ia_session'); if(r) setSession(JSON.parse(r)) } catch{}
  }, [])

  useEffect(() => {
    if (!session) return
    const h = { 'x-ia-session': JSON.stringify(session) }
    fetch('/api/owner/productos', { headers:h })
      .then(r => r.json())
      .then(d => {
        const prods = (d.productos ?? []) as Producto[]
        setProds(prods)
        const secs:Record<string,Producto[]> = {}
        for (const p of prods) { const s = p.seccion||'Otros'; if(!secs[s]) secs[s]=[]; secs[s]!.push(p) }
        setSecs(secs)
        setSec(Object.keys(secs)[0]??'')
      })
  }, [session])

  const total = carrito.reduce((a,i) => a+i.producto.precio*i.cantidad, 0)
  const uds   = carrito.reduce((a,i) => a+i.cantidad, 0)

  const añadir = useCallback((p:Producto) => {
    setCarrito(prev => {
      const ex = prev.find(i => i.producto.id===p.id)
      return ex ? prev.map(i => i.producto.id===p.id ? {...i,cantidad:i.cantidad+1} : i)
                : [...prev, {producto:p, cantidad:1}]
    })
  }, [])
  const cambiar = useCallback((id:string, d:number) => {
    setCarrito(prev => prev.map(i => i.producto.id===id ? {...i,cantidad:i.cantidad+d} : i).filter(i => i.cantidad>0))
  }, [])

  const filtrados = busqueda.trim()
    ? productos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : (secciones[secActiva]??[])

  const enviar = async () => {
    if (!session || !carrito.length) return
    setEnviando(true); setErr('')
    const res = await fetch('/api/storefront/pedido-operador', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'x-ia-session':JSON.stringify(session) },
      body: JSON.stringify({ canal, tipo, cobro,
        cliente_nombre: nombre.trim()||'Cliente',
        cliente_telefono: telefono.trim()||'',
        cliente_direccion: tipo==='delivery'?direccion.trim():null,
        cliente_notas: notas.trim()||null,
        tiempo_recogida_min: tiempoMin,
        items: carrito.map(i => ({ producto_id:i.producto.id, nombre:i.producto.nombre, cantidad:i.cantidad, precio_unitario:i.producto.precio, notas:i.notas??null })),
      }),
    })
    const d = await res.json()
    setEnviando(false)
    if (d.error) { setErr(d.error); return }
    setResult({ numero:d.numero, tiempo:d.tiempo_recogida_min })
    setPaso('enviado')
  }

  const resetear = () => { setCarrito([]); setNombre(''); setTelefono(''); setDir(''); setNotas(''); setResult(null); setErr(''); setPaso('canal') }

  if (!session) return (
    <div style={{ minHeight:'100dvh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <p style={{ fontFamily:SN, fontSize:13, color:C.ink3 }}>Inicia sesión primero</p>
    </div>
  )

  /* ── ENVIADO ─────────────────────────────────────────────── */
  if (paso==='enviado' && resultado) return (
    <div style={{ minHeight:'100dvh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24, fontFamily:SN }}>
      <div style={{ maxWidth:360, width:'100%', textAlign:'center' }}>
        <div style={{ width:56, height:56, borderRadius:'50%', border:`2px solid ${C.gr}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:C.gr, margin:'0 auto 20px' }}>✓</div>
        <div style={{ fontFamily:SE, fontSize:24, color:C.ink, marginBottom:8 }}>Pedido #{resultado.numero}</div>
        <div style={{ background:C.bg1, border:`1px solid ${C.rule}`, borderRadius:10, padding:'14px 16px', marginBottom:20, textAlign:'left' }}>
          <div style={{ fontFamily:SN, fontSize:11, color:C.ink4, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>
            {canal==='telefono'?'Teléfono':'Mostrador'} · {tipo==='delivery'?'Delivery':'Recogida'}
          </div>
          <div style={{ fontFamily:SN, fontSize:14, fontWeight:600, color:C.ink, marginBottom:2 }}>{nombre||'Cliente'}</div>
          {telefono && <div style={{ fontFamily:SM, fontSize:12, color:C.ink3 }}>{telefono}</div>}
          {tipo==='delivery'&&direccion && <div style={{ fontFamily:SN, fontSize:12, color:C.ink2, marginTop:4 }}>{direccion}</div>}
          <div style={{ fontFamily:SM, fontSize:12, color:C.amb, marginTop:8, fontWeight:700 }}>⏱ {resultado.tiempo} min · {total.toFixed(2)} €</div>
          <div style={{ fontFamily:SN, fontSize:11, color:C.ink4, marginTop:4, textTransform:'capitalize' }}>{cobro==='contraentrega'?'Al entregar':cobro}</div>
        </div>
        <button onPointerDown={resetear}
          style={{ width:'100%', padding:13, borderRadius:8, border:'none', background:C.ink, color:C.bg, fontFamily:SN, fontSize:14, fontWeight:700, cursor:'pointer' }}>
          Nuevo pedido
        </button>
      </div>
    </div>
  )

  /* ── PASO 1: CANAL ───────────────────────────────────────── */
  if (paso==='canal') return (
    <div style={{ minHeight:'100dvh', background:C.bg, padding:'28px 16px', display:'flex', flexDirection:'column', fontFamily:SN }}>
      <style>{`* { -webkit-tap-highlight-color:transparent; } button,a { touch-action:manipulation; }`}</style>
      <div style={{ fontFamily:SE, fontSize:22, color:C.ink, marginBottom:4 }}>Nuevo pedido</div>
      <div style={{ fontFamily:SN, fontSize:13, color:C.ink3, marginBottom:24 }}>¿Cómo llega este pedido?</div>

      <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:24 }}>
        {([
          { key:'telefono', icon:'📞', label:'Por teléfono', desc:'El cliente ha llamado' },
          { key:'mostrador', icon:'🏪', label:'En mostrador', desc:'El cliente está aquí' },
        ] as const).map(opt => (
          <button key={opt.key} onPointerDown={() => {
            setCanal(opt.key)
            if(opt.key==='mostrador'){setTipo('recogida');setCobro('efectivo');setTiempo(15)}
            else{setTipo('delivery');setCobro('contraentrega');setTiempo(30)}
          }}
            style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:10, border:`1.5px solid ${canal===opt.key?C.verm:C.rule}`, background:canal===opt.key?C.vermS:C.bg1, cursor:'pointer', textAlign:'left' }}>
            <span style={{ fontSize:28 }}>{opt.icon}</span>
            <div>
              <div style={{ fontFamily:SN, fontSize:14, fontWeight:600, color:C.ink }}>{opt.label}</div>
              <div style={{ fontFamily:SN, fontSize:12, color:C.ink3, marginTop:1 }}>{opt.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {canal==='telefono' && (
        <div style={{ marginBottom:24 }}>
          <div style={{ fontFamily:SN, fontSize:11, fontWeight:600, color:C.ink3, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>¿Delivery o recogida?</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {(['delivery','recogida'] as const).map(t => (
              <button key={t} onPointerDown={() => { setTipo(t); setCobro(t==='delivery'?'contraentrega':'efectivo') }}
                style={{ padding:'11px 0', borderRadius:8, border:`1.5px solid ${tipo===t?C.verm:C.rule}`, background:tipo===t?C.vermS:'transparent', color:tipo===t?C.verm:C.ink3, fontFamily:SN, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                {t==='delivery'?'Delivery':'Recogida'}
              </button>
            ))}
          </div>
        </div>
      )}

      <button onPointerDown={() => setPaso('cliente')} style={{ width:'100%', padding:13, borderRadius:8, border:'none', background:C.ink, color:C.bg, fontFamily:SN, fontSize:14, fontWeight:700, cursor:'pointer', marginTop:'auto' }}>
        Continuar →
      </button>
    </div>
  )

  /* ── PASO 2: DATOS ───────────────────────────────────────── */
  if (paso==='cliente') return (
    <div style={{ minHeight:'100dvh', background:C.bg, display:'flex', flexDirection:'column', fontFamily:SN }}>
      <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.rule}`, background:C.bg1, display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        <button onPointerDown={() => setPaso('canal')} style={{ border:'none', background:'none', fontFamily:SN, fontSize:13, color:C.ink3, cursor:'pointer', padding:'4px 0' }}>← Volver</button>
        <span style={{ fontFamily:SE, fontSize:16, color:C.ink }}>Datos del cliente</span>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'16px 16px 0' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:480 }}>
          {[
            { label:`Nombre${canal==='mostrador'?' (opcional)':''}`, val:nombre, set:setNombre, ph:'Nombre completo', type:'text' },
            { label:`Teléfono${canal==='mostrador'?' (opcional)':''}`, val:telefono, set:setTelefono, ph:'600 000 000', type:'tel' },
            ...(tipo==='delivery'?[{ label:'Dirección de entrega', val:direccion, set:setDir, ph:'Calle, número, piso', type:'text' }]:[]),
            { label:'Notas (opcional)', val:notas, set:setNotas, ph:'Sin cebolla, alérgenos…', type:'text' },
          ].map(f => (
            <div key={f.label}>
              <label style={{ display:'block', fontFamily:SN, fontSize:11, fontWeight:600, color:C.ink3, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>{f.label}</label>
              <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                style={{ width:'100%', padding:'11px 12px', borderRadius:8, border:`1px solid ${C.rule}`, background:C.bg1, fontFamily:SN, fontSize:13, color:C.ink, outline:'none', boxSizing:'border-box' }}
                onFocus={e=>e.target.style.borderColor=C.verm} onBlur={e=>e.target.style.borderColor=C.rule} />
            </div>
          ))}

          {/* Tiempo estimado */}
          <div>
            <label style={{ display:'block', fontFamily:SN, fontSize:11, fontWeight:600, color:C.ink3, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>
              Tiempo estimado: <span style={{ color:C.verm }}>{tiempoMin} min</span>
            </label>
            <div style={{ display:'flex', gap:6 }}>
              {(canal==='mostrador'?[10,15,20,30]:tipo==='delivery'?[25,30,40,50,60]:[10,15,20,25]).map(t => (
                <button key={t} onPointerDown={() => setTiempo(t)}
                  style={{ flex:1, padding:'8px 0', borderRadius:8, border:`1.5px solid ${tiempoMin===t?C.verm:C.rule}`, background:tiempoMin===t?C.verm:'transparent', color:tiempoMin===t?C.bg:C.ink3, fontFamily:SM, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  {t}'
                </button>
              ))}
            </div>
          </div>

          {/* Cobro */}
          <div>
            <label style={{ display:'block', fontFamily:SN, fontSize:11, fontWeight:600, color:C.ink3, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>Forma de cobro</label>
            <div style={{ display:'flex', gap:6 }}>
              {(tipo==='delivery'?['contraentrega','efectivo','tarjeta']:['efectivo','tarjeta']).map(c => (
                <button key={c} onPointerDown={() => setCobro(c as Cobro)}
                  style={{ flex:1, padding:'8px 0', borderRadius:8, border:`1.5px solid ${cobro===c?C.verm:C.rule}`, background:cobro===c?C.vermS:'transparent', color:cobro===c?C.verm:C.ink3, fontFamily:SN, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  {c==='contraentrega'?'Al entregar':c.charAt(0).toUpperCase()+c.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div style={{ padding:'12px 16px 20px', borderTop:`1px solid ${C.rule}`, background:C.bg1, flexShrink:0 }}>
        <button onPointerDown={() => setPaso('carta')}
          style={{ width:'100%', padding:13, borderRadius:8, border:'none', background:C.ink, color:C.bg, fontFamily:SN, fontSize:14, fontWeight:700, cursor:'pointer' }}>
          Elegir productos →
        </button>
      </div>
    </div>
  )

  /* ── PASO 3: CARTA ───────────────────────────────────────── */
  if (paso==='carta') {
    const secsKeys = Object.keys(secciones)
    return (
      <div style={{ minHeight:'100dvh', background:C.bg, display:'flex', flexDirection:'column', fontFamily:SN }}>
        <div style={{ position:'sticky', top:0, zIndex:10, background:C.bg1, borderBottom:`1px solid ${C.rule}` }}>
          <div style={{ padding:'12px 16px 0', display:'flex', alignItems:'center', gap:10 }}>
            <button onPointerDown={() => setPaso('cliente')} style={{ border:'none', background:'none', fontFamily:SN, fontSize:13, color:C.ink3, cursor:'pointer', padding:'4px 0', flexShrink:0 }}>← Volver</button>
            <span style={{ fontFamily:SE, fontSize:16, color:C.ink, flex:1 }}>{nombre||canal==='mostrador'?'Mostrador':'Teléfono'}</span>
            {uds>0 && <span style={{ background:C.verm, color:C.bg, borderRadius:999, padding:'1px 8px', fontFamily:SM, fontSize:10, fontWeight:700 }}>{uds}</span>}
          </div>
          <div style={{ padding:'8px 16px 6px' }}>
            <input value={busqueda} onChange={e => setBusq(e.target.value)} placeholder="Buscar…"
              style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${C.rule}`, background:C.bg, fontFamily:SN, fontSize:13, color:C.ink, outline:'none', boxSizing:'border-box' }}
              onFocus={e=>e.target.style.borderColor=C.verm} onBlur={e=>e.target.style.borderColor=C.rule} />
          </div>
          {!busqueda && (
            <div style={{ overflowX:'auto', padding:'0 16px', display:'flex', gap:0, marginBottom:-1 }}>
              {secsKeys.map(sec => (
                <button key={sec} onPointerDown={() => setSec(sec)}
                  style={{ padding:'8px 12px', border:'none', background:'none', fontFamily:SN, fontSize:12, fontWeight:secActiva===sec?700:500, color:secActiva===sec?C.ink:C.ink3, borderBottom:secActiva===sec?`2px solid ${C.verm}`:'2px solid transparent', cursor:'pointer', whiteSpace:'nowrap', marginBottom:-1, transition:'all .12s' }}>
                  {sec.charAt(0).toUpperCase()+sec.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'12px 16px 120px' }}>
          <div style={{ background:C.bg1, border:`1px solid ${C.rule}`, borderRadius:10, overflow:'hidden' }}>
            {filtrados.map((p,i) => {
              const en = carrito.find(i => i.producto.id===p.id)
              return (
                <div key={p.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', borderBottom:i<filtrados.length-1?`1px solid ${C.rule}`:'none' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:SN, fontSize:13, fontWeight:600, color:C.ink }}>{p.nombre}</div>
                    <div style={{ fontFamily:SM, fontSize:11, color:C.ink3, marginTop:2 }}>{p.precio.toFixed(2)} €</div>
                  </div>
                  <div style={{ flexShrink:0, display:'flex', alignItems:'center', gap:7 }}>
                    {en ? (
                      <>
                        <button onPointerDown={() => cambiar(p.id,-1)} style={{ width:26,height:26,borderRadius:'50%',border:`1px solid ${C.rule}`,background:'transparent',color:C.ink,fontSize:14,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>−</button>
                        <span style={{ fontFamily:SM, fontSize:12, fontWeight:700, color:C.ink, minWidth:16, textAlign:'center' }}>{en.cantidad}</span>
                        <button onPointerDown={() => cambiar(p.id,1)} style={{ width:26,height:26,borderRadius:'50%',border:'none',background:C.verm,color:C.bg,fontSize:14,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>+</button>
                      </>
                    ) : (
                      <button onPointerDown={() => añadir(p)} style={{ width:30,height:30,borderRadius:8,border:'none',background:C.ink,color:C.bg,fontSize:18,fontWeight:300,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>+</button>
                    )}
                  </div>
                </div>
              )
            })}
            {filtrados.length===0 && busqueda && (
              <div style={{ padding:'24px 16px', fontFamily:SE, fontSize:13, color:C.ink3, fontStyle:'italic', textAlign:'center' }}>Sin resultados</div>
            )}
          </div>
        </div>

        {uds>0 && (
          <div style={{ position:'fixed', bottom:0, left:0, right:0, padding:'10px 16px 20px', background:C.bg1, borderTop:`1px solid ${C.rule}` }}>
            <button onPointerDown={() => setPaso('confirmar')}
              style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderRadius:8, border:'none', background:C.ink, color:C.bg, fontFamily:SN, fontSize:14, fontWeight:700, cursor:'pointer' }}>
              <span style={{ background:C.verm, borderRadius:999, padding:'1px 8px', fontFamily:SM, fontSize:11 }}>{uds}</span>
              <span>Confirmar pedido</span>
              <span style={{ fontFamily:SM, fontSize:13 }}>{total.toFixed(2)} €</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  /* ── PASO 4: CONFIRMAR ───────────────────────────────────── */
  return (
    <div style={{ minHeight:'100dvh', background:C.bg, display:'flex', flexDirection:'column', fontFamily:SN }}>
      <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.rule}`, background:C.bg1, display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        <button onPointerDown={() => setPaso('carta')} style={{ border:'none', background:'none', fontFamily:SN, fontSize:13, color:C.ink3, cursor:'pointer', padding:'4px 0' }}>← Editar</button>
        <span style={{ fontFamily:SE, fontSize:16, color:C.ink }}>Confirmar pedido</span>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'16px 16px 0' }}>
        <div style={{ maxWidth:480, display:'flex', flexDirection:'column', gap:12 }}>
          {/* Resumen cliente */}
          <div style={{ background:C.bg1, border:`1px solid ${C.rule}`, borderRadius:10, padding:'14px 16px' }}>
            <div style={{ fontFamily:SN, fontSize:11, color:C.ink4, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>
              {canal==='telefono'?'📞 Teléfono':'🏪 Mostrador'} · {tipo==='delivery'?'Delivery':'Recogida'}
            </div>
            <div style={{ fontFamily:SN, fontSize:14, fontWeight:600, color:C.ink }}>{nombre||'Cliente'}</div>
            {telefono && <div style={{ fontFamily:SM, fontSize:12, color:C.ink3, marginTop:2 }}>{telefono}</div>}
            {tipo==='delivery'&&direccion && <div style={{ fontFamily:SN, fontSize:12, color:C.ink2, marginTop:4 }}>{direccion}</div>}
            {notas && <div style={{ fontFamily:SN, fontSize:12, color:C.amb, marginTop:4 }}>Nota: {notas}</div>}
            <div style={{ display:'flex', gap:8, marginTop:10 }}>
              <span style={{ fontFamily:SM, fontSize:11, color:C.ink3, background:C.bg2, borderRadius:6, padding:'3px 8px' }}>⏱ {tiempoMin} min</span>
              <span style={{ fontFamily:SN, fontSize:11, color:C.ink3, background:C.bg2, borderRadius:6, padding:'3px 8px', textTransform:'capitalize' }}>{cobro==='contraentrega'?'Al entregar':cobro}</span>
            </div>
          </div>

          {/* Items */}
          <div style={{ background:C.bg1, border:`1px solid ${C.rule}`, borderRadius:10, overflow:'hidden' }}>
            {carrito.map((item,i) => (
              <div key={item.producto.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', borderBottom:i<carrito.length-1?`1px solid ${C.rule}`:'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontFamily:SM, fontSize:11, color:C.ink4, width:20 }}>{item.cantidad}×</span>
                  <span style={{ fontFamily:SN, fontSize:13, color:C.ink2 }}>{item.producto.nombre}</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontFamily:SM, fontSize:12, color:C.ink3 }}>{(item.producto.precio*item.cantidad).toFixed(2)} €</span>
                  <button onPointerDown={() => cambiar(item.producto.id,-item.cantidad)} style={{ border:'none', background:'none', color:C.ink4, fontSize:14, cursor:'pointer', padding:'0 2px' }}>×</button>
                </div>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 14px', borderTop:`1px solid ${C.rule}` }}>
              <span style={{ fontFamily:SN, fontSize:13, fontWeight:700, color:C.ink }}>Total</span>
              <span style={{ fontFamily:SM, fontSize:13, fontWeight:700, color:C.verm }}>{total.toFixed(2)} €</span>
            </div>
          </div>

          {err && <p style={{ fontFamily:SN, fontSize:12, color:C.verm }}>{err}</p>}
        </div>
      </div>

      <div style={{ padding:'12px 16px 20px', borderTop:`1px solid ${C.rule}`, background:C.bg1, flexShrink:0 }}>
        <button onPointerDown={enviar} disabled={enviando}
          style={{ width:'100%', padding:13, borderRadius:8, border:'none', background:enviando?C.bg3:C.verm, color:enviando?C.ink4:C.bg, fontFamily:SN, fontSize:14, fontWeight:700, cursor:enviando?'default':'pointer', transition:'background .15s' }}>
          {enviando ? 'Enviando a cocina…' : 'Enviar a cocina'}
        </button>
      </div>
    </div>
  )
}

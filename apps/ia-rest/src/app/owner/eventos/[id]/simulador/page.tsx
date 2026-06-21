'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'

const C = { dark:'#14110E', bg2:'#1E1A15', bg3:'#2A221A', paper:'#F6F1E7', ink2:'#D8CDB6', ink3:'#9C8E7E', ink4:'#6B5F52', red:'#D9442B', amber:'#E8A33B', green:'#3F7D44', rule:'#2E2720' }

interface StockItem { producto_id: string; nombre: string; categoria: string; stock_necesario: number; stock_disponible: number; nodo_suministro: string; suficiente: boolean }
interface Transferencia { producto_id: string; nombre: string; cantidad_necesaria: number; accion: string }

export default function SimuladorEventoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [stock, setStock] = useState<StockItem[]>([])
  const [transferencias, setTransferencias] = useState<Transferencia[]>([])
  const [resumen, setResumen] = useState<{ total:number; ok:number; insuficientes:number; bloqueante:boolean } | null>(null)
  const [calculando, setCalculando] = useState(true)
  const [menus, setMenus] = useState<Array<{ id: string; nombre: string }>>([])
  const [menuSel, setMenuSel] = useState('')
  const [adultos, setAdultos] = useState(50)
  const [ninos, setNinos] = useState(0)

  const calcular = useCallback(async () => {
    setCalculando(true)
    try {
      const r = await fetch(`/api/owner/eventos/${id}/stock-check`)
      const d = await r.json()
      setStock(d.stock || [])
      setResumen(d.resumen || null)
      setTransferencias(d.transferencias_necesarias || [])
    } finally { setCalculando(false) }
  }, [id])

  useEffect(() => { calcular() }, [calcular])
  useEffect(() => {
    fetch('/api/owner/eventos/menus').then(r => r.json()).then(d => setMenus(d.menus || []))
  }, [])

  const sh = (s: React.CSSProperties) => s
  const fmt = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 })

  return (
    <div style={sh({ minHeight:'100vh', background:C.dark, fontFamily:'Inter Tight, sans-serif' })}>
      <div style={sh({ background:C.bg2, borderBottom:`1px solid ${C.rule}`, padding:'1rem 1.5rem', display:'flex', alignItems:'center', gap:'1rem' })}>
        <button onClick={() => router.back()} style={sh({ background:'transparent', border:'none', color:C.ink2, cursor:'pointer', fontSize:'1.2rem' })}>←</button>
        <div>
          <div style={sh({ color:C.paper, fontWeight:700 })}>Simulador pre-evento</div>
          <div style={sh({ color:C.ink3, fontSize:'0.78rem' })}>Stock disponible y rentabilidad</div>
        </div>
        <button onClick={calcular} style={sh({ marginLeft:'auto', padding:'0.5rem 0.9rem', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:7, color:C.ink2, cursor:'pointer', fontSize:'0.82rem' })}>
          🔄 Recalcular
        </button>
      </div>

      <div style={sh({ padding:'1.25rem 1.5rem' })}>

        {/* Configurar evento para simulación */}
        <div style={sh({ background:C.bg2, borderRadius:10, padding:'1rem', marginBottom:'1.25rem', border:`1px solid ${C.rule}` })}>
          <div style={sh({ color:C.ink3, fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.75rem' })}>Parámetros del evento</div>
          <div style={sh({ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap:'0.75rem' })}>
            <div>
              <label style={sh({ display:'block', color:C.ink2, fontSize:'0.82rem', marginBottom:'0.3rem' })}>Adultos</label>
              <input type="number" min={0} value={adultos} onChange={e => setAdultos(parseInt(e.target.value)||0)}
                style={sh({ width:'100%', padding:'0.6rem', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:7, color:C.paper, fontSize:'1rem', boxSizing:'border-box' })} />
            </div>
            <div>
              <label style={sh({ display:'block', color:C.ink2, fontSize:'0.82rem', marginBottom:'0.3rem' })}>Niños</label>
              <input type="number" min={0} value={ninos} onChange={e => setNinos(parseInt(e.target.value)||0)}
                style={sh({ width:'100%', padding:'0.6rem', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:7, color:C.paper, fontSize:'1rem', boxSizing:'border-box' })} />
            </div>
            <div>
              <label style={sh({ display:'block', color:C.ink2, fontSize:'0.82rem', marginBottom:'0.3rem' })}>Menú</label>
              <select value={menuSel} onChange={e => setMenuSel(e.target.value)}
                style={sh({ width:'100%', padding:'0.6rem', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:7, color:C.paper, fontSize:'0.88rem', boxSizing:'border-box' })}>
                <option value="">— Seleccionar —</option>
                {menus.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
          </div>
          {menuSel && (
            <div style={sh({ marginTop:'0.75rem', textAlign:'right' })}>
              <a href={`/comercial/configurador?menu_id=${menuSel}&evento_id=${id}`}
                style={sh({ color:C.red, fontSize:'0.85rem', textDecoration:'none', fontWeight:600 })}>
                Abrir configurador completo →
              </a>
            </div>
          )}
        </div>

        {/* Resumen stock */}
        {resumen && (
          <div style={sh({ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(100px, 1fr))', gap:'0.75rem', marginBottom:'1.25rem' })}>
            {[
              { label:'Total artículos', val:resumen.total, color:C.ink2 },
              { label:'Stock OK', val:resumen.ok, color:C.green },
              { label:'Insuficiente', val:resumen.insuficientes, color:resumen.insuficientes > 0 ? C.amber : C.ink2 },
            ].map(k => (
              <div key={k.label} style={sh({ background:C.bg2, borderRadius:10, padding:'0.9rem', textAlign:'center', border:`1px solid ${C.rule}` })}>
                <div style={sh({ color:k.color, fontSize:'1.8rem', fontFamily:'Newsreader, serif', fontWeight:600 })}>{k.val}</div>
                <div style={sh({ color:C.ink4, fontSize:'0.72rem', marginTop:'0.2rem' })}>{k.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Alerta bloqueante */}
        {resumen?.bloqueante && (
          <div style={sh({ background:'rgba(232,163,59,0.1)', border:`1px solid ${C.amber}`, borderRadius:10, padding:'1rem', marginBottom:'1.25rem' })}>
            <div style={sh({ color:C.amber, fontWeight:700, marginBottom:'0.5rem' })}>⚠ Acciones necesarias antes del evento</div>
            {transferencias.map((t, i) => (
              <div key={i} style={sh({ color:C.ink2, fontSize:'0.88rem', padding:'0.3rem 0', borderBottom:`1px solid rgba(232,163,59,0.2)` })}>
                <span style={{ color:C.amber }}>· {t.nombre}</span>
                {' — '}necesario {fmt(t.cantidad_necesaria)} uds →
                <span style={{ color: t.accion === 'transferir_almacen' ? C.ink2 : C.red }}>
                  {' '}{t.accion === 'transferir_almacen' ? 'Transferir de almacén' : 'Pedir a proveedor'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Lista stock detallado */}
        {calculando ? (
          <div style={sh({ color:C.ink3, textAlign:'center', padding:'2rem' })}>Calculando stock...</div>
        ) : stock.length > 0 ? (
          <div style={sh({ background:C.bg2, borderRadius:10, overflow:'hidden', border:`1px solid ${C.rule}` })}>
            <div style={sh({ padding:'0.75rem 1rem', borderBottom:`1px solid ${C.rule}`, display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:'0.5rem' })}>
              {['Artículo','Necesario','Disponible','Estado'].map(h => (
                <div key={h} style={sh({ color:C.ink4, fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.04em' })}>{h}</div>
              ))}
            </div>
            {stock.map(s => (
              <div key={s.producto_id} style={sh({ padding:'0.7rem 1rem', borderBottom:`1px solid ${C.rule}`, display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:'0.5rem', alignItems:'center' })}>
                <div>
                  <div style={sh({ color:C.paper, fontSize:'0.88rem' })}>{s.nombre}</div>
                  {s.nodo_suministro && <div style={sh({ color:C.ink4, fontSize:'0.72rem' })}>{s.nodo_suministro}</div>}
                </div>
                <div style={sh({ color:C.ink2, fontSize:'0.88rem' })}>{fmt(s.stock_necesario)}</div>
                <div style={sh({ color: s.stock_disponible >= s.stock_necesario ? C.green : s.stock_disponible > 0 ? C.amber : C.red, fontSize:'0.88rem', fontWeight:600 })}>
                  {fmt(s.stock_disponible)}
                </div>
                <div style={sh({ fontSize:'0.78rem' })}>
                  {s.suficiente
                    ? <span style={{ color:C.green }}>✅ OK</span>
                    : s.stock_disponible === 0
                      ? <span style={{ color:C.red }}>⚠ Sin stock</span>
                      : <span style={{ color:C.amber }}>⚠ Parcial</span>
                  }
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={sh({ textAlign:'center', padding:'3rem', color:C.ink3 })}>
            <div style={sh({ fontSize:'2rem', marginBottom:'0.5rem' })}>📦</div>
            Sin datos de barra libre para este evento.<br/>
            Añade una barra libre al presupuesto para ver el stock necesario.
          </div>
        )}
      </div>
    </div>
  )
}

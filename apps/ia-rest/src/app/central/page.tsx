'use client'
// src/app/central/page.tsx
// Centralita del grupo — gestión completa multi-local

import { useState, useEffect, useCallback } from 'react'
import ConfigCentral from '@/components/central/ConfigCentral'
import StockCentral from '@/components/central/StockCentral'

const C = {
  bg:'#14110E', bg2:'#1C1814', bg3:'#221E1A',
  red:'#D9442B', ink:'#F6F1E7', ink2:'#D8CDB6', ink3:'#9C8E7E', ink4:'#6B5F52',
  rule:'#2E2A26', green:'#3F7D44', amber:'#E8A33B', teal:'#2B6A6E',
}
const SE = 'Newsreader, Georgia, serif'
const SN = 'Inter Tight, system-ui, sans-serif'
const SM = 'Inter Tight, system-ui, sans-serif'

type Local = { restaurante_id: string; restaurante_nombre: string; turno_abierto: boolean; comandas_activas: number; ventas_hoy: number; ventas_ayer: number; stock_critico: number; elaboraciones_criticas: number; docs_revision: number }
type Resumen = { total_locales: number; abiertos: number; cerrados: number; ventas_hoy: number; ventas_ayer: number; comandas_activas: number; stock_critico: number; elaboraciones_criticas: number; docs_revision: number }
type GPoint = { fecha: string; total: number }

const eur = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)
const pct = (h: number, a: number) => !a ? null : { v: Math.round(((h-a)/a)*100), pos: h >= a }

function MiniBar({ g }: { g: GPoint[] }) {
  const max = Math.max(...g.map(x => x.total), 1)
  return (
    <div style={{ display:'flex', gap:3, alignItems:'flex-end', height:36 }}>
      {g.map((p,i) => (
        <div key={p.fecha} title={`${p.fecha}: ${eur(p.total)}`} style={{
          flex:1, borderRadius:'2px 2px 0 0',
          height:`${Math.max(8,(p.total/max)*100)}%`,
          background: i===g.length-1 ? C.green : `${C.ink4}55`,
        }}/>
      ))}
    </div>
  )
}

export default function CentralPage() {
  const [pin,setPin]         = useState('')
  const [authed,setAuthed]   = useState(false)
  const [session,setSession] = useState<{cuenta_id:string;nombre:string}|null>(null)
  const [loading,setLoading] = useState(false)
  const [err,setErr]         = useState('')
  const [resumen,setResumen] = useState<Resumen|null>(null)
  const [locales,setLocales] = useState<Local[]>([])
  const [grafica,setGrafica] = useState<GPoint[]>([])
  const [tab,setTab]         = useState<'resumen'|'locales'|'almacen'|'configuracion'>('resumen')
  const [filtro,setFiltro]   = useState<'todos'|'abiertos'|'alertas'>('todos')
  const [refreshing,setRefreshing] = useState(false)

  const sh = useCallback(() => ({
    'Content-Type':'application/json',
    'x-ia-session': JSON.stringify({ cuenta_id: session?.cuenta_id, rol: 'gestor' }),
  }), [session])

  const cargar = useCallback(async () => {
    if (!session) return
    setRefreshing(true)
    try {
      const [rs,rv] = await Promise.all([
        fetch('/api/portal?action=stats',  { headers: sh() }),
        fetch('/api/portal?action=ventas', { headers: sh() }),
      ])
      const ds = await rs.json(); const dv = await rv.json()
      if (ds.resumen) setResumen(ds.resumen)
      if (ds.locales) setLocales(ds.locales)
      if (dv.grafica) setGrafica(dv.grafica)
    } finally { setRefreshing(false) }
  }, [session, sh])

  useEffect(() => { if (authed) cargar() }, [authed, cargar])
  useEffect(() => {
    if (!authed) return
    const iv = setInterval(cargar, 60000)
    return () => clearInterval(iv)
  }, [authed, cargar])

  const login = async () => {
    if (pin.length < 4) return
    setLoading(true); setErr('')
    try {
      const r = await fetch('/api/auth/pin-cuenta', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({pin}) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'PIN incorrecto')
      setSession({ cuenta_id: d.cuenta?.id, nombre: d.cuenta?.nombre ?? 'Central' })
      setAuthed(true)
    } catch(e) { setErr(String(e)) }
    finally { setLoading(false) }
  }

  const lF = locales.filter(l =>
    filtro==='abiertos' ? l.turno_abierto :
    filtro==='alertas'  ? l.stock_critico+l.elaboraciones_criticas+l.docs_revision>0 : true
  )

  if (!authed) return (
    <div style={{ minHeight:'100dvh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:C.bg2, border:`1px solid ${C.rule}`, borderRadius:16, padding:'40px 32px', width:'100%', maxWidth:360, textAlign:'center' }}>
        <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:36, color:C.ink, marginBottom:4 }}>ia<span style={{color:C.red}}>.</span>rest</div>
        <div style={{ fontFamily:SM, fontSize:11, color:C.ink4, letterSpacing:'.1em', textTransform:'uppercase', marginBottom:32 }}>Central de grupo</div>
        <input type="password" inputMode="numeric" placeholder="PIN de acceso" value={pin}
          onChange={e => setPin(e.target.value)} onKeyDown={e => e.key==='Enter' && login()}
          style={{ width:'100%', padding:'12px 16px', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:10, fontFamily:SN, fontSize:22, color:C.ink, textAlign:'center', outline:'none', letterSpacing:'.2em', boxSizing:'border-box', marginBottom:12 }}
          autoFocus
        />
        {err && <div style={{ fontSize:12, color:C.red, marginBottom:10 }}>{err}</div>}
        <button onClick={login} disabled={loading||pin.length<4} style={{
          width:'100%', padding:'13px', background:pin.length>=4?C.red:C.rule, border:'none', borderRadius:10,
          fontFamily:SN, fontSize:15, fontWeight:700, color:pin.length>=4?'#fff':C.ink4, cursor:pin.length>=4?'pointer':'default',
        }}>{loading ? 'Entrando…' : 'Entrar'}</button>
      </div>
    </div>
  )

  const TABS = [
    { id:'resumen',       label:'Resumen' },
    { id:'locales',       label:'Locales' },
    { id:'almacen',       label:'Almacén' },
    { id:'configuracion', label:'Configuración' },
  ] as const

  return (
    <div style={{ minHeight:'100dvh', background:C.bg, color:C.ink, fontFamily:SN }}>
      {/* Header */}
      <div style={{ padding:'14px 20px', borderBottom:`1px solid ${C.rule}`, display:'flex', alignItems:'center', justifyContent:'space-between', background:C.bg2 }}>
        <div>
          <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:18 }}>ia<span style={{color:C.red}}>.</span>rest</div>
          <div style={{ fontFamily:SM, fontSize:11, color:C.ink4 }}>{session?.nombre} · Central</div>
        </div>
        <button onClick={cargar} disabled={refreshing} style={{ background:'none', border:`1px solid ${C.rule}`, borderRadius:8, padding:'6px 12px', color:C.ink4, fontFamily:SN, fontSize:12, cursor:'pointer' }}>
          {refreshing ? '↻' : '↻ Actualizar'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:`1px solid ${C.rule}`, background:C.bg2, overflowX:'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'12px 20px', background:'none', border:'none', cursor:'pointer',
            fontFamily:SN, fontSize:13, fontWeight:tab===t.id?700:400,
            color:tab===t.id?C.ink:C.ink4, whiteSpace:'nowrap',
            borderBottom:tab===t.id?`2px solid ${C.red}`:'2px solid transparent',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding:'20px', maxWidth:800, margin:'0 auto' }}>

        {/* RESUMEN */}
        {tab === 'resumen' && resumen && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ background:C.bg3, borderRadius:12, padding:'18px' }}>
              <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink4, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:6 }}>Ventas hoy — grupo completo</div>
              <div style={{ display:'flex', alignItems:'baseline', gap:12, marginBottom:10 }}>
                <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:36, color:C.ink }}>{eur(resumen.ventas_hoy)}</div>
                {pct(resumen.ventas_hoy,resumen.ventas_ayer) && (() => { const p=pct(resumen.ventas_hoy,resumen.ventas_ayer)!; return <div style={{ fontSize:13, fontWeight:700, color:p.pos?C.green:C.red }}>{p.pos?'+':''}{p.v}% vs ayer</div> })()}
              </div>
              <MiniBar g={grafica}/>
              <div style={{ fontFamily:SM, fontSize:11, color:C.ink4, marginTop:6 }}>Ayer: {eur(resumen.ventas_ayer)} · {resumen.comandas_activas} comandas activas</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div style={{ background:C.bg3, borderRadius:12, padding:'16px' }}>
                <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink4, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8 }}>Locales abiertos</div>
                <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:32, color:C.green }}>{resumen.abiertos}</div>
                <div style={{ fontSize:12, color:C.ink4 }}>de {resumen.total_locales} locales</div>
              </div>
              <div style={{ background:resumen.stock_critico>0?'#2E1010':C.bg3, border:resumen.stock_critico>0?`1px solid ${C.red}44`:'none', borderRadius:12, padding:'16px' }}>
                <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:resumen.stock_critico>0?C.red:C.ink4, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8 }}>Alertas</div>
                {resumen.stock_critico>0 && <div style={{ fontSize:13, color:C.red, marginBottom:3 }}>📦 {resumen.stock_critico} stock crítico</div>}
                {resumen.elaboraciones_criticas>0 && <div style={{ fontSize:13, color:C.amber }}>🏷️ {resumen.elaboraciones_criticas} caducando</div>}
                {resumen.stock_critico+resumen.elaboraciones_criticas===0 && <div style={{ fontSize:13, color:C.green }}>✅ Sin alertas</div>}
              </div>
            </div>
          </div>
        )}

        {/* LOCALES */}
        {tab === 'locales' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'flex', gap:8 }}>
              {(['todos','abiertos','alertas'] as const).map(f => (
                <button key={f} onClick={() => setFiltro(f)} style={{
                  padding:'6px 14px', borderRadius:20, border:`1px solid ${filtro===f?C.teal:C.rule}`,
                  background:filtro===f?C.teal:'transparent', color:filtro===f?'#fff':C.ink3,
                  fontFamily:SN, fontSize:12, cursor:'pointer', textTransform:'capitalize',
                }}>{f}</button>
              ))}
            </div>
            {lF.map(l => {
              const p = pct(l.ventas_hoy, l.ventas_ayer)
              const alertas = l.stock_critico+l.elaboraciones_criticas+l.docs_revision>0
              return (
                <div key={l.restaurante_id} style={{ background:alertas?'#1E1210':C.bg3, border:`1px solid ${alertas?C.red+'44':C.rule}`, borderRadius:12, padding:'14px 16px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:alertas?8:0 }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:C.ink, marginBottom:3 }}>{l.restaurante_nombre}</div>
                      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                        <span style={{ width:7, height:7, borderRadius:'50%', background:l.turno_abierto?C.green:C.ink4, display:'inline-block' }}/>
                        <span style={{ fontSize:11, color:C.ink4 }}>{l.turno_abierto?'Abierto':'Cerrado'}</span>
                        {l.comandas_activas>0 && <span style={{ fontSize:11, color:C.amber }}>· {l.comandas_activas} cmd</span>}
                      </div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:22, color:C.ink }}>{eur(l.ventas_hoy)}</div>
                      {p && <div style={{ fontSize:11, color:p.pos?C.green:C.red }}>{p.pos?'+':''}{p.v}% vs ayer</div>}
                    </div>
                  </div>
                  {alertas && (
                    <div style={{ display:'flex', gap:10, paddingTop:8, borderTop:`1px solid ${C.rule}` }}>
                      {l.stock_critico>0 && <span style={{ fontSize:12, color:C.red }}>📦 {l.stock_critico}</span>}
                      {l.elaboraciones_criticas>0 && <span style={{ fontSize:12, color:C.amber }}>🏷️ {l.elaboraciones_criticas}</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ALMACÉN */}
        {tab === 'almacen' && (
          <StockCentral sh={sh} locales={locales} />
        )}

        {/* CONFIGURACIÓN */}
        {tab === 'configuracion' && (
          <ConfigCentral sh={sh} />
        )}

      </div>
    </div>
  )
}

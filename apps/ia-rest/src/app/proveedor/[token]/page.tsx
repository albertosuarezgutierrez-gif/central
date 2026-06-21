'use client'
import { useEffect, useState } from 'react'
import { C, SE, SN } from '@/lib/colors'

interface Asig { id: string; servicio_descripcion: string; hora_llegada: string | null; briefing: string | null; estado: string; confirmado_proveedor_at: string | null; evento: { nombre: string; fecha_evento: string; aforo_confirmado: number | null; hora_inicio: string | null; espacio: { nombre: string; direccion: string } | null } | null }
const TIPO_ICONO: Record<string, string> = { floristeria:'🌸', fotografia:'📸', musica_dj:'🎵', audiovisual:'🎬', finca:'🏛️', transporte:'🚐', animacion:'🎭', catering_externo:'🍽️', otro:'🤝' }

export default function PortalProveedor({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState('')
  const [proveedor, setProveedor] = useState<{ nombre: string; tipo: string } | null>(null)
  const [asignaciones, setAsignaciones] = useState<Asig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [confirmados, setConfirmados] = useState<Set<string>>(new Set())

  useEffect(() => { params.then(p => setToken(p.token)) }, [params])
  useEffect(() => {
    if (!token) return
    fetch(`/api/portal-proveedor/${token}`).then(r => r.json()).then(d => {
      if (d.error) { setError(d.error); return }
      setProveedor(d.proveedor); setAsignaciones(d.asignaciones ?? [])
      setConfirmados(new Set(d.asignaciones.filter((a: Asig) => a.confirmado_proveedor_at).map((a: Asig) => a.id)))
    }).catch(() => setError('Error de conexión')).finally(() => setLoading(false))
  }, [token])

  const confirmar = async (id: string) => {
    setConfirmando(id)
    const r = await fetch(`/api/portal-proveedor/${token}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asignacion_id: id }) })
    if (r.ok) setConfirmados(prev => new Set([...prev, id]))
    setConfirmando(null)
  }

  if (loading) return <div style={{ minHeight:'100dvh', background:C.dark, display:'flex', alignItems:'center', justifyContent:'center', color:C.ink3, fontFamily:SN }}>Cargando…</div>
  if (error) return <div style={{ minHeight:'100dvh', background:C.dark, display:'flex', alignItems:'center', justifyContent:'center', color:C.red, fontFamily:SN, padding:'2rem', textAlign:'center' }}>{error}</div>

  const proximos = asignaciones.filter(a => a.evento && new Date(a.evento.fecha_evento) >= new Date())
  const pasados  = asignaciones.filter(a => a.evento && new Date(a.evento.fecha_evento) < new Date())

  return (
    <div style={{ minHeight:'100dvh', background:C.dark, color:C.paper, fontFamily:SN }}>
      <div style={{ background:C.bg2, borderBottom:`1px solid ${C.rule}`, padding:'1.1rem 1.25rem', display:'flex', alignItems:'center', gap:'1rem' }}>
        <div style={{ width:40, height:40, borderRadius:10, background:C.red, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem' }}>{TIPO_ICONO[proveedor?.tipo ?? ''] ?? '🤝'}</div>
        <div>
          <div style={{ fontFamily:SE, fontSize:'1rem', fontWeight:600 }}>{proveedor?.nombre}</div>
          <div style={{ color:C.ink3, fontSize:'.75rem' }}>Portal de proveedor · ia.rest</div>
        </div>
      </div>
      <div style={{ padding:'1.25rem', maxWidth:600, margin:'0 auto' }}>
        {proximos.length === 0 && <div style={{ background:C.bg2, border:`1px solid ${C.rule}`, borderRadius:12, padding:'2rem', textAlign:'center', marginBottom:'1.5rem' }}><div style={{ fontSize:'2rem', marginBottom:'.5rem' }}>📅</div><div style={{ color:C.ink2 }}>Sin eventos próximos</div></div>}
        {proximos.map(a => {
          const fecha = a.evento ? new Date(a.evento.fecha_evento) : null
          const dias = fecha ? Math.ceil((fecha.getTime()-Date.now())/86400000) : null
          const conf = confirmados.has(a.id)
          return (
            <div key={a.id} style={{ background:C.bg2, border:`1px solid ${conf ? C.green : C.rule}`, borderRadius:12, padding:'1.1rem', marginBottom:'.75rem' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'.75rem' }}>
                <div>
                  <div style={{ fontFamily:SE, fontSize:'1rem', fontWeight:600 }}>{a.evento?.nombre}</div>
                  <div style={{ color:C.ink3, fontSize:'.78rem' }}>{fecha?.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'})}{a.evento?.hora_inicio ? ` · ${a.evento.hora_inicio.slice(0,5)}` : ''}</div>
                </div>
                {dias !== null && <div style={{ background:dias<=3?`${C.red}22`:`${C.amber}22`, color:dias<=3?C.red:C.amber, borderRadius:6, padding:'.2rem .55rem', fontSize:'.7rem', fontWeight:700, alignSelf:'flex-start' }}>{dias===0?'HOY':dias===1?'MAÑANA':`${dias}d`}</div>}
              </div>
              <div style={{ display:'grid', gap:'.35rem', marginBottom:'.85rem' }}>
                <Row icon="🎯" label="Servicio" val={a.servicio_descripcion} />
                {a.hora_llegada && <Row icon="🕐" label="Llegada" val={a.hora_llegada} />}
                {a.evento?.aforo_confirmado && <Row icon="👥" label="Comensales" val={`${a.evento.aforo_confirmado} personas`} />}
                {a.evento?.espacio && <Row icon="📍" label="Espacio" val={a.evento.espacio.nombre} />}
              </div>
              {a.briefing && <div style={{ background:`${C.amber}11`, border:`1px solid ${C.amber}33`, borderRadius:8, padding:'.6rem .8rem', marginBottom:'.85rem', fontSize:'.82rem', color:C.ink2 }}><b style={{ color:C.amber, fontSize:'.68rem' }}>BRIEFING</b><br/>{a.briefing}</div>}
              {conf ? <div style={{ color:C.green, fontSize:'.85rem', fontWeight:600 }}>✅ Asistencia confirmada</div>
                    : <button onClick={()=>confirmar(a.id)} disabled={confirmando===a.id} style={{ width:'100%', padding:'.75rem', background:confirmando===a.id?C.bg3:C.red, color:C.paper, border:'none', borderRadius:8, fontFamily:SN, fontSize:'.9rem', fontWeight:700, cursor:'pointer' }}>{confirmando===a.id?'…':'✓  Confirmar asistencia'}</button>}
            </div>
          )
        })}
        {pasados.length > 0 && <>
          <div style={{ color:C.ink3, fontSize:'.72rem', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'.5rem', marginTop:'1rem' }}>Historial</div>
          {pasados.map(a => <div key={a.id} style={{ background:C.bg2, border:`1px solid ${C.rule}`, borderRadius:8, padding:'.6rem 1rem', marginBottom:'.4rem', opacity:.55, display:'flex', justifyContent:'space-between' }}><span style={{ fontSize:'.85rem' }}>{a.evento?.nombre}</span><span style={{ color:C.ink3, fontSize:'.75rem' }}>{a.evento ? new Date(a.evento.fecha_evento).toLocaleDateString('es-ES') : ''}</span></div>)}
        </>}
      </div>
    </div>
  )
}
function Row({ icon, label, val }: { icon:string; label:string; val:string }) {
  return <div style={{ display:'flex', gap:'.4rem' }}><span style={{ fontSize:'.78rem' }}>{icon}</span><span style={{ color:C.ink3, fontSize:'.78rem', minWidth:65 }}>{label}:</span><span style={{ color:C.ink2, fontSize:'.78rem' }}>{val}</span></div>
}

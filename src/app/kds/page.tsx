'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Comanda } from '@/types'
import { useAuth } from '@/hooks/useAuth'

const K={bg:'#0D0B08',c1:'#161310',fg:'#F6F1E7',fg2:'#C9BFAA',fg3:'#8D8270',rule:'#2F2820',rS:'#4A3F33',red:'#D9442B',amb:'#E8A33B',gr:'#3F7D44'}
const SE="'Newsreader',Georgia,serif"
const SN="'Inter Tight',system-ui,sans-serif"
const SM="'JetBrains Mono',ui-monospace,monospace"

type Seccion = { id: string; nombre: string; color_kds: string }

function edadStr(iso:string){const m=Math.floor((Date.now()-new Date(iso).getTime())/60000);if(m===0)return'AHORA';if(m<60)return`+${m}m`;return`+${Math.floor(m/60)}h${m%60?m%60+'m':''}`}
function edadColor(iso:string){const m=Math.floor((Date.now()-new Date(iso).getTime())/60000);return m<10?K.gr:m<20?K.amb:K.red}

function KDSInner() {
  const { session, checking } = useAuth(['admin', 'cocina', 'super_admin'])
  const searchParams = useSearchParams()
  const paramSeccion = searchParams.get('seccion')

  const seccionFiltro = paramSeccion ?? session?.seccion_id ?? null

  const [comandas, setComandasState] = useState<Comanda[]>([])
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [time, setTime] = useState(new Date())

  const fetchSecciones = useCallback(async () => {
    if (!session) return
    const { data } = await supabase
      .from('secciones_cocina')
      .select('id,nombre,color_kds')
      .eq('restaurante_id', session.restaurante_id)
      .order('orden', { ascending: true })
    if (data) setSecciones(data)
  }, [session])

  const fetchData = useCallback(async () => {
    if (!session) return
    const { data } = await supabase
      .from('comandas')
      .select('*,mesa:mesas(codigo),camarero:camareros(nombre),items:comanda_items(*)')
      .eq('restaurante_id', session.restaurante_id)
      .in('tipo', ['comanda', 'marchar'])
      .in('estado', ['nueva', 'en_cocina'])
      .order('created_at', { ascending: true })
    if (data) setComandasState(data as unknown as Comanda[])
  }, [session])

  useEffect(() => {
    if (!session) return
    fetchSecciones()
    fetchData()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch = (supabase.channel('kds') as any)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comandas' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comanda_items' }, fetchData)
      .subscribe()
    const t = setInterval(() => { fetchData(); setTime(new Date()) }, 5000)
    const c = setInterval(() => setTime(new Date()), 1000)
    return () => { supabase.removeChannel(ch); clearInterval(t); clearInterval(c) }
  }, [session, fetchData, fetchSecciones])

  const toggle = async (itemId: string, estado: string) => {
    await supabase.from('comanda_items').update({ estado: estado === 'listo' ? 'pendiente' : 'listo' }).eq('id', itemId)
    fetchData()
  }

  const cerrar = async (id: string, mesaId: string, camareroId?: string, mesaCodigo?: string) => {
    await supabase.from('comandas').update({ estado: 'lista' }).eq('id', id)
    await supabase.from('mesas').update({ estado: 'activa' }).eq('id', mesaId)
    if (camareroId) {
      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Comanda lista',
          body: `${mesaCodigo || 'Mesa'} — todo listo. Puedes servir.`,
          mesa: mesaCodigo,
          camarero_ids: [camareroId],
          data: { url: '/edge' },
        }),
      }).catch(() => {})
    }
    fetchData()
  }

  const comandasFiltradas = comandas.map(c => {
    if (!seccionFiltro) return c
    const itemsFiltrados = (c.items || []).filter(it => it.seccion_id === seccionFiltro)
    return { ...c, items: itemsFiltrados }
  }).filter(c => !seccionFiltro || (c.items && c.items.length > 0))

  const seccionActiva = secciones.find(s => s.id === seccionFiltro)
  const colorSeccion = seccionActiva?.color_kds ?? K.gr
  const esAdmin = session?.rol === 'admin' || session?.rol === 'super_admin'

  if (checking || !session) return <div style={{ minHeight: '100dvh', background: K.bg }} />

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: K.bg }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes slideIn{from{transform:translateY(-8px);opacity:0}to{transform:translateY(0);opacity:1}}
        @media(min-width:640px){.kds-grid{grid-template-columns:repeat(2,1fr)!important}}
        @media(min-width:1024px){.kds-grid{grid-template-columns:repeat(3,1fr)!important}}
        @media(min-width:1400px){.kds-grid{grid-template-columns:repeat(4,1fr)!important}}
        .sec-tab{cursor:pointer;padding:4px 10px;border-radius:3px;font-family:${SM};font-size:9px;font-weight:700;letter-spacing:.1em;text-decoration:none;transition:background .15s,color .15s}
      `}</style>

      <div style={{ padding: '0 16px', minHeight: 52, borderBottom: `1px solid ${K.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: K.c1, flexShrink: 0, position: 'sticky', top: 0, zIndex: 10, flexWrap: 'wrap', gap: 8, paddingTop: 6, paddingBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg width="22" height="22" viewBox="0 0 56 56"><rect width="56" height="56" rx="8" fill="#1F1A15"/><g transform="translate(11,14)"><rect x="0" y="11" width="3" height="6" rx="1.5" fill="#F6F1E7"/><rect x="6" y="6" width="3" height="16" rx="1.5" fill="#F6F1E7"/><rect x="12" y="0" width="3" height="28" rx="1.5" fill="#D9442B"/><rect x="18" y="3" width="3" height="22" rx="1.5" fill="#F6F1E7"/><rect x="24" y="9" width="3" height="10" rx="1.5" fill="#F6F1E7"/><rect x="30" y="12" width="3" height="4" rx="1.5" fill="#F6F1E7"/></g></svg>
          <span style={{ fontFamily: SN, fontSize: 12, color: K.fg2, fontWeight: 500, letterSpacing: '.04em' }}>
            KDS{seccionActiva ? ` · ${seccionActiva.nombre.toUpperCase()}` : ' · TODAS'}
          </span>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: colorSeccion }} />
        </div>

        {esAdmin && secciones.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <a href="/kds" className="sec-tab"
              style={{ background: !seccionFiltro ? '#2F2820' : 'transparent', color: !seccionFiltro ? K.fg : K.fg3 }}>
              TODAS
            </a>
            {secciones.map(s => (
              <a key={s.id} href={`/kds?seccion=${s.id}`} className="sec-tab"
                style={{ background: seccionFiltro === s.id ? '#2F2820' : 'transparent', color: seccionFiltro === s.id ? s.color_kds : K.fg3 }}>
                {s.nombre.toUpperCase()}
              </a>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {[['OK', K.gr], ['AVISO', K.amb], ['URGENTE', K.red]].map(([l, c]) => (
              <span key={l} style={{ fontFamily: SN, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', color: c, display: 'flex', gap: 3, alignItems: 'center' }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: c }} />{l}
              </span>
            ))}
          </div>
          <span style={{ fontFamily: SM, fontSize: 16, fontWeight: 700, color: K.fg }}>{time.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
      </div>

      <div style={{ flex: 1, padding: 10, overflowY: 'auto' }}>
        {comandasFiltradas.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 10 }}>
            <span style={{ fontFamily: SE, fontSize: 28, color: K.fg3, fontStyle: 'italic' }}>Cocina libre.</span>
            {seccionActiva && (
              <span style={{ fontFamily: SM, fontSize: 10, color: K.fg3, letterSpacing: '.1em' }}>
                {seccionActiva.nombre.toUpperCase()} · SIN PENDIENTES
              </span>
            )}
          </div>
        ) : (
          <div className="kds-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
            {comandasFiltradas.map(c => {
              const allDone = (c.items || []).every(it => it.estado === 'listo')
              const col = edadColor(c.created_at)
              const urgente = col === K.red
              return (
                <div key={c.id} style={{ position: 'relative', background: urgente ? 'rgba(217,68,43,.08)' : col === K.amb ? 'rgba(232,163,59,.08)' : 'rgba(63,125,68,.06)', border: `1px solid ${urgente ? 'rgba(217,68,43,.35)' : col === K.amb ? 'rgba(232,163,59,.3)' : 'rgba(63,125,68,.25)'}`, borderRadius: 0, padding: 14, animation: 'slideIn .3s ease' }}>
                  {allDone && (
                    <div onClick={() => cerrar(c.id, c.mesa_id, c.camarero_id, c.mesa?.codigo)} style={{ position: 'absolute', inset: 0, background: 'rgba(13,11,8,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 2 }}>
                      <span style={{ fontFamily: SM, fontSize: 14, fontWeight: 700, letterSpacing: '.1em', color: K.gr }}>LISTO — TAP</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                      <span style={{ fontFamily: SE, fontSize: 36, fontWeight: 500, color: K.fg, lineHeight: 1 }}>{c.mesa?.codigo}</span>
                      <span style={{ fontFamily: SM, fontSize: 10, color: K.fg3 }}>#{c.numero_ticket}</span>
                    </div>
                    <span style={{ fontFamily: SM, fontSize: 22, fontWeight: 700, color: col, animation: urgente ? 'pulse 1.5s ease-in-out infinite' : 'none' }}>{edadStr(c.created_at)}</span>
                  </div>
                  <div style={{ borderTop: `1px solid ${K.rS}`, paddingTop: 10 }}>
                    {(c.items || []).map(it => (
                      <div key={it.id} onClick={() => toggle(it.id, it.estado)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${K.rule}`, cursor: 'pointer', opacity: it.estado === 'listo' ? .4 : 1, transition: 'opacity .15s', minHeight: 44 }}>
                        <div style={{ width: 20, height: 20, borderRadius: 3, border: `2px solid ${it.estado === 'listo' ? K.gr : K.rS}`, background: it.estado === 'listo' ? K.gr : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}>
                          {it.estado === 'listo' && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1 5 4 8 9 2" stroke={K.fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: SM, fontSize: 14, fontWeight: 700, letterSpacing: '.05em', color: K.fg, textTransform: 'uppercase', textDecoration: it.estado === 'listo' ? 'line-through' : 'none' }}>
                            {it.nombre}
                            {it.formato_nombre && (
                              <span style={{ fontFamily: SM, fontSize: 10, fontWeight: 600, marginLeft: 6, padding: '1px 5px', borderRadius: 2, background: K.rule, color: K.fg3, letterSpacing: '.06em', verticalAlign: 'middle' }}>
                                {it.formato_nombre.toUpperCase()}
                              </span>
                            )}
                          </div>
                          {it.notas && <div style={{ fontFamily: SN, fontSize: 11, color: K.amb, marginTop: 2 }}>{it.notas}</div>}
                        </div>
                        <span style={{ fontFamily: SM, fontSize: 13, color: K.fg3 }}>{it.cantidad}x</span>
                        {!seccionFiltro && it.seccion_id && (
                          <span style={{ fontFamily: SM, fontSize: 8, padding: '2px 5px', borderRadius: 2, background: K.rule, color: K.fg3, letterSpacing: '.06em' }}>
                            {it.seccion_id.toUpperCase()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: SN, fontSize: 10, color: K.fg3 }}>
                    <span>{c.camarero?.nombre}</span>
                    <span>{new Date(c.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function KDSPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#0D0B08' }} />}>
      <KDSInner />
    </Suspense>
  )
}

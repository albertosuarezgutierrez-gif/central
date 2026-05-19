'use client'
import { C, SE, SN, SM, SC } from '@/lib/colors'
// ============================================================
// ia.rest · /running — Pantalla del Running
// v2: tarjetas de SERVICIO (cubierto) en prioridad máxima,
//     fondo crema · paleta corporativa correcta
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import SugerenciaButton from '@/components/SugerenciaButton'
import ChuleteVoz from '@/components/ChuleteVoz'
import { useMensajes } from '@/hooks/useMensajes'


interface MarcharItem {
  id: string
  mesa_codigo: string
  zona_nombre: string | null
  items_resumen: string
  items_detalle: { nombre: string; cantidad: number }[]
  created_at: string
  recogido: boolean
  tipo: 'platos' | 'servicio'
  num_comensales: number | null
}

function edadStr(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m === 0) return 'AHORA'
  if (m < 60)  return `+${m}m`
  return `+${Math.floor(m / 60)}h${m % 60 ? m % 60 + 'm' : ''}`
}

function urgencia(iso: string): 'ok' | 'warn' | 'crit' {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 2) return 'ok'
  if (m < 5) return 'warn'
  return 'crit'
}

function hablar(texto: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utt = new SpeechSynthesisUtterance(texto)
  utt.lang = 'es-ES'; utt.rate = 0.9; utt.pitch = 1; utt.volume = 1
  const voces = window.speechSynthesis.getVoices()
  const v = voces.find(x => x.lang.startsWith('es') && x.localService)
          ?? voces.find(x => x.lang.startsWith('es'))
  if (v) utt.voice = v
  window.speechSynthesis.speak(utt)
}

// ── Tarjeta de SERVICIO (cubierto) ─────────────────────────
function ServicioCard({ item, onMarcar }: { item: MarcharItem; onMarcar: () => void }) {
  const [done, setDone] = useState(false)

  const marcar = async () => {
    if (done) return
    setDone(true)
    await supabase.from('marchar_log').update({ recogido: true }).eq('id', item.id)
    onMarcar()
  }

  return (
    <div style={{
      border: `2px solid ${done ? C.rule : C.amb+'99'}`,
      borderLeft: `4px solid ${done ? C.rule : C.amb}`,
      borderRadius: 12,
      background: done ? C.bg1 : C.ambS,
      padding: '14px 16px',
      marginBottom: 10,
      opacity: done ? 0.55 : 1,
      transition: 'all .2s',
      position: 'relative',
    }}>
      {/* Badge PRIMERA COMANDA */}
      {!done && (
        <div style={{
          position: 'absolute', top: -9, left: 12,
          fontFamily: SM, fontSize: 9, fontWeight: 700, letterSpacing: '.08em',
          background: C.amb, color: '#412402',
          padding: '2px 8px', borderRadius: 5,
        }}>
          PRIMERA COMANDA
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, marginTop: 4 }}>
        <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: done ? C.ink3 : C.ink }}>
          Mesa {item.mesa_codigo}
        </div>
        {item.zona_nombre && (
          <div style={{
            fontFamily: SM, fontSize: 9, color: C.amb,
            background: C.amb + '22', border: `1px solid ${C.amb}44`,
            padding: '2px 7px', borderRadius: 4,
          }}>
            {item.zona_nombre.toUpperCase()}
          </div>
        )}
        {item.num_comensales && (
          <div style={{
            marginLeft: 'auto', fontFamily: SM, fontSize: 13,
            fontWeight: 700, color: done ? C.ink4 : C.ink2,
          }}>
            × {item.num_comensales} pax
          </div>
        )}
      </div>

      {/* Items a llevar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 12 }}>
        {item.items_detalle?.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: SM, fontSize: 15, fontWeight: 700, color: done ? C.rule : C.amb, minWidth: 24 }}>
              {it.cantidad}×
            </span>
            <span style={{ fontFamily: SN, fontSize: 14, color: done ? C.ink4 : C.ink2 }}>
              {it.nombre}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={marcar}
        disabled={done}
        style={{
          width: '100%', padding: '10px',
          borderRadius: 8, border: 'none',
          background: done ? C.bg2 : C.amb,
          color: done ? C.ink4 : '#412402',
          fontSize: 13, fontWeight: 500,
          fontFamily: SN, cursor: done ? 'default' : 'pointer',
          transition: 'all .15s',
        }}
      >
        {done
          ? `Llevado · ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`
          : 'Llevar a la mesa'}
      </button>
    </div>
  )
}

// ── Tarjeta de PLATOS ───────────────────────────────────────
function PlatosCard({ item, onMarcar }: { item: MarcharItem; onMarcar: () => void }) {
  const u   = urgencia(item.created_at)
  const col = u === 'ok' ? C.gr : u === 'warn' ? C.amb : C.verm
  const bg  = u === 'ok' ? C.grS : u === 'warn' ? C.ambS : C.vermS
  const [done, setDone] = useState(false)

  const marcar = async () => {
    if (done) return
    setDone(true)
    await supabase.from('marchar_log').update({ recogido: true }).eq('id', item.id)
    onMarcar()
  }

  return (
    <div style={{
      border: `1px solid ${done ? C.rule : col + '55'}`,
      borderLeft: `3px solid ${done ? C.rule : col}`,
      borderRadius: 12,
      background: done ? C.bg1 : bg + '88',
      padding: '14px 16px',
      marginBottom: 10,
      opacity: done ? 0.5 : 1,
      transition: 'all .2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        {item.zona_nombre && (
          <div style={{
            fontFamily: SM, fontSize: 9, fontWeight: 700, letterSpacing: '.1em',
            color: col, padding: '2px 6px',
            border: `1px solid ${col}44`, borderRadius: 3, background: col + '18',
          }}>
            {item.zona_nombre.toUpperCase()}
          </div>
        )}
        <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: done ? C.ink3 : C.ink }}>
          Mesa {item.mesa_codigo}
        </div>
        <div style={{ marginLeft: 'auto', fontFamily: SM, fontSize: 12, color: col, fontWeight: 700 }}>
          {edadStr(item.created_at)}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        {item.items_detalle?.length > 0
          ? item.items_detalle.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: SM, fontSize: 18, fontWeight: 700, color: done ? C.rule : col, minWidth: 28 }}>
                  {it.cantidad}×
                </span>
                <span style={{ fontFamily: SN, fontSize: 15, color: done ? C.ink4 : C.ink }}>
                  {it.nombre}
                </span>
              </div>
            ))
          : <div style={{ fontFamily: SN, fontSize: 14, color: C.ink2 }}>{item.items_resumen}</div>
        }
      </div>

      <button
        onClick={marcar}
        disabled={done}
        style={{
          width: '100%', padding: '9px',
          borderRadius: 7, border: `1px solid ${done ? C.rule : col + '55'}`,
          background: done ? C.bg2 : col + '22',
          color: done ? C.ink4 : col,
          fontSize: 12, fontFamily: SN, cursor: done ? 'default' : 'pointer',
          transition: 'all .15s',
        }}
      >
        {done ? 'Entregado ✓' : 'Entregado'}
      </button>
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────
export default function RunningPage() {
  const { session, checking } = useAuth('running')
  const [items, setItems]     = useState<MarcharItem[]>([])
  const [zonas, setZonas]     = useState<{ id: string; nombre: string }[]>([])
  const [zonasRun, setZonasRun] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showZonas, setShowZonas] = useState(false)
  const [time, setTime]       = useState(new Date())
  const canalRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Chat entre roles
  const [chatAbierto, setChatAbierto] = useState(false)
  const [chuleteAbierto, setChuleteAbierto] = useState(false)
  const [chatTexto, setChatTexto]     = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const { mensajes, noLeidos, enviar: enviarMensajeChat, marcarLeido: marcarMensajeLeido } =
    useMensajes(session?.restaurante_id ?? '', session?.id ?? '', session?.rol ?? 'running')

  const sh = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-ia-session': typeof window !== 'undefined'
      ? localStorage.getItem('ia_rest_session') ?? '' : '',
  }), [])

  const cargarItems = useCallback(async () => {
    if (!session) return
    const { data } = await supabase
      .from('marchar_log')
      .select('*')
      .eq('receptor_id', session.id)
      .eq('recogido', false)
      .eq('restaurante_id', session.restaurante_id)
      .order('created_at', { ascending: true })
    setItems((data ?? []) as MarcharItem[])
    setLoading(false)
  }, [session])

  const cargarZonas = useCallback(async () => {
    if (!session) return
    const [resZ, resA] = await Promise.all([
      fetch('/api/owner/zonas', { headers: sh() }),
      fetch(`/api/owner/running-zonas?camarero_id=${session.id}`, { headers: sh() }),
    ])
    if (resZ.ok) {
      const z = await resZ.json()
      setZonas((z ?? []).map((x: { id: string; nombre: string }) => ({ id: x.id, nombre: x.nombre })))
    }
    if (resA.ok) {
      const a = await resA.json()
      setZonasRun((a ?? []).filter((r: { activo: boolean }) => r.activo).map((r: { zona_id: string }) => r.zona_id))
    }
  }, [session, sh])

  useEffect(() => {
    if (!session) return
    cargarItems()
    cargarZonas()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const canal = (supabase.channel(`running-${session.id}`) as any)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'marchar_log',
        filter: `receptor_id=eq.${session.id}`,
      }, (payload: { new: MarcharItem }) => {
        const nuevo = payload.new as MarcharItem
        setItems(prev => [...prev, nuevo])
        if (nuevo.tipo === 'servicio') {
          hablar(`Servicio. Mesa ${nuevo.mesa_codigo}. ${nuevo.num_comensales} comensales. Llevar cubierto y pan.`)
        } else {
          hablar(`Saliendo. Mesa ${nuevo.mesa_codigo}. ${nuevo.items_resumen.replace(/×/g,'').replace(/·/g,',')}`)
        }
      })
      .subscribe()

    canalRef.current = canal
    const t = setInterval(() => setTime(new Date()), 10000)
    return () => { canal.unsubscribe(); clearInterval(t) }
  }, [session, cargarItems, cargarZonas])

  void time

  const logout = () => {
    localStorage.removeItem('ia_rest_session')
    window.location.href = '/login'
  }

  const toggleZona = async (zonaId: string) => {
    if (!session) return
    const asignada = zonasRun.includes(zonaId)
    if (asignada) {
      const { data: entries } = await supabase
        .from('running_zonas').select('id')
        .eq('camarero_id', session.id).eq('zona_id', zonaId)
      if (entries?.length) {
        await fetch('/api/owner/running-zonas', {
          method: 'DELETE', headers: sh(),
          body: JSON.stringify({ id: entries[0].id }),
        })
      }
      setZonasRun(prev => prev.filter(z => z !== zonaId))
    } else {
      await fetch('/api/owner/running-zonas', {
        method: 'POST', headers: sh(),
        body: JSON.stringify({ camarero_id: session.id, zona_id: zonaId }),
      })
      setZonasRun(prev => [...prev, zonaId])
    }
  }

  if (checking || !session) {
    return <div style={{ minHeight: '100dvh', background: C.bg }} />
  }

  const pendientes     = items.filter(i => !i.recogido)
  const servicioPend   = pendientes.filter(i => i.tipo === 'servicio')
  const platosPend     = pendientes.filter(i => i.tipo !== 'servicio')
  const entregados     = items.filter(i => i.recogido).length
  const zonasNombres   = zonas.filter(z => zonasRun.includes(z.id)).map(z => z.nombre).join(' · ')

  return (
    <>
      <SugerenciaButton session={session} tema="light" />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;700&family=Newsreader:ital,opsz,wght@1,6..72,400;1,6..72,500&family=JetBrains+Mono:wght@500;700&family=Caveat:wght@400;600&display=swap');
        @keyframes slideIn{from{transform:translateY(-8px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        * { box-sizing:border-box; }
        button:hover { filter: brightness(0.96); }
        .run-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
        @media (max-width: 600px) {
          .run-cards { grid-template-columns: 1fr; gap: 10px; }
        }
      `}</style>

      <div style={{ minHeight: '100dvh', background: C.bg, fontFamily: SN, display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: C.bg1, borderBottom: `1px solid ${C.rule}`,
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 16px', height: 54,
        }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: C.ink }}>
            ia<span style={{ color: C.verm }}>.</span>rest
          </div>
          <div style={{
            fontFamily: SM, fontSize: 9, fontWeight: 700, letterSpacing: '.1em',
            color: C.verm, padding: '3px 7px',
            border: `1px solid ${C.verm}44`, borderRadius: 3, background: C.vermS,
          }}>
            RUNNING
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontFamily: SN, fontWeight: 500, fontSize: 14, color: C.ink }}>{session.nombre}</div>
            {zonasNombres && (
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {zonasNombres}
              </div>
            )}
          </div>
          <button onClick={() => setShowZonas(v => !v)} style={{
            background: showZonas ? C.verm : C.bg2,
            border: `1px solid ${showZonas ? C.verm : C.rule}`,
            borderRadius: 8, padding: '7px 12px',
            color: showZonas ? '#fff' : C.ink2,
            fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}>
            Mis zonas
          </button>
          {/* Botón chat con badge */}
          <button
            onClick={() => {
              setChatAbierto(v => !v)
              if (!chatAbierto) mensajes.filter(m => !m.leido_por?.includes(session.id)).forEach(m => marcarMensajeLeido(m.id))
            }}
            style={{
              position: 'relative', width: 36, height: 36,
              background: chatAbierto ? C.verm : C.bg2,
              border: `1px solid ${chatAbierto ? C.verm : C.rule}`,
              borderRadius: 8, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={chatAbierto ? '#fff' : C.ink2} strokeWidth={2}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            {noLeidos > 0 && !chatAbierto && (
              <span style={{ position:'absolute', top:-5, right:-5, minWidth:16, height:16, borderRadius:8, background:C.verm, color:'#fff', fontSize:9, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px' }}>
                {noLeidos}
              </span>
            )}
          </button>
          <button onClick={logout} style={{
            background: 'none', border: `1px solid ${C.rule}`,
            borderRadius: 6, padding: '6px 10px',
            color: C.ink3, fontSize: 12, cursor: 'pointer',
          }}>
            Salir
          </button>
          {/* Botón Chuleta Voz */}
          <button onClick={() => setChuleteAbierto(v => !v)} title="Chuleta Voz" style={{
            background: chuleteAbierto ? C.amb : C.bg2,
            border: `1px solid ${chuleteAbierto ? C.amb : C.rule}`,
            borderRadius: 8, width: 36, height: 36, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={chuleteAbierto ? '#fff' : C.ink2} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </button>
        </header>

        {/* Modal Chuleta Voz */}
        {chuleteAbierto && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.6)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
            onClick={() => setChuleteAbierto(false)}>
            <div style={{ background: C.bg1, borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480,
              maxHeight: '85vh', overflowY: 'auto', scrollbarWidth: 'none' as const }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px 0', borderBottom: `0.5px solid ${C.rule}`, paddingBottom: 10 }}>
                <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 15, color: C.ink }}>Chuleta Voz</span>
                <button onClick={() => setChuleteAbierto(false)} style={{ background: 'none', border: 'none',
                  color: C.ink3, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
              </div>
              <ChuleteVoz rol="running" />
            </div>
          </div>
        )}

        {/* Panel zonas */}
        {showZonas && (
          <div style={{ background: C.bg1, borderBottom: `1px solid ${C.rule}`, padding: '12px 16px' }}>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              Zonas que cubro ahora
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {zonas.length === 0 && (
                <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>
                  Sin zonas configuradas — el owner las crea en el panel.
                </div>
              )}
              {zonas.map(z => {
                const activa = zonasRun.includes(z.id)
                return (
                  <button key={z.id} onClick={() => toggleZona(z.id)} style={{
                    padding: '8px 14px',
                    background: activa ? C.grS : C.bg2,
                    border: `1px solid ${activa ? C.gr : C.rule}`,
                    borderRadius: 8, cursor: 'pointer',
                    color: activa ? C.gr : C.ink3,
                    fontSize: 13, fontWeight: activa ? 500 : 400,
                  }}>
                    {activa ? '✓ ' : ''}{z.nombre}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Contenido */}
        <div style={{ flex: 1, padding: '14px 16px', maxWidth: 640, width: '100%', margin: '0 auto' }}>

          {/* Contador */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, letterSpacing: '.06em' }}>
              {pendientes.length === 0
                ? 'Todo entregado'
                : `${pendientes.length} pendiente${pendientes.length > 1 ? 's' : ''}`
                + (servicioPend.length > 0 ? ` · ${servicioPend.length} cubierto${servicioPend.length > 1 ? 's' : ''}` : '')}
            </div>
            {!loading && pendientes.length > 0 && (
              <div style={{ fontFamily: SM, fontSize: 10, color: C.verm, fontWeight: 700, animation: 'pulse 1.5s ease-in-out infinite' }}>
                ● LIVE
              </div>
            )}
          </div>

          {/* Estado vacío */}
          {!loading && pendientes.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: C.ink3, marginBottom: 8 }}>
                Todo entregado.
              </div>
              <div style={{ fontFamily: SC, fontSize: 16, color: C.ink4 }}>
                Cuando cocina marche algo de tu zona, aparecerá aquí.
              </div>
            </div>
          )}

          {/* ── SERVICIO primero (ámbar, prioridad) ─────── */}
          {servicioPend.length > 0 && (
            <>
              <div style={{ fontFamily: SM, fontSize: 9, color: C.amb, letterSpacing: '.1em', marginBottom: 8, marginTop: 4 }}>
                CUBIERTO · SERVICIO DE MESA
              </div>
              {servicioPend.map(item => (
                <div key={item.id} style={{ animation: 'slideIn .2s ease' }}>
                  <ServicioCard item={item} onMarcar={cargarItems} />
                </div>
              ))}
              {platosPend.length > 0 && (
                <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, letterSpacing: '.1em', margin: '14px 0 8px' }}>
                  PLATOS
                </div>
              )}
            </>
          )}

          {/* ── PLATOS ──────────────────────────────────── */}
          {platosPend.map(item => (
            <div key={item.id} style={{ animation: 'slideIn .2s ease' }}>
              <PlatosCard item={item} onMarcar={cargarItems} />
            </div>
          ))}

          {/* Historial */}
          {entregados > 0 && (
            <div style={{ marginTop: 24, color: C.ink4, fontFamily: SM, fontSize: 11, textAlign: 'center' }}>
              {entregados} entregados en esta sesión
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px', borderTop: `1px solid ${C.rule}`,
          fontFamily: SM, fontSize: 10, color: C.ink4,
          display: 'flex', justifyContent: 'center', gap: 16,
          background: C.bg1,
        }}>
          <span>Running · {session.restaurante_nombre}</span>
          <span style={{ color: C.rule }}>|</span>
          <span>Solo lectura · sin comandas</span>
        </div>

        {/* Panel Chat lateral */}
        {chatAbierto && (
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 320, maxWidth: '92vw',
            background: C.bg1, borderLeft: `1px solid ${C.rule}`, zIndex: 200,
            display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 20px rgba(0,0,0,.10)',
          }}>
            {/* Header */}
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.bg }}>
              <span style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: '.05em' }}>MENSAJES DEL TURNO</span>
              <button onClick={() => setChatAbierto(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink3, fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            {/* Mensajes */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mensajes.length === 0 && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: SE, fontStyle: 'italic', color: C.ink3, fontSize: 14, textAlign: 'center' }}>Sin mensajes aún</span>
                </div>
              )}
              {mensajes.map(m => {
                const esMio = m.camarero_id === session.id
                const rolColor = ({ camarero: C.teal, cocina: C.verm, jefe_sala: C.amb, running: C.gr } as Record<string,string>)[m.rol_origen] ?? C.ink3
                const rolLabel = ({ camarero: 'Sala', cocina: 'Cocina', jefe_sala: 'Jefe', running: 'Running' } as Record<string,string>)[m.rol_origen] ?? m.rol_origen
                return (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: esMio ? 'flex-end' : 'flex-start' }}>
                    {!esMio && (
                      <span style={{ fontFamily: SN, fontSize: 10, color: rolColor, marginBottom: 2, paddingLeft: 4 }}>
                        {m.nombre_origen} · {rolLabel}{m.mesa_ref ? ` · ${m.mesa_ref}` : ''}
                      </span>
                    )}
                    <div style={{
                      maxWidth: '85%', padding: '7px 11px',
                      borderRadius: esMio ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                      background: esMio ? C.gr : C.bg,
                      border: esMio ? 'none' : `1px solid ${C.rule}`,
                      color: esMio ? '#fff' : C.ink,
                      fontFamily: SN, fontSize: 13, lineHeight: 1.4,
                    }}>
                      {m.texto}
                    </div>
                    <span style={{ fontFamily: SM, fontSize: 9, color: C.ink4, marginTop: 2, paddingLeft: esMio ? 0 : 4, paddingRight: esMio ? 4 : 0 }}>
                      {new Date(m.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Plantillas rápidas */}
            <div style={{ padding: '6px 10px', borderTop: `1px solid ${C.rule}`, display: 'flex', gap: 5, flexWrap: 'wrap', background: C.bg }}>
              {['Ya está servida la mesa', 'Necesito ayuda en sala', '¿Hay marcha lista?', 'La mesa pidió más pan'].map(t => (
                <button key={t} onClick={() => setChatTexto(t)} style={{
                  padding: '3px 8px', borderRadius: 14, border: `1px solid ${C.rule}`,
                  background: C.bg1, fontFamily: SN, fontSize: 11, color: C.ink2, cursor: 'pointer',
                }}>{t}</button>
              ))}
            </div>

            {/* Input */}
            <div style={{ padding: '8px 10px', borderTop: `1px solid ${C.rule}`, display: 'flex', gap: 8, alignItems: 'flex-end', background: C.bg1 }}>
              <textarea
                value={chatTexto}
                onChange={e => setChatTexto(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (chatTexto.trim()) {
                      enviarMensajeChat(chatTexto.trim(), { rol_destino: 'jefe_sala' })
                      setChatTexto('')
                      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
                    }
                  }
                }}
                placeholder="Mensaje a jefe de sala…"
                rows={1}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 20,
                  border: `1px solid ${C.rule}`, background: C.bg,
                  fontFamily: SN, fontSize: 13, color: C.ink, resize: 'none', outline: 'none', lineHeight: 1.4,
                }}
              />
              <button
                onClick={() => {
                  if (!chatTexto.trim()) return
                  enviarMensajeChat(chatTexto.trim(), { rol_destino: 'jefe_sala' })
                  setChatTexto('')
                  setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
                }}
                disabled={!chatTexto.trim()}
                style={{
                  width: 38, height: 38, borderRadius: '50%', border: 'none', flexShrink: 0,
                  background: chatTexto.trim() ? C.gr : C.rule,
                  cursor: chatTexto.trim() ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={chatTexto.trim() ? '#fff' : C.ink4} strokeWidth={2}>
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

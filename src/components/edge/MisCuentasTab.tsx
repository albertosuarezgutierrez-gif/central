'use client'
// ia.rest · MisCuentasTab — Mis mesas abiertas (botones idénticos a ModoManual, paleta crema)
import React, { useState, useEffect, useCallback, useRef } from 'react'

/* ─── Paleta crema — igual que el resto de /edge ── */
const L = {
  bg:  '#F6F1E7', bg2: '#EFE7D6', bg3: '#E5DAC2',
  fg:  '#1A1714', fg2: '#3A332C', fg3: '#6B5F52', fg4: '#9A8D7C',
  rule:'#D8CDB6', rS: '#B8A98B',
}
const A = {
  red:  '#D9442B', redD: '#A8311E', redS: '#F4D8CF',
  gr:   '#3F7D44', grS:  'rgba(63,125,68,.10)',
  amb:  '#E8A33B', ambS: 'rgba(232,163,59,.10)',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"
const SC = "'Caveat',cursive"

/* Mismos estados que ModoManual */
const ESTADO_FG: Record<string, string> = {
  activa:  A.gr,  marchar: '#2D7A2D', lista: A.gr,
  aviso:   A.amb, urgente: A.red,     cuenta: L.fg3,
  en_cocina: A.amb,
}
const ESTADO_BG: Record<string, string> = {
  activa:   'rgba(63,125,68,.10)',   marchar: 'rgba(63,125,68,.16)',
  lista:    'rgba(63,125,68,.12)',   en_cocina: 'rgba(232,163,59,.10)',
  aviso:    'rgba(232,163,59,.10)',  urgente: 'rgba(217,68,43,.10)',
  cuenta:   L.bg3,
}
function shadowBtn(estado: string): string {
  const map: Record<string, string> = {
    activa:    `rgba(63,125,68,0.35) 0px 0px 0px 1px, rgba(63,125,68,0.15) 0px 5px 14px -3px`,
    lista:     `rgba(63,125,68,0.40) 0px 0px 0px 1px, rgba(63,125,68,0.18) 0px 5px 14px -3px`,
    en_cocina: `rgba(232,163,59,0.40) 0px 0px 0px 1px, rgba(232,163,59,0.15) 0px 5px 14px -3px`,
    urgente:   `rgba(217,68,43,0.45) 0px 0px 0px 1px, rgba(217,68,43,0.20) 0px 5px 14px -3px`,
    cuenta:    `rgba(107,95,82,0.40) 0px 0px 0px 1px, rgba(107,95,82,0.12) 0px 5px 14px -3px`,
  }
  return map[estado] ?? `rgba(200,184,154,0.5) 0px 0px 0px 1px`
}

export interface Comanda {
  id: string; estado: string; tipo: string; created_at: string
  numero_ticket: number; num_comensales: number | null
  total_estimado: number; minutos_esperando: number
  nombre_cuenta: string | null
  mesa: { id: string; codigo: string; capacidad: number } | null
  camarero: { id: string; nombre: string } | null
  items: { id: string; nombre: string; cantidad: number; precio_unitario: number | null; notas: string | null; estado: string }[]
}

interface Props {
  session: { id: string; nombre: string; rol: string; restaurante_id: string }
  onVerMesa: (mesaId: string, mesaCodigo: string, capacidad?: number) => void
  onCountChange: (n: number) => void
}

function esCuentaPedida(c: Comanda) {
  return c.estado === 'cuenta_pedida' || c.tipo === 'cuenta'
}

/* Qué "estado visual" asignar al botón */
function estadoVisual(c: Comanda): string {
  if (esCuentaPedida(c)) return c.minutos_esperando >= 5 ? 'urgente' : 'cuenta'
  if (c.estado === 'lista')     return 'lista'
  if (c.estado === 'en_cocina') return 'en_cocina'
  return 'activa'
}

export default function MisCuentasTab({ session, onVerMesa, onCountChange }: Props) {
  const [comandas, setComandasState] = useState<Comanda[]>([])
  const [loading, setLoading]        = useState(true)
  const [error, setError]            = useState('')
  const sesRef   = useRef(JSON.stringify(session))
  const ptrStart = useRef<{ x: number; y: number } | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/edge/mis-cuentas', {
        headers: { 'x-ia-session': sesRef.current },
      })
      const d = await r.json()
      if (r.ok) {
        const lista: Comanda[] = d.cuentas ?? []
        setComandasState(lista)
        onCountChange(lista.filter(esCuentaPedida).length)
        setError('')
      } else {
        setError(d.error ?? 'Error al cargar')
      }
    } catch {
      setError('Sin conexión')
    } finally {
      setLoading(false)
    }
  }, [onCountChange])

  useEffect(() => {
    cargar()
    const iv = setInterval(cargar, 15_000)
    return () => clearInterval(iv)
  }, [cargar])

  /* ── Loading ── */
  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: L.bg }}>
      <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16, color: L.fg4 }}>Cargando mesas…</div>
    </div>
  )

  /* ── Error ── */
  if (error) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: L.bg, padding: 24 }}>
      <div style={{ fontFamily: SM, fontSize: 12, color: A.red }}>{error}</div>
      <button onClick={cargar} style={{ background: 'transparent', border: `1px solid ${L.rS}`, color: L.fg3, padding: '8px 18px', borderRadius: 8, fontFamily: SN, fontSize: 12, cursor: 'pointer' }}>
        Reintentar
      </button>
    </div>
  )

  /* Cuentas pedidas primero, luego activas ordenadas por tiempo desc */
  const pedidas = comandas.filter(esCuentaPedida)
  const activas = comandas.filter(c => !esCuentaPedida(c))
    .sort((a, b) => b.minutos_esperando - a.minutos_esperando)
  const totalPedidas = pedidas.reduce((s, c) => s + c.total_estimado, 0)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: L.bg }}>

      {/* ── Header ── */}
      <div style={{
        padding: '10px 16px', flexShrink: 0,
        background: L.bg2, borderBottom: `1px solid ${L.rule}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16, color: L.fg, flex: 1 }}>
          Mis mesas
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {pedidas.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: A.redS, border: `1px solid ${A.red}55`,
              borderRadius: 8, padding: '3px 8px',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: A.red, animation: 'ldot 1.2s infinite' }} />
              <span style={{ fontFamily: SM, fontSize: 9, color: A.red, fontWeight: 700 }}>
                {pedidas.length} CUENTA{pedidas.length > 1 ? 'S' : ''}
              </span>
            </div>
          )}
          {pedidas.length > 0 && totalPedidas > 0 && (
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 15, color: A.red }}>
              {totalPedidas.toFixed(2).replace('.', ',')} €
            </div>
          )}
          {comandas.length > 0 && (
            <div style={{ fontFamily: SM, fontSize: 9, color: L.fg3, background: L.bg3, border: `1px solid ${L.rule}`, borderRadius: 8, padding: '3px 8px' }}>
              {comandas.length} mesa{comandas.length > 1 ? 's' : ''}
            </div>
          )}
          <button
            onClick={cargar}
            style={{ background: 'transparent', border: `1px solid ${L.rS}`, borderRadius: 8, padding: '5px 8px', cursor: 'pointer', color: L.fg4, display: 'flex', alignItems: 'center' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Sin mesas ── */}
      {comandas.length === 0 && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: L.fg4, marginBottom: 6 }}>Sin mesas abiertas</div>
          <div style={{ fontFamily: SC, fontSize: 15, color: L.fg4 }}>Tus comandas aparecerán aquí</div>
        </div>
      )}

      {/* ── Grid ── */}
      {comandas.length > 0 && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'row' }}>

          {/* Franja scroll lateral — igual que ModoManual */}
          <div
            style={{ width: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', cursor: 'ns-resize' }}
            onTouchStart={e => {
              const el = e.currentTarget.nextElementSibling as HTMLDivElement
              if (!el) return
              const startY = e.touches[0].clientY
              const startScroll = el.scrollTop
              const onMove = (ev: TouchEvent) => { el.scrollTop = startScroll - (ev.touches[0].clientY - startY) }
              const onEnd = () => {
                document.removeEventListener('touchmove', onMove)
                document.removeEventListener('touchend', onEnd)
              }
              document.addEventListener('touchmove', onMove, { passive: true })
              document.addEventListener('touchend', onEnd, { passive: true })
            }}
          >
            <div style={{ width: 3, height: 40, borderRadius: 99, background: L.rS, opacity: 0.6 }} />
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px 24px 6px', touchAction: 'pan-y' }}>

            {/* Sección cuentas pedidas */}
            {pedidas.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: A.red, animation: 'ldot 1.2s infinite' }} />
                  <span style={{ fontFamily: SM, fontSize: 9, color: A.red, letterSpacing: '.1em', textTransform: 'uppercase' as const, fontWeight: 700 }}>
                    Pendientes de cobro
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 9, marginBottom: activas.length ? 18 : 0 }}>
                  {pedidas.map(c => (
                    <BtnMesa key={c.id} comanda={c} ptrStart={ptrStart} onVerMesa={onVerMesa} />
                  ))}
                </div>
              </>
            )}

            {/* Sección mesas activas */}
            {activas.length > 0 && (
              <>
                {pedidas.length > 0 && (
                  <div style={{ fontFamily: SM, fontSize: 9, color: L.fg3, letterSpacing: '.1em', textTransform: 'uppercase' as const, marginBottom: 9 }}>
                    Activas
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 9 }}>
                  {activas.map(c => (
                    <BtnMesa key={c.id} comanda={c} ptrStart={ptrStart} onVerMesa={onVerMesa} />
                  ))}
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Botón de mesa — mismos colores/sombras que ModoManual ── */
function BtnMesa({
  comanda, ptrStart, onVerMesa,
}: {
  comanda: Comanda
  ptrStart: React.MutableRefObject<{ x: number; y: number } | null>
  onVerMesa: (mesaId: string, mesaCodigo: string, capacidad?: number) => void
}) {
  const mesa  = comanda.mesa
  const ev    = estadoVisual(comanda)
  const fg    = ESTADO_FG[ev] ?? L.fg3
  const bg    = ESTADO_BG[ev] ?? L.bg2
  const shdw  = shadowBtn(ev)
  const esCta = esCuentaPedida(comanda)

  const abrir = () => {
    if (!mesa) return
    onVerMesa(mesa.id, mesa.codigo, mesa.capacidad)
  }

  return (
    <button
      onPointerDown={e => { ptrStart.current = { x: e.clientX, y: e.clientY } }}
      onPointerMove={e => {
        if (!ptrStart.current) return
        if (Math.abs(e.clientY - ptrStart.current.y) > 6) ptrStart.current = null
      }}
      onPointerUp={e => {
        if (e.pointerType !== 'touch') return
        if (!ptrStart.current) return
        ptrStart.current = null
        abrir()
      }}
      onPointerCancel={() => { ptrStart.current = null }}
      onClick={e => {
        if ((e.nativeEvent as PointerEvent).pointerType === 'touch') return
        abrir()
      }}
      style={{
        padding: '13px 6px 11px',
        borderRadius: 12,
        border: 'none',
        background: bg,
        boxShadow: shdw,
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        transition: 'all .15s cubic-bezier(.4,0,.2,1)',
        touchAction: 'manipulation',
        animation: ev === 'urgente' ? 'urgPulse 1.8s ease-in-out infinite' : 'none',
      }}
    >
      {/* Código mesa — idéntico a ModoManual */}
      <span style={{ fontFamily: SE, fontSize: 22, fontWeight: 500, color: fg, lineHeight: 1 }}>
        {mesa?.codigo ?? '?'}
      </span>

      {/* Estado */}
      <span style={{ fontFamily: SM, fontSize: 8, color: fg, letterSpacing: '.06em', textTransform: 'uppercase' as const, fontWeight: esCta ? 700 : 400 }}>
        {ev === 'urgente' ? 'CUENTA ⚠' : ev === 'cuenta' ? 'CUENTA' : ev === 'lista' ? 'LISTA ✓' : ev === 'en_cocina' ? 'COCINA' : 'ACTIVA'}
      </span>

      {/* Total */}
      {comanda.total_estimado > 0 && (
        <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 13, color: esCta ? fg : L.fg2, lineHeight: 1 }}>
          {comanda.total_estimado.toFixed(2).replace('.', ',')}€
        </span>
      )}

      {/* Tiempo */}
      <span style={{ fontFamily: SM, fontSize: 8, color: L.fg4, lineHeight: 1 }}>
        {comanda.minutos_esperando}m
      </span>

      {/* Nombre cuenta (si existe) */}
      {comanda.nombre_cuenta && (
        <span style={{ fontFamily: SC, fontSize: 10, color: L.fg3, lineHeight: 1, maxWidth: 76, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
          {comanda.nombre_cuenta}
        </span>
      )}
    </button>
  )
}

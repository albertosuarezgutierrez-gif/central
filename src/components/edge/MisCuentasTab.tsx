'use client'
// ia.rest · MisCuentasTab — Mis mesas abiertas con botones tipo grid (dark theme)
import React, { useState, useEffect, useCallback, useRef } from 'react'

const C = {
  bg:   '#14110E',
  e1:   '#1F1A15',
  e2:   '#2A241D',
  e3:   '#2F2820',
  fg:   '#F6F1E7',
  fg2:  '#C9BFAA',
  fg3:  '#8D8270',
  rule: '#2F2820',
  rS:   '#4A3F33',
  red:  '#D9442B',
  rD:   '#A8311E',
  gr:   '#3F7D44',
  amb:  '#E8A33B',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"
const SC = "'Caveat',cursive"

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

// Color y sombra del botón según estado
function colorMesa(c: Comanda): { fg: string; border: string; shadow: string; bg: string } {
  if (esCuentaPedida(c)) return {
    fg:     C.red,
    border: `rgba(217,68,43,0.55) 0px 0px 0px 1.5px, rgba(217,68,43,0.20) 0px 5px 14px -3px`,
    shadow: `rgba(217,68,43,0.22) 0px 4px 20px`,
    bg:     'rgba(217,68,43,.10)',
  }
  if (c.estado === 'lista') return {
    fg:     C.gr,
    border: `rgba(63,125,68,0.50) 0px 0px 0px 1.5px, rgba(63,125,68,0.18) 0px 5px 14px -3px`,
    shadow: 'none',
    bg:     'rgba(63,125,68,.10)',
  }
  if (c.estado === 'en_cocina') return {
    fg:     C.amb,
    border: `rgba(232,163,59,0.45) 0px 0px 0px 1px, rgba(232,163,59,0.15) 0px 5px 14px -3px`,
    shadow: 'none',
    bg:     'rgba(232,163,59,.08)',
  }
  // activa / nueva / enviada
  return {
    fg:     C.gr,
    border: `rgba(63,125,68,0.30) 0px 0px 0px 1px, rgba(63,125,68,0.10) 0px 4px 10px -3px`,
    shadow: 'none',
    bg:     'rgba(63,125,68,.07)',
  }
}

function labelEstado(c: Comanda): string {
  if (esCuentaPedida(c)) return 'CUENTA'
  if (c.estado === 'lista')     return 'LISTA ✓'
  if (c.estado === 'en_cocina') return 'COCINA'
  return 'ACTIVA'
}

export default function MisCuentasTab({ session, onVerMesa, onCountChange }: Props) {
  const [comandas, setComandasState] = useState<Comanda[]>([])
  const [loading, setLoading]        = useState(true)
  const [error, setError]            = useState('')
  const sesRef = useRef(JSON.stringify(session))
  // Scroll-safe pointer tracking
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

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
      <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16, color: C.fg3 }}>Cargando mesas…</div>
    </div>
  )

  if (error) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: C.bg, padding: 24 }}>
      <div style={{ fontFamily: SM, fontSize: 12, color: C.red }}>{error}</div>
      <button onClick={cargar} style={{ background: 'transparent', border: `1px solid ${C.rS}`, color: C.fg3, padding: '8px 18px', borderRadius: 8, fontFamily: SN, fontSize: 12, cursor: 'pointer' }}>
        Reintentar
      </button>
    </div>
  )

  // Cuentas pedidas primero, luego el resto ordenado por minutos DESC
  const pendientes = comandas.filter(esCuentaPedida)
  const activas    = comandas.filter(c => !esCuentaPedida(c))
    .sort((a, b) => b.minutos_esperando - a.minutos_esperando)

  const totalPendiente = pendientes.reduce((s, c) => s + c.total_estimado, 0)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>

      {/* ── Header ── */}
      <div style={{
        padding: '10px 16px', flexShrink: 0,
        background: C.e1, borderBottom: `1px solid ${C.rule}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16, color: C.fg, flex: 1 }}>
          Mis mesas
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {pendientes.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(217,68,43,.15)', border: `1px solid ${C.red}55`,
              borderRadius: 8, padding: '3px 8px',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, animation: 'ldot 1.2s infinite' }} />
              <span style={{ fontFamily: SM, fontSize: 9, color: C.red, fontWeight: 700 }}>
                {pendientes.length} CUENTA{pendientes.length > 1 ? 'S' : ''}
              </span>
            </div>
          )}
          {pendientes.length > 0 && totalPendiente > 0 && (
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 15, color: C.red }}>
              {totalPendiente.toFixed(2).replace('.', ',')} €
            </div>
          )}
          {comandas.length > 0 && (
            <div style={{ fontFamily: SM, fontSize: 9, color: C.fg3, background: C.e2, border: `1px solid ${C.rS}`, borderRadius: 8, padding: '3px 8px' }}>
              {comandas.length} mesa{comandas.length > 1 ? 's' : ''}
            </div>
          )}
          <button
            onClick={cargar}
            style={{ background: 'transparent', border: `1px solid ${C.rS}`, borderRadius: 8, padding: '5px 8px', cursor: 'pointer', color: C.fg3, display: 'flex', alignItems: 'center' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Contenido ── */}
      {comandas.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.fg3, marginBottom: 6 }}>Sin mesas abiertas</div>
          <div style={{ fontFamily: SC, fontSize: 15, color: C.fg3 }}>Tus comandas aparecerán aquí</div>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'row' }}>

          {/* Franja scroll lateral (igual que ModoManual) */}
          <div
            style={{ width: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', cursor: 'ns-resize' }}
            onTouchStart={e => {
              const scrollEl = e.currentTarget.nextElementSibling as HTMLDivElement
              if (!scrollEl) return
              const startY = e.touches[0].clientY
              const startScroll = scrollEl.scrollTop
              const onMove = (ev: TouchEvent) => { scrollEl.scrollTop = startScroll - (ev.touches[0].clientY - startY) }
              const onEnd = () => {
                document.removeEventListener('touchmove', onMove)
                document.removeEventListener('touchend', onEnd)
              }
              document.addEventListener('touchmove', onMove, { passive: true })
              document.addEventListener('touchend', onEnd, { passive: true })
            }}
          >
            <div style={{ width: 3, height: 40, borderRadius: 99, background: C.rS, opacity: 0.6 }} />
          </div>

          {/* Grid de botones */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px 24px 6px', touchAction: 'pan-y' }}>

            {/* Sección: Cuentas pendientes de cobro */}
            {pendientes.length > 0 && (
              <>
                <div style={{ fontFamily: SM, fontSize: 9, color: C.red, letterSpacing: '.1em', textTransform: 'uppercase' as const, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.red, animation: 'ldot 1.2s infinite' }} />
                  Pendientes de cobro
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 9, marginBottom: 16 }}>
                  {pendientes.map(c => (
                    <MesaBtn key={c.id} comanda={c} ptrStart={ptrStart} onVerMesa={onVerMesa} />
                  ))}
                </div>
              </>
            )}

            {/* Sección: Mesas activas */}
            {activas.length > 0 && (
              <>
                {pendientes.length > 0 && (
                  <div style={{ fontFamily: SM, fontSize: 9, color: C.fg3, letterSpacing: '.1em', textTransform: 'uppercase' as const, marginBottom: 8 }}>
                    Activas
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 9 }}>
                  {activas.map(c => (
                    <MesaBtn key={c.id} comanda={c} ptrStart={ptrStart} onVerMesa={onVerMesa} />
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

/* ─── Botón de mesa ─────────────────────────────────────── */
function MesaBtn({
  comanda, ptrStart, onVerMesa,
}: {
  comanda: Comanda
  ptrStart: React.MutableRefObject<{ x: number; y: number } | null>
  onVerMesa: (mesaId: string, mesaCodigo: string, capacidad?: number) => void
}) {
  const mesa   = comanda.mesa
  const col    = colorMesa(comanda)
  const label  = labelEstado(comanda)
  const esCta  = esCuentaPedida(comanda)

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
        padding: '12px 6px 10px',
        borderRadius: 12,
        border: 'none',
        background: col.bg,
        boxShadow: col.border,
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        transition: 'all .15s cubic-bezier(.4,0,.2,1)',
        touchAction: 'manipulation',
        animation: esCta ? 'urgPulse 1.8s ease-in-out infinite' : 'none',
      }}
    >
      {/* Código de mesa */}
      <span style={{
        fontFamily: SE, fontSize: 22, fontWeight: 500,
        color: col.fg, lineHeight: 1,
      }}>
        {mesa?.codigo ?? '?'}
      </span>

      {/* Estado */}
      <span style={{
        fontFamily: SM, fontSize: 8,
        color: col.fg, letterSpacing: '.06em', textTransform: 'uppercase' as const,
        fontWeight: esCta ? 700 : 400,
      }}>
        {label}
      </span>

      {/* Total */}
      {comanda.total_estimado > 0 && (
        <span style={{
          fontFamily: SE, fontStyle: 'italic', fontSize: 13,
          color: esCta ? col.fg : C.fg2, lineHeight: 1, marginTop: 1,
        }}>
          {comanda.total_estimado.toFixed(2).replace('.', ',')}€
        </span>
      )}

      {/* Tiempo */}
      <span style={{
        fontFamily: SM, fontSize: 8, color: C.fg3, lineHeight: 1,
      }}>
        {comanda.minutos_esperando}m
      </span>

      {/* Nombre cuenta si existe */}
      {comanda.nombre_cuenta && (
        <span style={{
          fontFamily: SC, fontSize: 10, color: C.fg3, lineHeight: 1,
          maxWidth: 76, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
        }}>
          {comanda.nombre_cuenta}
        </span>
      )}
    </button>
  )
}

'use client'
// ia.rest · MisCuentasTab — Cuentas pendientes de cobro (estado=cuenta_pedida)
import React, { useState, useEffect, useCallback, useRef } from 'react'

const C = {
  bg:'#F6F1E7', bg1:'#FBF8F1', bg2:'#EFE7D6', bg3:'#E5DAC2',
  ink:'#1A1714', ink2:'#3A332C', ink3:'#6B5F52', ink4:'#9A8D7C',
  rule:'#D8CDB6',
  verm:'#D9442B', vermD:'#A8311E', vermS:'#F4D8CF',
  amb:'#E8A33B', ambS:'#F7E3B6',
  gr:'#3F7D44', grS:'#D4E4D2',
  teal:'#2B6A6E',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"
const SC = "'Caveat',cursive"

interface CuentaItem {
  id: string; nombre: string; cantidad: number
  precio_unitario: number | null; notas: string | null; estado: string
}
export interface Cuenta {
  id: string; estado: string; tipo: string; created_at: string
  numero_ticket: number; num_comensales: number | null
  total_estimado: number; minutos_esperando: number
  nombre_cuenta: string | null
  mesa: { id: string; codigo: string; capacidad: number } | null
  camarero: { id: string; nombre: string } | null
  items: CuentaItem[]
}

interface Props {
  session: { id: string; nombre: string; rol: string; restaurante_id: string }
  onVerMesa: (mesaId: string, mesaCodigo: string, capacidad?: number) => void
  onCountChange: (n: number) => void
}

export default function MisCuentasTab({ session, onVerMesa, onCountChange }: Props) {
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  // sesStr estable para no recrear cargar en cada render
  const sesRef = useRef(JSON.stringify(session))

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/edge/mis-cuentas', {
        headers: { 'x-ia-session': sesRef.current },
      })
      const d = await r.json()
      if (r.ok) {
        const lista: Cuenta[] = d.cuentas ?? []
        setCuentas(lista)
        onCountChange(lista.length)
        setError('')
      } else {
        setError(d.error ?? 'Error al cargar cuentas')
      }
    } catch {
      setError('Sin conexión')
    } finally {
      setLoading(false)
    }
  }, [onCountChange])

  // Carga inicial + polling cada 15s
  useEffect(() => {
    cargar()
    const iv = setInterval(cargar, 15_000)
    return () => clearInterval(iv)
  }, [cargar])

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16, color: C.ink4 }}>Cargando cuentas…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: C.bg, padding: 24 }}>
        <div style={{ fontFamily: SM, fontSize: 12, color: C.verm }}>{error}</div>
        <button onClick={cargar} style={{ background: 'transparent', border: `1px solid ${C.rule}`, color: C.ink3, padding: '8px 18px', borderRadius: 8, fontFamily: SN, fontSize: 12, cursor: 'pointer' }}>
          Reintentar
        </button>
      </div>
    )
  }

  const misCuentas   = cuentas.filter(c => c.camarero?.id === session.id)
  const otrasCuentas = cuentas.filter(c => c.camarero?.id !== session.id)
  const totalPendiente = cuentas.reduce((s, c) => s + c.total_estimado, 0)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>
      {/* ── Header KPIs ── */}
      <div style={{
        padding: '10px 16px', flexShrink: 0,
        background: C.bg1, borderBottom: `1px solid ${C.rule}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16, color: C.ink, flex: 1 }}>Cuentas</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {cuentas.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: C.vermS, border: `1px solid ${C.verm}55`,
              borderRadius: 8, padding: '3px 8px',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.verm, animation: 'ldot 1.2s infinite' }} />
              <span style={{ fontFamily: SM, fontSize: 9, color: C.verm, fontWeight: 700 }}>
                {cuentas.length} PENDIENTE{cuentas.length > 1 ? 'S' : ''}
              </span>
            </div>
          )}
          {cuentas.length > 0 && (
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16, color: C.ink3 }}>
              {totalPendiente.toFixed(2).replace('.', ',')} €
            </div>
          )}
          <button
            onClick={cargar}
            style={{
              background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 8,
              padding: '5px 8px', cursor: 'pointer', color: C.ink4, display: 'flex', alignItems: 'center',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Lista ── */}
      <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' as const, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {cuentas.length === 0 && (
          <div style={{ textAlign: 'center', padding: '52px 20px' }}>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: C.ink4, marginBottom: 6 }}>Sin cuentas pendientes</div>
            <div style={{ fontFamily: SC, fontSize: 14, color: C.ink4 }}>Las cuentas solicitadas aparecerán aquí</div>
          </div>
        )}

        {/* Mis cuentas primero */}
        {misCuentas.length > 0 && (
          <div style={{ fontFamily: SM, fontSize: 9, color: C.ink3, letterSpacing: '.1em', textTransform: 'uppercase' as const, paddingLeft: 2, marginBottom: -2 }}>
            Mis mesas
          </div>
        )}
        {misCuentas.map(c => (
          <CuentaCard key={c.id} cuenta={c} esMia onVerMesa={onVerMesa} />
        ))}

        {/* Otras mesas */}
        {otrasCuentas.length > 0 && (
          <div style={{ fontFamily: SM, fontSize: 9, color: C.ink3, letterSpacing: '.1em', textTransform: 'uppercase' as const, paddingLeft: 2, marginTop: misCuentas.length ? 8 : 0, marginBottom: -2 }}>
            Otras mesas
          </div>
        )}
        {otrasCuentas.map(c => (
          <CuentaCard key={c.id} cuenta={c} esMia={false} onVerMesa={onVerMesa} />
        ))}

        <div style={{ height: 8 }} />
      </div>
    </div>
  )
}

/* ─── Tarjeta individual ────────────────────────────────── */
// touchRef LOCAL en cada card → evita conflictos entre tarjetas durante scroll
function CuentaCard({
  cuenta, esMia, onVerMesa,
}: {
  cuenta: Cuenta
  esMia: boolean
  onVerMesa: (mesaId: string, mesaCodigo: string, capacidad?: number) => void
}) {
  const touchRef = useRef({ startY: 0, moved: false })
  const mesa     = cuenta.mesa
  const min      = cuenta.minutos_esperando
  const urgente  = min >= 5
  const col      = urgente ? C.verm : esMia ? C.gr : C.amb
  const bg       = urgente ? C.vermS : esMia ? C.grS : C.ambS

  const abrirMesa = () => {
    if (!mesa) return
    onVerMesa(mesa.id, mesa.codigo, mesa.capacidad)
  }

  return (
    <div
      onTouchStart={e => { touchRef.current = { startY: e.touches[0].clientY, moved: false } }}
      onTouchMove={e => { if (Math.abs(e.touches[0].clientY - touchRef.current.startY) > 8) touchRef.current.moved = true }}
      onTouchEnd={e => { if (!touchRef.current.moved) { e.preventDefault(); abrirMesa() } }}
      onClick={abrirMesa}
      style={{
        background: C.bg1,
        border: `1px solid ${col}55`,
        borderLeft: `3px solid ${col}`,
        borderRadius: 10,
        overflow: 'hidden',
        cursor: 'pointer',
        boxShadow: urgente ? `0 2px 12px ${C.verm}22` : '0 1px 4px rgba(26,23,20,.06)',
        animation: urgente ? 'urgPulse 1.8s ease-in-out infinite' : 'none',
      }}
    >
      {/* Cabecera */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px 8px', borderBottom: `1px solid ${C.rule}` }}>
        {/* Código mesa */}
        <div style={{ minWidth: 40 }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 24, fontWeight: 500, color: col, lineHeight: 1 }}>
            {mesa?.codigo ?? '?'}
          </div>
          {cuenta.nombre_cuenta && (
            <div style={{ fontFamily: SC, fontSize: 11, color: C.ink3, lineHeight: 1, marginTop: 2 }}>
              {cuenta.nombre_cuenta}
            </div>
          )}
        </div>

        {/* Info central */}
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SM, fontSize: 9, color: col, textTransform: 'uppercase' as const, letterSpacing: '.07em', fontWeight: 700 }}>
            {urgente ? `⚠ Esperando ${min}m` : cuenta.estado === 'cuenta_pedida' ? '⏳ Cuenta pedida' : 'Cuenta por voz'}
          </div>
          <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, marginTop: 2 }}>
            {cuenta.items.length} producto{cuenta.items.length !== 1 ? 's' : ''}
            {cuenta.num_comensales ? ` · ${cuenta.num_comensales} pax` : ''}
            {cuenta.camarero && !esMia && (
              <span style={{ color: C.ink3 }}> · {cuenta.camarero.nombre}</span>
            )}
          </div>
        </div>

        {/* Total + CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, fontWeight: 500, color: C.ink, lineHeight: 1 }}>
            {cuenta.total_estimado > 0
              ? `${cuenta.total_estimado.toFixed(2).replace('.', ',')}€`
              : <span style={{ fontSize: 13, color: C.ink4 }}>Ver total</span>
            }
          </div>
          <div style={{ background: col, borderRadius: 6, padding: '4px 10px', fontFamily: SM, fontSize: 9, color: '#fff', fontWeight: 700 }}>
            COBRAR →
          </div>
        </div>
      </div>

      {/* Resumen items (máx 3) */}
      <div style={{ padding: '6px 14px 8px', display: 'flex', flexDirection: 'column', gap: 3, background: bg + '55' }}>
        {cuenta.items.length === 0 && (
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, fontStyle: 'italic' }}>
            Abre la mesa para ver el detalle completo
          </div>
        )}
        {cuenta.items.slice(0, 3).map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16, color: col, lineHeight: 1, minWidth: 16, textAlign: 'center' }}>
              {it.cantidad}
            </span>
            <span style={{ fontFamily: SN, fontSize: 12, color: C.ink, flex: 1 }}>{it.nombre}</span>
            {it.precio_unitario != null && (
              <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>
                {(it.precio_unitario * it.cantidad).toFixed(2).replace('.', ',')}€
              </span>
            )}
          </div>
        ))}
        {cuenta.items.length > 3 && (
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, fontStyle: 'italic', paddingLeft: 24 }}>
            +{cuenta.items.length - 3} más…
          </div>
        )}
      </div>
    </div>
  )
}

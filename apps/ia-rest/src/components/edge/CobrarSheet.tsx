'use client'
import { C, SE, SN, SM } from '@/lib/colors'
// ia.rest · CobrarSheet v3
// Sheet de cobro — método de pago, propina y numpad. Sin desglose redundante.

import React, { useState, useEffect, useCallback } from 'react'

interface MetodoPago { id: string; nombre: string; tipo: string; icono: string; color: string }

interface Props {
  comandaId: string
  mesaLabel: string
  total: number
  session: { id: string; nombre: string; rol: string }
  onCerrado: (result: { factura: Record<string, unknown>; cambio: number; metodo: string }) => void
  onCancel: () => void
}

// ─── Numpad efectivo (exportado para reusar en DividirSheet) ──────────────
export function NumpadEfectivo({
  total,
  onConfirm,
}: {
  total: number
  onConfirm: (entregado: number) => void
}) {
  const [input, setInput] = useState('')

  const parsed = parseFloat(input.replace(',', '.')) || 0
  const cambio = parsed > total ? Math.round((parsed - total) * 100) / 100 : null
  const falta  = parsed > 0 && parsed < total ? Math.round((total - parsed) * 100) / 100 : null
  const exacto = parsed === total

  const press = (key: string) => {
    if (key === 'C')  { setInput(''); return }
    if (key === '⌫') { setInput(p => p.slice(0, -1)); return }
    if (key === '✓')  { setInput(total.toFixed(2).replace('.', ',')); return }
    if (typeof key === 'string' && key.endsWith('€')) { setInput(key.replace('€', '')); return }
    if (key === ',' && input.includes(',')) return
    const partes = input.split(',')
    if (partes.length === 2 && partes[1].length >= 2) return
    if (!input.includes(',') && input.length >= 6 && key !== ',') return
    setInput(p => p + key)
  }

  const billetes = [5, 10, 20, 50, 100, 200].filter(b => b >= total).slice(0, 3)
  const canConfirm = parsed >= total

  const keyStyle = (col: string = C.dark2): React.CSSProperties => ({
    background: col, border: 'none', borderRadius: 12,
    fontFamily: SM, fontSize: 22, fontWeight: 600, color: '#F6F1E7',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: 60, transition: 'background .08s',
    WebkitTapHighlightColor: 'transparent', userSelect: 'none',
  })

  return (
    <div style={{ background: C.dark1, borderRadius: 16, overflow: 'hidden', margin: '0 20px 14px' }}>

      {/* DISPLAY */}
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #2A2420' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontFamily: SN, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#6B5F52' }}>Total a cobrar</span>
          <span style={{ fontFamily: SM, fontSize: 18, color: '#F6F1E7', fontWeight: 600 }}>
            {total.toFixed(2).replace('.', ',')} €
          </span>
        </div>
        <div style={{ background: '#0D0B09', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 52, marginBottom: 10, border: `1px solid ${input ? '#3A3028' : '#1F1A15'}` }}>
          <span style={{ fontFamily: SN, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#4A4038' }}>Entrega</span>
          <span style={{ fontFamily: SM, fontSize: input ? 28 : 18, fontWeight: 700, color: input ? '#F6F1E7' : '#3A3028', letterSpacing: '-0.5px' }}>
            {input ? `${input} €` : '_ _  €'}
          </span>
        </div>
        {parsed > 0 && (
          <div style={{ borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: cambio ? '#1A2E1B' : falta ? '#2E1A1A' : '#1A2518', border: `1px solid ${cambio ? C.gr + '44' : falta ? C.verm + '44' : C.gr + '44'}` }}>
            <span style={{ fontFamily: SN, fontSize: 12, fontWeight: 700, color: cambio ? C.gr : falta ? C.verm : C.gr }}>
              {cambio ? 'Cambio' : falta ? 'Falta' : '✓ Exacto'}
            </span>
            <span style={{ fontFamily: SM, fontSize: 20, fontWeight: 700, color: cambio ? C.gr : falta ? C.verm : C.gr }}>
              {cambio ? `${cambio.toFixed(2).replace('.', ',')} €` : falta ? `${falta.toFixed(2).replace('.', ',')} €` : ''}
            </span>
          </div>
        )}
      </div>

      {/* ATAJOS BILLETES */}
      <div style={{ padding: '10px 12px 8px', display: 'flex', gap: 6, borderBottom: '1px solid #1F1A15' }}>
        <button onClick={() => press('✓')} style={{ ...keyStyle(C.gr + 'CC'), flex: 1, fontSize: 12, fontWeight: 700, height: 38, borderRadius: 8 }}>Justo</button>
        {billetes.map(b => (
          <button key={b} onClick={() => press(`${b}€`)} style={{ ...keyStyle('#2A2420'), flex: 1, fontSize: 13, height: 38, borderRadius: 8 }}>{b} €</button>
        ))}
      </div>

      {/* NUMPAD 3×4 */}
      <div style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', '⌫'].map(k => (
          <button key={k} onClick={() => press(k)} style={{ ...keyStyle(k === '⌫' ? C.verm + 'CC' : C.dark2), fontSize: k === '⌫' ? 18 : 22 }}>{k}</button>
        ))}
      </div>

      {/* CONFIRMAR */}
      <div style={{ padding: '4px 12px 14px' }}>
        <button
          onClick={() => canConfirm && onConfirm(parsed)}
          disabled={!canConfirm}
          style={{ width: '100%', height: 56, borderRadius: 12, border: 'none', background: canConfirm ? C.gr : '#1F1A15', fontFamily: SN, fontSize: 15, fontWeight: 700, color: canConfirm ? '#fff' : '#4A4038', cursor: canConfirm ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background .15s' }}
        >
          {canConfirm ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              Confirmar efectivo{cambio ? ` · Cambio ${cambio.toFixed(2).replace('.', ',')} €` : exacto ? ' · Exacto' : ''}
            </>
          ) : 'Introduce el importe'}
        </button>
      </div>
    </div>
  )
}

// ─── CobrarSheet ───────────────────────────────────────────────────────────
export default function CobrarSheet({ comandaId, mesaLabel, total, session, onCerrado, onCancel }: Props) {
  const [metodos, setMetodos]     = useState<MetodoPago[]>([])
  const [metodoSel, setMetodoSel] = useState<MetodoPago | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [propina, setPropina]     = useState(0)
  const [propinaInput, setPropinaInput] = useState('')
  // Nuevos: email feedback + propina digital
  const [clienteEmail, setClienteEmail]         = useState('')
  const [propinaDigital, setPropinaDigital]     = useState(false)
  const [propActivas, setPropActivas]           = useState(false)
  const [feedbackActivo, setFeedbackActivo]     = useState(false)
  // Post-cobro: mostrar link propina digital
  const [propinaToken, setPropinaToken]         = useState<string | null>(null)
  const [cobrado, setCobrado]                   = useState(false)

  const totalConPropina = Math.round((total + propina) * 100) / 100
  const session_str = JSON.stringify(session)

  useEffect(() => {
    fetch('/api/metodos-pago', { headers: { 'x-ia-session': session_str } })
      .then(r => r.json())
      .then(d => {
        const lista: MetodoPago[] = d.metodos ?? []
        setMetodos(lista)
        if (lista.length > 0) setMetodoSel(lista[0])
      })
      .catch(() => {
        const demo = [
          { id: 'demo-ef', nombre: 'Efectivo', tipo: 'efectivo', icono: '💵', color: C.gr },
          { id: 'demo-ta', nombre: 'Tarjeta',  tipo: 'tarjeta',  icono: '💳', color: C.teal },
          { id: 'demo-bi', nombre: 'Bizum',    tipo: 'bizum',    icono: '📱', color: C.ink3 },
        ]
        setMetodos(demo)
        setMetodoSel(demo[0])
      })
    // Verificar si propinas y feedback están activos en este restaurante
    fetch('/api/owner/config-cobro', { headers: { 'x-ia-session': session_str } })
      .then(r => r.json())
      .then(d => { setPropActivas(!!d.propinas_activas); setFeedbackActivo(!!d.feedback_activo) })
      .catch(() => {})
  }, [session_str])

  const seleccionarMetodo = (m: MetodoPago) => { setMetodoSel(m); setError('') }

  const cobrar = useCallback(async (entregado?: number) => {
    if (!metodoSel) { setError('Selecciona un método de pago'); return }
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/factura/cerrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ia-session': session_str },
        body: JSON.stringify({
          comanda_id:     comandaId,
          mesa_label:     mesaLabel,
          metodo_id:      metodoSel.id,
          entregado:      metodoSel.tipo === 'efectivo' ? (entregado ?? totalConPropina) : 0,
          propina:        propina > 0 ? propina : undefined,
          cliente_email:  clienteEmail.trim() || undefined,
          propina_digital: propinaDigital,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Error al cobrar'); setLoading(false); return }
      if (d.propina_token) setPropinaToken(d.propina_token)
      setCobrado(true)
      onCerrado({ factura: d.factura, cambio: d.cambio ?? 0, metodo: metodoSel.nombre })
    } catch { setError('Error de red'); setLoading(false) }
  }, [metodoSel, totalConPropina, propina, comandaId, mesaLabel, session_str, clienteEmail, propinaDigital, onCerrado])

  const aplicarPropina = (val: number) => {
    setPropina(val)
    setPropinaInput(val > 0 ? val.toFixed(2).replace('.', ',') : '')
  }

  const onPropinaInputChange = (v: string) => {
    setPropinaInput(v)
    const n = parseFloat(v.replace(',', '.'))
    setPropina(isNaN(n) ? 0 : Math.round(n * 100) / 100)
  }

  const propinaUrl = propinaToken ? `${typeof window !== 'undefined' ? window.location.origin : 'https://www.iarest.es'}/propina/${propinaToken}` : null

  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(26,23,20,.35)', zIndex: 40, backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: C.bg1, borderTop: `1px solid ${C.rule}`, borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', maxHeight: '85dvh', boxShadow: '0 -8px 32px rgba(26,23,20,.14)', fontFamily: SN, color: C.ink, animation: 'slideUp .3s cubic-bezier(.32,1,.28,1)' }}>
        <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}} button:active{opacity:.85;transform:scale(.97)} button{touch-action:manipulation;-webkit-tap-highlight-color:transparent} input{font-size:16px}`}</style>
        <div style={{ width: 36, height: 3, background: C.rule, borderRadius: 2, margin: '10px auto 0', flexShrink: 0 }} />

        {/* HEADER */}
        <div style={{ padding: '12px 20px 10px', borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: C.ink }}>Cobrar · {mesaLabel}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                <div style={{ fontFamily: SM, fontSize: 22, fontWeight: 700, color: C.verm }}>
                  {totalConPropina.toFixed(2).replace('.', ',')} €
                </div>
                {propina > 0 && (
                  <div style={{ fontFamily: SM, fontSize: 11, color: C.gr }}>
                    ({total.toFixed(2).replace('.', ',')} + {propina.toFixed(2).replace('.', ',')} propina)
                  </div>
                )}
              </div>
            </div>
            <button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: 22, color: C.ink3, cursor: 'pointer', padding: 4 }}>×</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' as const }}>

          {/* MÉTODO DE PAGO */}
          <div style={{ padding: '14px 20px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: C.ink4, marginBottom: 10 }}>Método de pago</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {metodos.map(m => {
                const on = metodoSel?.id === m.id
                return (
                  <button key={m.id} onClick={() => seleccionarMetodo(m)} style={{ padding: '12px 8px', borderRadius: 12, background: on ? `${m.color}18` : C.bg2, border: `2px solid ${on ? m.color : C.rule}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', transition: 'all .12s' }}>
                    <span style={{ fontSize: 24 }}>{m.icono}</span>
                    <span style={{ fontSize: 12, fontWeight: on ? 700 : 400, color: on ? m.color : C.ink2 }}>{m.nombre}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* PROPINA EFECTIVO */}
          {!loading && (
            <div style={{ padding: '0 20px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: C.ink4, marginBottom: 10 }}>
                Propina <span style={{ fontWeight: 400, fontSize: 9, letterSpacing: 0, textTransform: 'none' }}>· opcional</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
                {[0, 1, 2, 5].map(v => {
                  const sel = propina === v
                  return (
                    <button key={v} onClick={() => aplicarPropina(v)} style={{ padding: '8px 14px', borderRadius: 10, border: `1.5px solid ${sel ? C.gr : C.rule}`, background: sel ? `${C.gr}18` : C.bg2, fontFamily: SM, fontSize: 13, fontWeight: sel ? 700 : 400, color: sel ? C.gr : C.ink3, cursor: 'pointer', transition: 'all .12s' }}>
                      {v === 0 ? 'Sin propina' : `${v} €`}
                    </button>
                  )
                })}
                <input type="text" inputMode="decimal" placeholder="otro €" value={propinaInput} onChange={e => onPropinaInputChange(e.target.value)} style={{ flex: '1 1 80px', minWidth: 80, padding: '8px 10px', borderRadius: 10, border: `1.5px solid ${propinaInput && propina > 0 && ![1, 2, 5].includes(propina) ? C.gr : C.rule}`, background: C.bg2, fontFamily: SM, fontSize: 13, color: C.ink, outline: 'none' }} />
              </div>
            </div>
          )}

          {/* PROPINA DIGITAL — solo si está activada en el restaurante */}
          {propActivas && !loading && (
            <div style={{ padding: '0 20px 14px' }}>
              <button
                onClick={() => setPropinaDigital(v => !v)}
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
                  background: propinaDigital ? `${C.amb}18` : C.bg2,
                  border: `1.5px solid ${propinaDigital ? C.amb : C.rule}`,
                  display: 'flex', alignItems: 'center', gap: 12,
                  transition: 'all .15s',
                }}>
                <span style={{ fontSize: 22 }}>💝</span>
                <div style={{ textAlign: 'left' as const, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: propinaDigital ? C.amb : C.ink }}>Propina digital</div>
                  <div style={{ fontSize: 11, color: C.ink4, marginTop: 1 }}>El cliente paga con tarjeta desde su móvil</div>
                </div>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${propinaDigital ? C.amb : C.rule}`, background: propinaDigital ? C.amb : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {propinaDigital && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                </div>
              </button>
            </div>
          )}

          {/* EMAIL PARA VALORACIÓN — solo si feedback está activado */}
          {feedbackActivo && !loading && (
            <div style={{ padding: '0 20px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: C.ink4, marginBottom: 8 }}>
                Email para valoración <span style={{ fontWeight: 400, fontSize: 9, letterSpacing: 0, textTransform: 'none' }}>· opcional</span>
              </div>
              <input
                type="email"
                inputMode="email"
                placeholder="cliente@email.com"
                value={clienteEmail}
                onChange={e => setClienteEmail(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: `1.5px solid ${clienteEmail ? C.teal : C.rule}`,
                  background: C.bg2, color: C.ink, fontSize: 14, outline: 'none',
                  boxSizing: 'border-box' as const,
                }}
              />
              {clienteEmail && (
                <div style={{ fontSize: 11, color: C.teal, marginTop: 4 }}>
                  ✓ Recibirá email de valoración en ~30 min
                </div>
              )}
            </div>
          )}

          {/* EFECTIVO: NUMPAD */}
          {metodoSel?.tipo === 'efectivo' && !loading && (
            <NumpadEfectivo total={totalConPropina} onConfirm={(entregado) => cobrar(entregado)} />
          )}

          {/* TARJETA / BIZUM */}
          {metodoSel && metodoSel.tipo !== 'efectivo' && !loading && (
            <div style={{ padding: '0 20px 14px' }}>
              <div style={{ padding: '14px 16px', borderRadius: 12, background: C.bg2, border: `1px solid ${C.rule}`, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <span style={{ fontSize: 28 }}>{metodoSel.icono}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
                    {metodoSel.nombre} · {totalConPropina.toFixed(2).replace('.', ',')} €
                    {propina > 0 && <span style={{ fontWeight: 400, fontSize: 11, color: C.gr }}> (incl. {propina.toFixed(2).replace('.', ',')} propina)</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.ink3, marginTop: 3 }}>
                    {metodoSel.tipo === 'tarjeta' ? 'Pasa el datáfono al cliente' : 'Envía el código QR de Bizum'}
                  </div>
                </div>
              </div>
              <button onClick={() => cobrar()} disabled={loading} style={{ width: '100%', height: 54, borderRadius: 12, border: 'none', background: loading ? C.rule : C.verm, fontFamily: SN, fontSize: 15, fontWeight: 700, color: '#fff', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background .15s,opacity .15s' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
                {loading ? 'Procesando…' : `Confirmar cobro · ${totalConPropina.toFixed(2).replace('.', ',')} €`}
              </button>
            </div>
          )}

          {/* POST-COBRO: link propina digital */}
          {propinaToken && propinaUrl && (
            <div style={{ margin: '0 20px 16px', padding: '16px', background: `${C.amb}18`, border: `1.5px solid ${C.amb}`, borderRadius: 14 }}>
              <div style={{ fontWeight: 700, color: C.amb, fontSize: 14, marginBottom: 6 }}>💝 Propina digital lista</div>
              <div style={{ fontSize: 12, color: C.ink3, marginBottom: 12 }}>Muestra este link al cliente para que pague desde su móvil</div>
              <div style={{ background: C.dark, borderRadius: 8, padding: '8px 12px', fontSize: 11, color: C.ink3, wordBreak: 'break-all' as const, marginBottom: 10 }}>
                {propinaUrl}
              </div>
              <button
                onClick={() => { navigator.clipboard?.writeText(propinaUrl); }}
                style={{ width: '100%', padding: '10px', background: C.amb, border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Copiar link
              </button>
            </div>
          )}

          {loading && (
            <div style={{ padding: '24px 20px', textAlign: 'center' }}>
              <div style={{ fontFamily: SM, fontSize: 13, color: C.ink3 }}>Generando factura…</div>
            </div>
          )}

          {error && (
            <div style={{ margin: '0 20px 14px', padding: '10px 14px', borderRadius: 8, background: C.vermS, border: `1px solid ${C.verm}44`, fontFamily: SM, fontSize: 11, color: C.verm }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

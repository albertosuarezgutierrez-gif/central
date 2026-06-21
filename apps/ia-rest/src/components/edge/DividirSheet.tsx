'use client'
import { C, SE, SN, SM } from '@/lib/colors'
// ia.rest · DividirSheet v1.0
// Divide la cuenta en N partes iguales. Cobra cada parte con método distinto si se quiere.

import React, { useState, useEffect } from 'react'
import { NumpadEfectivo } from './CobrarSheet'

interface MetodoPago { id: string; nombre: string; tipo: string; icono: string; color: string }

interface Props {
  comandaId:  string
  mesaLabel:  string
  total:      number
  session:    { id: string; nombre: string; rol: string }
  onCobrado:  () => void
  onCancel:   () => void
}

function fmtEur(v: number) {
  return v.toFixed(2).replace('.', ',') + ' €'
}

export default function DividirSheet({ comandaId, mesaLabel, total, session, onCobrado, onCancel }: Props) {
  const [numPartes, setNumPartes]   = useState(2)
  const [inputPartes, setInputPartes] = useState('')
  const [fase, setFase]             = useState<'selector' | 'cobro'>('selector')
  const [parteActual, setParteActual] = useState(1)
  const [metodos, setMetodos]       = useState<MetodoPago[]>([])
  const [metodoSel, setMetodoSel]   = useState<MetodoPago | null>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [partesPagadas, setPartesPagadas] = useState<number[]>([])

  const session_str = JSON.stringify(session)

  // Calcular importe por parte (última absorbe decimales)
  const importeParte = (parte: number): number => {
    const base = Math.floor((total / numPartes) * 100) / 100
    if (parte === numPartes) {
      const yaRepartido = base * (numPartes - 1)
      return Math.round((total - yaRepartido) * 100) / 100
    }
    return base
  }

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
  }, [session_str])

  const cobrarParte = async (entregado?: number) => {
    if (!metodoSel) { setError('Selecciona método de pago'); return }
    setLoading(true); setError('')
    const importe = importeParte(parteActual)
    try {
      const r = await fetch('/api/factura/pago-parcial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ia-session': session_str },
        body: JSON.stringify({
          comanda_id:     comandaId,
          mesa_label:     mesaLabel,
          metodo_id:      metodoSel.id,
          importe_parcial: importe,
          parte_num:      parteActual,
          total_partes:   numPartes,
          entregado:      metodoSel.tipo === 'efectivo' ? (entregado ?? importe) : 0,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Error al cobrar'); setLoading(false); return }

      setPartesPagadas(prev => [...prev, parteActual])

      if (d.cerrada) {
        // última parte — cuenta cerrada
        onCobrado()
        return
      }

      // Avanzar a siguiente parte
      setParteActual(prev => prev + 1)
      setMetodoSel(metodos[0] ?? null)
      setLoading(false)
    } catch {
      setError('Error de red')
      setLoading(false)
    }
  }

  const importe = importeParte(parteActual)
  const esUltima = parteActual === numPartes

  /* ── Selector de número de partes ─────────────────────────── */
  if (fase === 'selector') {
    return (
      <>
        <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(26,23,20,.35)', zIndex: 40, backdropFilter: 'blur(2px)' }} />
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: C.bg1, borderTop: `1px solid ${C.rule}`, borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', maxHeight: '70dvh', boxShadow: '0 -8px 32px rgba(26,23,20,.14)', animation: 'slideUp .3s cubic-bezier(.32,1,.28,1)' }}>
          <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}} button:active{opacity:.85;transform:scale(.97)} button{touch-action:manipulation;-webkit-tap-highlight-color:transparent}`}</style>
          <div style={{ width: 36, height: 3, background: C.rule, borderRadius: 2, margin: '10px auto 0' }} />

          {/* Header */}
          <div style={{ padding: '12px 20px 10px', borderBottom: `1px solid ${C.rule}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: C.ink }}>Dividir · {mesaLabel}</div>
                <div style={{ fontFamily: SM, fontSize: 13, color: C.ink3, marginTop: 2 }}>{fmtEur(total)} en total</div>
              </div>
              <button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: 22, color: C.ink3, cursor: 'pointer', padding: 4 }}>×</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 28px' }}>

            {/* Número de partes */}
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: C.ink4, marginBottom: 12 }}>¿En cuántas partes?</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
              {[2, 3, 4, 5].map(n => {
                const sel = numPartes === n && !inputPartes
                return (
                  <button key={n} onClick={() => { setNumPartes(n); setInputPartes('') }} style={{ padding: '14px 8px', borderRadius: 12, border: `2px solid ${sel ? C.verm : C.rule}`, background: sel ? `${C.verm}18` : C.bg2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', transition: 'all .12s' }}>
                    <span style={{ fontFamily: SM, fontSize: 22, fontWeight: 700, color: sel ? C.verm : C.ink }}>{n}</span>
                    <span style={{ fontFamily: SN, fontSize: 10, color: sel ? C.verm : C.ink4 }}>partes</span>
                  </button>
                )
              })}
            </div>

            {/* Input custom */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>Otro número:</span>
              <input
                type="number" min={2} max={20} inputMode="numeric"
                value={inputPartes}
                onChange={e => {
                  const v = e.target.value
                  setInputPartes(v)
                  const n = parseInt(v)
                  if (!isNaN(n) && n >= 2 && n <= 20) setNumPartes(n)
                }}
                placeholder="ej: 6"
                style={{ width: 70, padding: '8px 10px', borderRadius: 10, border: `1.5px solid ${inputPartes ? C.verm : C.rule}`, background: C.bg2, fontFamily: SM, fontSize: 15, color: C.ink, outline: 'none', textAlign: 'center' }}
              />
            </div>

            {/* Preview de partes */}
            <div style={{ background: C.bg2, borderRadius: 12, padding: '14px 16px', marginBottom: 20, border: `1px solid ${C.rule}` }}>
              <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginBottom: 10 }}>{numPartes} partes de:</div>
              {Array.from({ length: numPartes }, (_, i) => i + 1).map(n => (
                <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: n < numPartes ? `1px solid ${C.rule}` : 'none' }}>
                  <span style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>Parte {n}{n === numPartes && numPartes > 1 ? ' *' : ''}</span>
                  <span style={{ fontFamily: SM, fontSize: 14, fontWeight: 600, color: C.ink }}>{fmtEur(importeParte(n))}</span>
                </div>
              ))}
              {numPartes > 1 && (
                <div style={{ fontFamily: SN, fontSize: 10, color: C.ink4, marginTop: 8 }}>* La última parte absorbe el redondeo</div>
              )}
            </div>

            {/* Botón empezar */}
            <button
              onClick={() => setFase('cobro')}
              style={{ width: '100%', height: 54, borderRadius: 12, border: 'none', background: C.verm, fontFamily: SN, fontSize: 15, fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              Empezar cobro dividido
            </button>
          </div>
        </div>
      </>
    )
  }

  /* ── Cobro de partes ──────────────────────────────────────── */
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,23,20,.35)', zIndex: 40, backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: C.bg1, borderTop: `1px solid ${C.rule}`, borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', maxHeight: '90dvh', boxShadow: '0 -8px 32px rgba(26,23,20,.14)', animation: 'slideUp .3s cubic-bezier(.32,1,.28,1)', fontFamily: SN, color: C.ink }}>
        <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}} button:active{opacity:.85;transform:scale(.97)} button{touch-action:manipulation;-webkit-tap-highlight-color:transparent} input{font-size:16px}`}</style>
        <div style={{ width: 36, height: 3, background: C.rule, borderRadius: 2, margin: '10px auto 0', flexShrink: 0 }} />

        {/* Header */}
        <div style={{ padding: '12px 20px 10px', borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 19, color: C.ink }}>
                Parte {parteActual}/{numPartes} · {mesaLabel}
              </div>
              <div style={{ fontFamily: SM, fontSize: 22, fontWeight: 700, color: C.verm, marginTop: 2 }}>
                {fmtEur(importe)}
              </div>
            </div>
            {/* Progreso dots */}
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              {Array.from({ length: numPartes }, (_, i) => {
                const n = i + 1
                const pagada  = partesPagadas.includes(n)
                const activa  = n === parteActual
                return (
                  <div key={n} style={{ width: activa ? 22 : 10, height: 10, borderRadius: 5, background: pagada ? C.gr : activa ? C.verm : C.bg2, border: `1.5px solid ${pagada ? C.gr : activa ? C.verm : C.rule}`, transition: 'all .2s' }} />
                )
              })}
            </div>
          </div>

          {/* Partes ya cobradas */}
          {partesPagadas.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {partesPagadas.map(p => (
                <span key={p} style={{ fontFamily: SN, fontSize: 10, background: `${C.gr}22`, color: C.gr, border: `1px solid ${C.gr}44`, borderRadius: 6, padding: '2px 7px', fontWeight: 600 }}>
                  ✓ Parte {p} · {fmtEur(importeParte(p))}
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' as const }}>

          {/* Método de pago */}
          <div style={{ padding: '14px 20px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: C.ink4, marginBottom: 10 }}>Método de pago</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {metodos.map(m => {
                const on = metodoSel?.id === m.id
                return (
                  <button key={m.id} onClick={() => { setMetodoSel(m); setError('') }} style={{ padding: '12px 8px', borderRadius: 12, background: on ? `${m.color}18` : C.bg2, border: `2px solid ${on ? m.color : C.rule}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', transition: 'all .12s' }}>
                    <span style={{ fontSize: 24 }}>{m.icono}</span>
                    <span style={{ fontSize: 12, fontWeight: on ? 700 : 400, color: on ? m.color : C.ink2 }}>{m.nombre}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Numpad efectivo */}
          {metodoSel?.tipo === 'efectivo' && !loading && (
            <NumpadEfectivo total={importe} onConfirm={(entregado) => cobrarParte(entregado)} />
          )}

          {/* Tarjeta / Bizum */}
          {metodoSel && metodoSel.tipo !== 'efectivo' && !loading && (
            <div style={{ padding: '0 20px 14px' }}>
              <div style={{ padding: '14px 16px', borderRadius: 12, background: C.bg2, border: `1px solid ${C.rule}`, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <span style={{ fontSize: 28 }}>{metodoSel.icono}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{metodoSel.nombre} · {fmtEur(importe)}</div>
                  <div style={{ fontSize: 12, color: C.ink3, marginTop: 3 }}>
                    {metodoSel.tipo === 'tarjeta' ? 'Pasa el datáfono al cliente' : 'Envía el código QR de Bizum'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => cobrarParte()}
                disabled={loading}
                style={{ width: '100%', height: 54, borderRadius: 12, border: 'none', background: loading ? C.rule : (esUltima ? C.gr : C.verm), fontFamily: SN, fontSize: 15, fontWeight: 700, color: '#fff', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background .15s,opacity .15s' }}
              >
                {loading ? 'Procesando…' : esUltima ? `✓ Cobrar última parte · ${fmtEur(importe)}` : `Cobrar parte ${parteActual} · ${fmtEur(importe)}`}
              </button>
            </div>
          )}

          {loading && (
            <div style={{ padding: '24px 20px', textAlign: 'center' }}>
              <div style={{ fontFamily: SM, fontSize: 13, color: C.ink3 }}>{esUltima ? 'Generando factura…' : 'Procesando pago…'}</div>
            </div>
          )}

          {error && (
            <div style={{ margin: '0 20px 14px', padding: '10px 14px', borderRadius: 8, background: C.vermS, border: `1px solid ${C.verm}44`, fontFamily: SM, fontSize: 11, color: C.verm }}>{error}</div>
          )}
        </div>
      </div>
    </>
  )
}

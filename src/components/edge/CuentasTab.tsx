'use client'
import { C, SE, SN, SM, SC } from '@/lib/colors'
// ia.rest · CuentasTab v1.0
// Tab de gestión de cuentas para /edge — pedir cuenta y cobrar desde móvil

import React, { useState, useCallback } from 'react'
import CobrarSheet from './CobrarSheet'
import { Comanda } from '@/types'
import { MesaPlano } from '@/components/PlanoSala'

/* ─── Paleta crema (igual que /edge) ───────────────────────── */

interface Props {
  comandas: Comanda[]
  mesasPlano: MesaPlano[]
  session: { id: string; nombre: string; rol: string }
  onCobrado: () => void
}

function calcTotal(comanda: Comanda): number {
  return Math.round(
    (comanda.items ?? []).reduce(
      (s, it) => s + ((it as { precio_unitario?: number | null }).precio_unitario ?? 0) * it.cantidad,
      0
    ) * 100
  ) / 100
}

function fmtEur(v: number): string {
  return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€'
}

export default function CuentasTab({ comandas, mesasPlano, session, onCobrado }: Props) {
  const session_str = JSON.stringify(session)

  const [expanded,     setExpanded]     = useState<string | null>(null)
  const [pedirLoading, setPedirLoading] = useState<string | null>(null)
  const [pedirError,   setPedirError]   = useState<string | null>(null)
  const [cobrarComanda, setCobrarComanda] = useState<{
    id: string; label: string; total: number
  } | null>(null)

  /* ── Agrupar mesas ──────────────────────────────────────── */
  const cuentasPedidas = comandas.filter(
    c => c.estado === 'cuenta_pedida' && (c.items?.length ?? 0) > 0
  )
  const abiertas = comandas.filter(
    c => ['nueva', 'en_cocina', 'lista'].includes(c.estado) && (c.items?.length ?? 0) > 0
  )

  // Mesas ocupadas (por id)
  const mesasOcupadasIds = new Set([...cuentasPedidas, ...abiertas].map(c => c.mesa_id))

  /* ── KPIs ───────────────────────────────────────────────── */
  const totalPendiente = [...cuentasPedidas, ...abiertas].reduce(
    (sum, c) => sum + calcTotal(c),
    0
  )

  /* ── Pedir cuenta ───────────────────────────────────────── */
  const pedirCuenta = useCallback(async (comandaId: string) => {
    setPedirLoading(comandaId)
    setPedirError(null)
    try {
      const r = await fetch(`/api/comanda/${comandaId}/pedir-cuenta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ia-session': session_str },
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setPedirError(d.error ?? 'Error al pedir cuenta')
        setTimeout(() => setPedirError(null), 4000)
      }
    } catch {
      setPedirError('Sin conexión')
      setTimeout(() => setPedirError(null), 4000)
    } finally {
      setPedirLoading(null)
    }
  }, [session_str])

  /* ── Toggle card expand ─────────────────────────────────── */
  const toggle = (id: string) => setExpanded(prev => prev === id ? null : id)

  /* ── Renderizar card de comanda ─────────────────────────── */
  const renderComandaCard = (comanda: Comanda, tipo: 'cuenta_pedida' | 'abierta') => {
    const mesaCodigo = (comanda.mesa as { codigo?: string } | null)?.codigo ?? '?'
    const total      = calcTotal(comanda)
    const isOpen     = expanded === comanda.id
    const cargando   = pedirLoading === comanda.id
    const esCuenta   = tipo === 'cuenta_pedida'
    const items      = (comanda.items ?? []) as { id: string; nombre: string; cantidad: number; notas: string | null; precio_unitario?: number | null }[]
    const minutosAbierta = Math.floor(
      (Date.now() - new Date(comanda.created_at).getTime()) / 60000
    )

    return (
      <div
        key={comanda.id}
        style={{
          background: C.bg1,
          border: `1px solid ${isOpen ? C.rule : C.rule}`,
          borderRadius: 10,
          marginBottom: 8,
          overflow: 'hidden',
          boxShadow: esCuenta ? `0 0 0 2px ${C.vermS}` : undefined,
        }}
      >
        {/* ── Fila principal ── */}
        <button
          onClick={() => toggle(comanda.id)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            padding: '11px 13px',
            gap: 10,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {/* Badge mesa */}
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontFamily: SM,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.02em',
            background: esCuenta ? C.ink : C.ambS,
            color: esCuenta ? '#fff' : C.amb,
            border: `1px solid ${esCuenta ? C.ink : C.amb}44`,
          }}>
            {mesaCodigo.length > 3 ? mesaCodigo.slice(0, 3) : mesaCodigo}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>
              Mesa {mesaCodigo}
              {(comanda as unknown as { nombre_cuenta?: string | null }).nombre_cuenta && (
                <span style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginLeft: 5 }}>
                  · {(comanda as unknown as { nombre_cuenta?: string | null }).nombre_cuenta}
                </span>
              )}
            </div>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginTop: 1 }}>
              {comanda.num_comensales ? `${comanda.num_comensales} com. · ` : ''}
              {items.length} artículo{items.length !== 1 ? 's' : ''}
              {' · '}{minutosAbierta < 60 ? `${minutosAbierta}min` : `${Math.floor(minutosAbierta / 60)}h`}
            </div>
          </div>

          {/* Total + estado */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16, fontWeight: 600, color: C.ink }}>
              {fmtEur(total)}
            </div>
            <div style={{
              fontFamily: SN, fontSize: 10, marginTop: 1,
              color: esCuenta ? C.verm : C.amb,
              fontWeight: 600,
            }}>
              {esCuenta ? 'Cta. pedida' : 'Abierta'}
            </div>
          </div>

          {/* Chevron */}
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={C.ink4} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ flexShrink: 0, transition: 'transform .2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}
          >
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>

        {/* ── Detalle expandido ── */}
        {isOpen && (
          <div style={{ borderTop: `1px solid ${C.bg2}`, padding: '0 13px 13px' }}>

            {/* Banner cuenta pedida */}
            {esCuenta && (
              <div style={{
                background: C.vermS,
                border: `1px solid ${C.verm}33`,
                borderRadius: 7,
                padding: '7px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                margin: '10px 0 8px',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.verm} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span style={{ fontFamily: SN, fontSize: 11, color: C.vermD, fontWeight: 600 }}>
                  La mesa ha pedido la cuenta
                </span>
              </div>
            )}

            {/* Lista de items */}
            <div style={{ margin: '8px 0' }}>
              {items.map((it, idx) => (
                <div key={it.id ?? idx}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    padding: '4px 0',
                    borderBottom: idx < items.length - 1 ? `1px solid ${C.bg2}` : 'none',
                    gap: 6,
                  }}>
                    <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4, width: 20, flexShrink: 0 }}>
                      {it.cantidad}×
                    </span>
                    <span style={{ fontFamily: SN, fontSize: 12, color: C.ink2, flex: 1 }}>
                      {it.nombre}
                    </span>
                    <span style={{ fontFamily: SN, fontSize: 12, color: C.ink, fontWeight: 600 }}>
                      {it.precio_unitario != null
                        ? fmtEur(it.precio_unitario * it.cantidad)
                        : '—'}
                    </span>
                  </div>
                  {it.notas && (
                    <div style={{
                      fontFamily: SN, fontSize: 10,
                      color: it.notas.toUpperCase().includes('GLUTEN') || it.notas.toUpperCase().includes('ALERGI')
                        ? C.verm : C.ink3,
                      fontWeight: it.notas.toUpperCase().includes('GLUTEN') || it.notas.toUpperCase().includes('ALERGI')
                        ? 700 : 400,
                      fontStyle: 'italic',
                      padding: '2px 0 2px 26px',
                    }}>
                      {it.notas}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Total */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              padding: '8px 0 10px',
              borderTop: `1px solid ${C.bg2}`,
              marginTop: 4,
            }}>
              <span style={{ fontFamily: SN, fontSize: 14, fontWeight: 700, color: C.ink }}>Total</span>
              <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, fontWeight: 600, color: C.ink }}>
                {fmtEur(total)}
              </span>
            </div>

            {/* Error feedback */}
            {pedirError && pedirLoading === null && (
              <div style={{
                background: C.vermS, border: `1px solid ${C.verm}44`,
                borderRadius: 7, padding: '6px 10px', marginBottom: 8,
                fontFamily: SN, fontSize: 11, color: C.vermD,
              }}>
                {pedirError}
              </div>
            )}

            {/* Botones de acción */}
            <div style={{ display: 'flex', gap: 8 }}>
              {!esCuenta ? (
                /* Mesa abierta → botón pedir cuenta */
                <button
                  onClick={() => pedirCuenta(comanda.id)}
                  disabled={cargando}
                  style={{
                    flex: 1,
                    padding: '10px 8px',
                    borderRadius: 8,
                    border: `1px solid ${C.rule}`,
                    background: cargando ? C.bg2 : C.bg2,
                    color: cargando ? C.ink4 : C.ink3,
                    fontFamily: SN,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: cargando ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="9" y1="13" x2="15" y2="13"/>
                    <line x1="9" y1="17" x2="11" y2="17"/>
                  </svg>
                  {cargando ? 'Enviando...' : 'Pedir cuenta'}
                </button>
              ) : (
                /* Cuenta pedida → botón dividir (ghost) */
                <button
                  onClick={() => {/* TODO dividir */}}
                  style={{
                    flex: 0.65,
                    padding: '10px 8px',
                    borderRadius: 8,
                    border: `1px solid ${C.rule}`,
                    background: 'transparent',
                    color: C.ink3,
                    fontFamily: SN,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  Dividir
                </button>
              )}

              {/* Cobrar — siempre visible cuando hay cuenta pedida o abierta */}
              <button
                onClick={() => setCobrarComanda({ id: comanda.id, label: mesaCodigo, total })}
                style={{
                  flex: 1,
                  padding: '10px 8px',
                  borderRadius: 8,
                  border: 'none',
                  background: C.ink,
                  color: '#fff',
                  fontFamily: SN,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                  <line x1="1" y1="10" x2="23" y2="10"/>
                </svg>
                Cobrar
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ── Section label ──────────────────────────────────────── */
  const SecLabel = ({ label }: { label: string }) => (
    <div style={{
      fontFamily: SN,
      fontSize: 9,
      fontWeight: 700,
      color: C.ink4,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      margin: '14px 0 7px',
    }}>
      {label}
    </div>
  )

  /* ── Render principal ───────────────────────────────────── */
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>

      {/* Scroll body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px 20px' }}>

        {/* KPIs */}
        <div style={{ display: 'flex', gap: 7, marginBottom: 4 }}>
          {/* Abiertas */}
          <div style={{
            flex: 1, background: C.bg1, borderRadius: 9,
            padding: '9px 11px', border: `1px solid ${C.rule}`,
          }}>
            <div style={{ fontFamily: SN, fontSize: 9, color: C.ink4, marginBottom: 2, fontWeight: 500 }}>
              Abiertas
            </div>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, fontWeight: 700, color: C.amb }}>
              {abiertas.length}
            </div>
          </div>

          {/* Cuenta pedida */}
          <div style={{
            flex: 1, background: C.bg1, borderRadius: 9,
            padding: '9px 11px', border: `1px solid ${C.rule}`,
            boxShadow: cuentasPedidas.length > 0 ? `0 0 0 2px ${C.vermS}` : undefined,
          }}>
            <div style={{ fontFamily: SN, fontSize: 9, color: C.ink4, marginBottom: 2, fontWeight: 500 }}>
              Cta. pedida
            </div>
            <div style={{
              fontFamily: SE, fontStyle: 'italic', fontSize: 22, fontWeight: 700,
              color: cuentasPedidas.length > 0 ? C.verm : C.ink4,
            }}>
              {cuentasPedidas.length}
            </div>
          </div>

          {/* Total pendiente */}
          <div style={{
            flex: 1, background: C.bg1, borderRadius: 9,
            padding: '9px 11px', border: `1px solid ${C.rule}`,
          }}>
            <div style={{ fontFamily: SN, fontSize: 9, color: C.ink4, marginBottom: 2, fontWeight: 500 }}>
              Pendiente
            </div>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, fontWeight: 700, color: C.ink }}>
              {fmtEur(totalPendiente)}
            </div>
          </div>
        </div>

        {/* ── CUENTA PEDIDA ── */}
        {cuentasPedidas.length > 0 && (
          <>
            <SecLabel label="Cuenta pedida" />
            {cuentasPedidas.map(c => renderComandaCard(c, 'cuenta_pedida'))}
          </>
        )}

        {/* ── ABIERTAS ── */}
        {abiertas.length > 0 && (
          <>
            <SecLabel label="Comandas abiertas" />
            {abiertas.map(c => renderComandaCard(c, 'abierta'))}
          </>
        )}

        {/* Estado vacío */}
        {cuentasPedidas.length === 0 && abiertas.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '60px 20px', color: C.ink4,
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={C.rule} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
            </svg>
            <div style={{ fontFamily: SN, fontSize: 13, color: C.ink4, textAlign: 'center', lineHeight: 1.5 }}>
              Sin comandas abiertas
            </div>
          </div>
        )}

        <div style={{ paddingBottom: 8 }} />
      </div>

      {/* ── CobrarSheet overlay ── */}
      {cobrarComanda && (
        <CobrarSheet
          comandaId={cobrarComanda.id}
          mesaLabel={cobrarComanda.label}
          total={cobrarComanda.total}
          session={session}
          onCerrado={() => {
            setCobrarComanda(null)
            onCobrado()
          }}
          onCancel={() => setCobrarComanda(null)}
        />
      )}
    </div>
  )
}

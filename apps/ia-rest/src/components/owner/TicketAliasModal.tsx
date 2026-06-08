'use client'
import { SE, SN, SM } from '@/lib/colors'
// ia.rest · TicketAliasModal
// Permite a owner/jefe_sala renombrar conceptos en el ticket impreso
// Los totales y la factura VeriFactu NO se modifican jamás
// Solo visual: útil para comerciales que pagan sin incluir alcohol, etc.

import React, { useState, useEffect, useCallback } from 'react'

const C = {
  bg: '#1C1815', bg1: '#242018', bg2: '#2C2820',
  ink: '#F6F1E7', ink2: '#D8CDB6', ink3: '#9A8D7C', ink4: '#6B5F52',
  rule: '#3A332C',
  verm: '#D9442B', vermD: '#A8311E', vermS: '#4A1E16',
  amb: '#E8A33B', ambS: '#3A2A0E',
  gr: '#3F7D44', grS: '#1A2E1C',
}

interface ComandaItem {
  id: string
  nombre: string
  cantidad: number
  precio_unitario: number | null
}

interface AliasItem {
  comanda_item_id: string
  nombre_original: string
  nombre_alias: string | null
}

interface Props {
  comandaId: string
  mesaLabel: string
  items: ComandaItem[]
  session: { id: string; nombre: string; rol: string }
  onClose: () => void
  onGuardado: () => void
}

export default function TicketAliasModal({
  comandaId, mesaLabel, items, session, onClose, onGuardado,
}: Props) {
  const [aliases, setAliases] = useState<Record<string, string>>({})
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingInit, setLoadingInit] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)

  // Cargar alias existente si lo hay
  useEffect(() => {
    fetch(`/api/comanda/${comandaId}/ticket-alias`)
      .then(r => r.json())
      .then(d => {
        if (d.alias) {
          const map: Record<string, string> = {}
          for (const it of d.alias.items) {
            if (it.nombre_alias) map[it.comanda_item_id] = it.nombre_alias
          }
          setAliases(map)
          setMotivo(d.alias.motivo ?? '')
        }
      })
      .catch(() => null)
      .finally(() => setLoadingInit(false))
  }, [comandaId])

  const handleSave = useCallback(async () => {
    setLoading(true)
    setError(null)

    const aliasItems: AliasItem[] = items.map(it => ({
      comanda_item_id: it.id,
      nombre_original: it.nombre,
      nombre_alias: aliases[it.id]?.trim() || null,
    }))

    try {
      const r = await fetch(`/api/comanda/${comandaId}/ticket-alias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: aliasItems, motivo: motivo.trim() || null }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error ?? 'Error al guardar'); return }
      setGuardado(true)
      setTimeout(() => { onGuardado(); onClose() }, 1200)
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }, [aliases, items, motivo, comandaId, onClose, onGuardado])

  const numModificados = items.filter(it => aliases[it.id]?.trim()).length

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(10,8,6,.85)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: C.bg, borderRadius: 20, width: '100%', maxWidth: 520,
        maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        border: `1px solid ${C.rule}`,
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: `1px solid ${C.rule}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <div style={{ fontFamily: SE, fontSize: 20, color: C.ink, fontWeight: 600 }}>
              Ticket personalizado
            </div>
            <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, marginTop: 2 }}>
              {mesaLabel} · {items.length} {items.length === 1 ? 'concepto' : 'conceptos'}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: C.ink3, fontSize: 22, lineHeight: 1, padding: 4,
          }}>×</button>
        </div>

        {/* Aviso legal */}
        <div style={{
          margin: '16px 24px 0',
          background: C.ambS, border: `1px solid ${C.amb}`,
          borderRadius: 10, padding: '10px 14px',
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 16, marginTop: 1 }}>⚠</span>
          <div style={{ fontFamily: SN, fontSize: 12, color: C.amb, lineHeight: 1.5 }}>
            <strong>Solo visual.</strong> Los cambios afectan únicamente al ticket impreso.
            La factura fiscal VeriFactu mantiene siempre los conceptos originales.
          </div>
        </div>

        {/* Lista de items */}
        <div style={{ overflow: 'auto', padding: '16px 24px', flex: 1 }}>
          {loadingInit ? (
            <div style={{ textAlign: 'center', color: C.ink3, padding: 24, fontFamily: SN, fontSize: 13 }}>
              Cargando…
            </div>
          ) : (
            <>
              {items.map(item => (
                <div key={item.id} style={{ marginBottom: 12 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', marginBottom: 4,
                  }}>
                    {/* Nombre original */}
                    <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>
                      <span style={{
                        fontFamily: SM, fontSize: 11,
                        background: C.bg2, padding: '1px 6px',
                        borderRadius: 4, marginRight: 6, color: C.ink4,
                      }}>{item.cantidad}×</span>
                      <span style={{ textDecoration: aliases[item.id]?.trim() ? 'line-through' : 'none' }}>
                        {item.nombre}
                      </span>
                    </div>
                    <span style={{ fontFamily: SM, fontSize: 12, color: C.ink4 }}>
                      {((item.precio_unitario ?? 0) * item.cantidad).toFixed(2)}€
                    </span>
                  </div>
                  {/* Campo alias */}
                  <input
                    type="text"
                    placeholder={`Nombre en ticket (dejar vacío = "${item.nombre}")`}
                    value={aliases[item.id] ?? ''}
                    onChange={e => setAliases(prev => ({
                      ...prev,
                      [item.id]: e.target.value,
                    }))}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: aliases[item.id]?.trim() ? C.grS : C.bg1,
                      border: `1px solid ${aliases[item.id]?.trim() ? C.gr : C.rule}`,
                      borderRadius: 8, padding: '8px 12px',
                      fontFamily: SN, fontSize: 14, color: C.ink,
                      outline: 'none',
                    }}
                  />
                </div>
              ))}

              {/* Motivo */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Motivo (opcional)
                </div>
                <input
                  type="text"
                  placeholder="Ej: Comercial empresa, Gasto representación…"
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: C.bg1, border: `1px solid ${C.rule}`,
                    borderRadius: 8, padding: '8px 12px',
                    fontFamily: SN, fontSize: 14, color: C.ink, outline: 'none',
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: `1px solid ${C.rule}`,
          display: 'flex', gap: 10,
        }}>
          <button onClick={onClose} style={{
            flex: 1, background: C.bg1, border: `1px solid ${C.rule}`,
            borderRadius: 10, padding: '12px 16px',
            fontFamily: SN, fontSize: 14, color: C.ink2, cursor: 'pointer',
          }}>
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={loading || loadingInit || guardado}
            style={{
              flex: 2,
              background: guardado ? C.gr : loading ? C.bg2 : C.verm,
              border: 'none', borderRadius: 10, padding: '12px 16px',
              fontFamily: SN, fontSize: 14, fontWeight: 700,
              color: loading ? C.ink3 : C.ink, cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background .2s',
            }}
          >
            {guardado ? '✓ Guardado' : loading ? 'Guardando…' : (
              numModificados > 0
                ? `Guardar (${numModificados} cambio${numModificados > 1 ? 's' : ''})`
                : 'Guardar ticket personalizado'
            )}
          </button>
        </div>

        {error && (
          <div style={{
            padding: '10px 24px 16px',
            fontFamily: SN, fontSize: 13, color: C.verm, textAlign: 'center',
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

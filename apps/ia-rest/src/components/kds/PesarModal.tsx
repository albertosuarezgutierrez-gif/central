'use client'
import { useState, useCallback } from 'react'

const K = {
  bg: '#1C1814', fg: '#F6F1E7', fg2: '#D8CDB6', fg3: '#8A7B6E',
  rule: '#2E2822', rS: '#3A3028', red: '#D9442B', amb: '#E8A33B',
  gr: '#3F7D44', btn: '#D9442B', btnHover: '#A8311E',
}

interface PesarModalProps {
  item: {
    id: string
    nombre: string
    precio_por_kg?: number | null
  }
  onConfirm: (pesoGramos: number, precioCalculado: number) => void
  onClose: () => void
  loading?: boolean
}

export default function PesarModal({ item, onConfirm, onClose, loading }: PesarModalProps) {
  const [gramos, setGramos] = useState('')

  const precioCalculado = item.precio_por_kg && gramos
    ? parseFloat((item.precio_por_kg * Number(gramos) / 1000).toFixed(2))
    : null

  const append = useCallback((digit: string) => {
    setGramos(prev => {
      if (prev === '0') return digit
      if (prev.length >= 5) return prev // máx 99999g
      return prev + digit
    })
  }, [])

  const del = useCallback(() => setGramos(prev => prev.slice(0, -1)), [])
  const clear = useCallback(() => setGramos(''), [])

  const confirmar = useCallback(() => {
    const g = Number(gramos)
    if (!g || g <= 0) return
    onConfirm(g, precioCalculado ?? 0)
  }, [gramos, precioCalculado, onConfirm])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(13,11,8,.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 20,
    }}>
      <div style={{
        background: K.bg, borderRadius: 16, padding: 28, width: '100%', maxWidth: 340,
        border: `1px solid ${K.rS}`,
      }}>
        {/* Header */}
        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: K.amb, fontWeight: 700, letterSpacing: '.12em', marginBottom: 4 }}>
            ⚖ PESAR
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: K.fg, letterSpacing: '.04em', textTransform: 'uppercase' }}>
            {item.nombre}
          </div>
          {item.precio_por_kg && (
            <div style={{ fontSize: 12, color: K.fg3, marginTop: 4 }}>
              {item.precio_por_kg} €/kg
            </div>
          )}
        </div>

        {/* Display */}
        <div style={{
          background: K.rS, borderRadius: 10, padding: '16px 20px', marginBottom: 20,
          textAlign: 'right', border: `1px solid ${K.rule}`,
        }}>
          <div style={{ fontSize: 42, fontWeight: 700, color: K.fg, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
            {gramos || '0'}
            <span style={{ fontSize: 18, color: K.fg3, marginLeft: 6 }}>g</span>
          </div>
          {precioCalculado !== null && (
            <div style={{ fontSize: 20, color: K.gr, fontWeight: 700, marginTop: 6 }}>
              {precioCalculado.toFixed(2)} €
            </div>
          )}
          {gramos && item.precio_por_kg && (
            <div style={{ fontSize: 11, color: K.fg3, marginTop: 2 }}>
              {(Number(gramos) / 1000).toFixed(3)} kg × {item.precio_por_kg} €/kg
            </div>
          )}
        </div>

        {/* Teclado numérico */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          {['1','2','3','4','5','6','7','8','9'].map(d => (
            <button key={d} onClick={() => append(d)} style={{
              height: 56, borderRadius: 8, fontSize: 22, fontWeight: 700,
              background: K.rS, border: `1px solid ${K.rule}`, color: K.fg,
              cursor: 'pointer', transition: 'background .1s',
            }}>
              {d}
            </button>
          ))}
          <button onClick={clear} style={{
            height: 56, borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: 'rgba(217,68,43,.12)', border: '1px solid rgba(217,68,43,.3)',
            color: K.red, cursor: 'pointer',
          }}>
            CLR
          </button>
          <button onClick={() => append('0')} style={{
            height: 56, borderRadius: 8, fontSize: 22, fontWeight: 700,
            background: K.rS, border: `1px solid ${K.rule}`, color: K.fg,
            cursor: 'pointer',
          }}>
            0
          </button>
          <button onClick={del} style={{
            height: 56, borderRadius: 8, fontSize: 20, fontWeight: 700,
            background: K.rS, border: `1px solid ${K.rule}`, color: K.fg2,
            cursor: 'pointer',
          }}>
            ⌫
          </button>
        </div>

        {/* Acciones */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
          <button onClick={onClose} style={{
            height: 52, borderRadius: 8, fontSize: 14, fontWeight: 700,
            background: 'transparent', border: `1px solid ${K.rS}`,
            color: K.fg3, cursor: 'pointer',
          }}>
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={!gramos || Number(gramos) <= 0 || loading}
            style={{
              height: 52, borderRadius: 8, fontSize: 16, fontWeight: 700,
              background: (!gramos || Number(gramos) <= 0) ? K.rS : K.btn,
              border: 'none', color: K.fg, cursor: (!gramos || Number(gramos) <= 0) ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1, transition: 'background .15s',
            }}
          >
            {loading ? 'Guardando…' : `Confirmar ${gramos ? gramos + 'g' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

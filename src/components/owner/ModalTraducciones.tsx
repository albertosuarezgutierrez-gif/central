// components/owner/ModalTraducciones.tsx
// Editor de traducciones de un producto para el panel owner
'use client'

import { useState, useEffect, useCallback } from 'react'
import { IDIOMAS_CARTA, CodigoIdioma } from '@/lib/useIdiomasCarta'

interface TraduccionLocal {
  idioma: CodigoIdioma
  nombre: string
  descripcion: string
}

interface Props {
  producto: { id: string; nombre: string; descripcion?: string | null }
  sh: () => Record<string, string>
  onClose: () => void
}

const C = {
  paper: '#F6F1E7', bone: '#FBF8F1',
  ink: '#1A1714', ink2: '#3A332C', ink3: '#6B5F52', ink4: '#9A8D7C',
  rule: '#D8CDB6',
  red: '#D9442B', redD: '#A8311E',
  amber: '#E8A33B', amberS: '#F7E3B6',
  green: '#3F7D44', greenS: '#D4E4D2',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

export default function ModalTraducciones({ producto, sh, onClose }: Props) {
  // Map idioma → datos (solo los idiomas distintos del español)
  const [traducciones, setTraducciones] = useState<Partial<Record<CodigoIdioma, TraduccionLocal>>>({})
  const [idioma, setIdioma] = useState<CodigoIdioma>('en')
  const [guardando, setGuardando] = useState(false)
  const [estado, setEstado] = useState<'idle' | 'ok' | 'error'>('idle')
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/traducciones?producto_id=${producto.id}`,
        { headers: sh() }
      )
      const data = await res.json()
      if (data.ok) {
        const map: Partial<Record<CodigoIdioma, TraduccionLocal>> = {}
        for (const t of data.traducciones) {
          map[t.idioma as CodigoIdioma] = {
            idioma: t.idioma,
            nombre: t.nombre,
            descripcion: t.descripcion ?? '',
          }
        }
        setTraducciones(map)
      }
    } finally {
      setLoading(false)
    }
  }, [producto.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargar() }, [cargar])

  // Escape handler
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const actual: TraduccionLocal = traducciones[idioma] ?? {
    idioma,
    nombre: '',
    descripcion: '',
  }

  const setActual = (patch: Partial<TraduccionLocal>) => {
    setTraducciones(prev => ({
      ...prev,
      [idioma]: { ...actual, ...patch },
    }))
    setEstado('idle')
  }

  const guardar = async () => {
    if (!actual.nombre.trim()) return
    setGuardando(true)
    setEstado('idle')
    try {
      const res = await fetch('/api/traducciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({
          producto_id: producto.id,
          idioma,
          nombre: actual.nombre.trim(),
          descripcion: actual.descripcion.trim() || null,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setEstado('ok')
        setTimeout(() => setEstado('idle'), 2500)
      } else {
        setEstado('error')
      }
    } catch {
      setEstado('error')
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async () => {
    if (!traducciones[idioma]) return
    await fetch(
      `/api/traducciones?producto_id=${producto.id}&idioma=${idioma}`,
      { method: 'DELETE', headers: sh() }
    )
    setTraducciones(prev => {
      const next = { ...prev }
      delete next[idioma]
      return next
    })
    setEstado('idle')
  }

  // Idiomas sin español
  const idiomasTraducibles = IDIOMAS_CARTA.filter(i => i.code !== 'es')

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: C.paper,
    border: `1px solid ${C.rule}`,
    borderRadius: 6,
    padding: '8px 10px',
    fontFamily: SN,
    fontSize: 13,
    color: C.ink,
    outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    fontFamily: SM,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '.1em',
    color: C.ink3,
    textTransform: 'uppercase' as const,
    display: 'block',
    marginBottom: 5,
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div style={{
        background: C.bone,
        border: `1px solid ${C.rule}`,
        borderRadius: 12,
        width: '100%',
        maxWidth: 540,
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 20px 14px',
          borderBottom: `1px solid ${C.rule}`,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div>
            <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color: C.ink3, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 3 }}>
              Traducciones de carta
            </div>
            <div style={{ fontFamily: SE, fontSize: 20, color: C.ink }}>{producto.nombre}</div>
            {producto.descripcion && (
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink4, marginTop: 2 }}>{producto.descripcion}</div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink4, fontSize: 18, padding: 4, flexShrink: 0 }}
          >
            ×
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', fontFamily: SM, fontSize: 11, color: C.ink3 }}>
            CARGANDO…
          </div>
        ) : (
          <>
            {/* Selector de idioma */}
            <div style={{ padding: '14px 20px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {idiomasTraducibles.map(({ code, flag, label }) => {
                const tieneTraduccion = !!traducciones[code as CodigoIdioma]
                const activo = idioma === code
                return (
                  <button
                    key={code}
                    onClick={() => { setIdioma(code as CodigoIdioma); setEstado('idle') }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 12px',
                      borderRadius: 999,
                      border: activo ? 'none' : `1px solid ${C.rule}`,
                      background: activo ? C.red : C.paper,
                      color: activo ? C.paper : C.ink2,
                      fontFamily: SN,
                      fontSize: 12,
                      fontWeight: activo ? 700 : 400,
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'all 0.15s',
                    }}
                  >
                    {flag} {label}
                    {tieneTraduccion && !activo && (
                      <span style={{
                        position: 'absolute',
                        top: 1,
                        right: 1,
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: C.green,
                        border: `1px solid ${C.bone}`,
                      }} />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Editor */}
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Original español (referencia) */}
              <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '11px 14px' }}>
                <div style={{ fontFamily: SM, fontSize: 9, fontWeight: 700, color: C.ink4, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                  🇪🇸 Original (español — solo lectura)
                </div>
                <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2 }}>{producto.nombre}</div>
                {producto.descripcion && (
                  <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginTop: 3 }}>{producto.descripcion}</div>
                )}
              </div>

              {/* Campo nombre traducido */}
              <div>
                <label style={labelStyle}>
                  Nombre en {IDIOMAS_CARTA.find(i => i.code === idioma)?.label}
                </label>
                <input
                  value={actual.nombre}
                  onChange={e => setActual({ nombre: e.target.value })}
                  placeholder={`p.ej. ${producto.nombre}`}
                  style={inputStyle}
                />
              </div>

              {/* Campo descripción */}
              <div>
                <label style={labelStyle}>Descripción (opcional)</label>
                <textarea
                  value={actual.descripcion}
                  onChange={e => setActual({ descripcion: e.target.value })}
                  placeholder={producto.descripcion ?? ''}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>

              {/* Feedback */}
              {estado === 'ok' && (
                <div style={{ fontFamily: SN, fontSize: 12, color: C.green, display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✓ Traducción guardada correctamente
                </div>
              )}
              {estado === 'error' && (
                <div style={{ fontFamily: SN, fontSize: 12, color: C.red }}>
                  Error al guardar. Inténtalo de nuevo.
                </div>
              )}
            </div>

            {/* Acciones */}
            <div style={{
              padding: '12px 20px 18px',
              borderTop: `1px solid ${C.rule}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              {traducciones[idioma] && (
                <button
                  onClick={eliminar}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink4, fontFamily: SN, fontSize: 12, padding: '6px 2px', textDecoration: 'underline' }}
                >
                  Eliminar traducción
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button
                onClick={onClose}
                style={{ background: 'none', border: `1px solid ${C.rule}`, borderRadius: 6, padding: '7px 14px', fontFamily: SN, fontSize: 13, color: C.ink3, cursor: 'pointer' }}
              >
                Cerrar
              </button>
              <button
                onClick={guardar}
                disabled={guardando || !actual.nombre.trim()}
                style={{
                  background: guardando || !actual.nombre.trim() ? C.rule : C.red,
                  border: 'none',
                  borderRadius: 6,
                  padding: '7px 16px',
                  fontFamily: SN,
                  fontSize: 13,
                  fontWeight: 600,
                  color: guardando || !actual.nombre.trim() ? C.ink4 : C.paper,
                  cursor: guardando || !actual.nombre.trim() ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

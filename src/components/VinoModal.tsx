'use client'
// src/components/VinoModal.tsx
// Modal recomendador de vino — reutilizable en /edge y /jefe
// Props: open, onClose, session, tema ('dark'|'light')

import { useState, useEffect, useCallback } from 'react'
import { Session } from '@/hooks/useAuth'
import { C } from '@/lib/colors'

// Familias excluidas de los chips de platos
const FAMILIAS_EXCLUIR = new Set([
  'vino_tinto','vino_blanco','vino_rosado','vino_copa','vino_botella',
  'cava','champagne','jerez','vermut','cerveza','refresco','agua','bebida',
  'bebidas','cafe','infusion','destilado','licor',
])

interface Props {
  open: boolean
  onClose: () => void
  session: Session
  tema?: 'dark' | 'light'
}

interface Plato { id: string; nombre: string; familia: string | null }

export default function VinoModal({ open, onClose, session, tema = 'dark' }: Props) {
  const [plato, setPlato] = useState('')
  const [platos, setPlatos] = useState<Plato[]>([])
  const [cargando, setCargando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ses = typeof window !== 'undefined' ? localStorage.getItem('ia_rest_session') ?? '' : ''

  const dk = tema === 'dark'

  // Paleta según tema
  const bg0   = dk ? '#14110E' : '#FDFBF8'
  const bg1   = dk ? '#1F1A15' : '#FFFFFF'
  const bg2   = dk ? '#2A2218' : '#F5EDE8'
  const rule  = dk ? '#2E2820' : '#E8DDD6'
  const ink   = dk ? '#F6F1E7' : '#1A1410'
  const ink2  = dk ? '#D8CDB6' : '#3A332C'
  const ink3  = dk ? '#8D8270' : '#8B7B6E'
  const ink4  = dk ? '#5C5247' : '#B5A090'
  const red   = '#D9442B'
  const redS  = dk ? '#3D1A10' : '#FDEAE6'
  const redT  = dk ? '#791F1F' : '#D9442B'

  // Cargar platos de carta al abrir
  useEffect(() => {
    if (!open) return
    setPlato('')
    setResultado(null)
    setError(null)
    fetch('/api/owner/carta', { headers: { 'x-ia-session': ses } })
      .then(r => r.json())
      .then(d => {
        const lista = (d.productos ?? [])
          .filter((p: Plato) => p.familia === null || !FAMILIAS_EXCLUIR.has(p.familia))
          .filter((p: Plato) => p.nombre.length < 40)
          .slice(0, 16)
        setPlatos(lista)
      })
      .catch(() => setPlatos([]))
  }, [open, ses])

  const recomendar = useCallback(async () => {
    if (!plato.trim()) return
    setCargando(true)
    setResultado(null)
    setError(null)
    try {
      const r = await fetch('/api/vinos/recomendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ia-session': ses },
        body: JSON.stringify({ plato }),
      })
      const d = await r.json()
      if (d.error) setError('No se pudo obtener recomendación')
      else setResultado(d.recomendacion)
    } catch {
      setError('Error de conexión')
    } finally {
      setCargando(false)
    }
  }, [plato, ses])

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,.6)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: bg1, borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480,
        maxHeight: '88vh', overflowY: 'auto', scrollbarWidth: 'none',
        border: `0.5px solid ${rule}`,
      }} onClick={e => e.stopPropagation()}>

        {/* Handle */}
        <div style={{ width: 36, height: 4, background: rule, borderRadius: 2, margin: '10px auto 0' }} />

        {/* Título */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px 10px', borderBottom: `0.5px solid ${rule}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={red} strokeWidth="2" strokeLinecap="round">
              <path d="M8 22h8M12 11v11M9 3.5A6 6 0 0 0 6 9c0 3.3 2.7 6 6 6s6-2.7 6-6a6 6 0 0 0-3-5.2"/>
              <path d="M9 3h6"/>
            </svg>
            <span style={{ fontFamily: 'Newsreader,Georgia,serif', fontStyle: 'italic', fontSize: 16, color: ink }}>
              Recomendar vino
            </span>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: ink3, cursor: 'pointer', fontSize: 18, lineHeight: 1,
          }}>×</button>
        </div>

        <div style={{ padding: '14px 16px' }}>
          {/* Input plato */}
          <div style={{ fontFamily: 'Inter Tight,sans-serif', fontSize: 10, fontWeight: 600, color: ink3, letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 6 }}>
            ¿Para qué plato?
          </div>
          <input
            value={plato}
            onChange={e => setPlato(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && recomendar()}
            placeholder="ej: solomillo ibérico, dorada a la sal..."
            style={{
              width: '100%', background: bg0, border: `1px solid ${rule}`, borderRadius: 10,
              padding: '11px 13px', color: ink, fontSize: 15,
              fontFamily: 'Inter Tight,sans-serif', outline: 'none', marginBottom: 12,
            }}
            autoFocus
          />

          {/* Chips platos de carta */}
          {platos.length > 0 && (
            <>
              <div style={{ fontFamily: 'Inter Tight,sans-serif', fontSize: 10, fontWeight: 600, color: ink3, letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 7 }}>
                Platos de carta
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
                {platos.map(p => (
                  <button key={p.id} onClick={() => setPlato(p.nombre)}
                    style={{
                      background: plato === p.nombre ? redS : bg2,
                      border: `1px solid ${plato === p.nombre ? redT : rule}`,
                      borderRadius: 20, padding: '5px 12px',
                      fontFamily: 'Inter Tight,sans-serif', fontSize: 11,
                      color: plato === p.nombre ? (dk ? '#F6C4B3' : red) : ink2,
                      cursor: 'pointer', transition: 'all .12s',
                    }}>
                    {p.nombre}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Botón recomendar */}
          <button onClick={recomendar} disabled={!plato.trim() || cargando}
            style={{
              width: '100%', background: plato.trim() && !cargando ? red : (dk ? '#3A332C' : '#D9C4BC'),
              border: 'none', borderRadius: 10, padding: '12px',
              color: plato.trim() && !cargando ? '#fff' : ink4,
              fontFamily: 'Inter Tight,sans-serif', fontSize: 14, fontWeight: 600,
              cursor: plato.trim() && !cargando ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}>
            {cargando ? (
              <>
                <span style={{ display: 'inline-flex', gap: 3 }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 5, height: 5, background: ink3, borderRadius: '50%',
                      animation: `vdot 1.2s infinite ${i * 0.2}s`,
                    }} />
                  ))}
                </span>
                Consultando carta...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M8 22h8M12 11v11M9 3.5A6 6 0 0 0 6 9c0 3.3 2.7 6 6 6s6-2.7 6-6a6 6 0 0 0-3-5.2"/>
                  <path d="M9 3h6"/>
                </svg>
                Recomendar
              </>
            )}
          </button>

          {/* Resultado */}
          {resultado && (
            <div style={{
              marginTop: 14, background: bg0, border: `1px solid ${rule}`,
              borderRadius: 12, padding: '13px 14px',
            }}>
              <div style={{
                fontFamily: 'Inter Tight,sans-serif', fontSize: 10, fontWeight: 600,
                color: red, letterSpacing: '.4px', textTransform: 'uppercase', marginBottom: 8,
              }}>
                Recomendación
              </div>
              <div style={{
                fontFamily: 'Inter Tight,sans-serif', fontSize: 13, color: ink2,
                lineHeight: 1.6,
              }}>
                {resultado}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              marginTop: 12, background: redS, border: `1px solid ${redT}`,
              borderRadius: 9, padding: '10px 12px',
              fontFamily: 'Inter Tight,sans-serif', fontSize: 12, color: dk ? '#F09595' : red,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Espacio fondo */}
        <div style={{ height: 20 }} />
      </div>
      <style>{`@keyframes vdot{0%,80%,100%{opacity:.2}40%{opacity:1}}`}</style>
    </div>
  )
}

'use client'
import { SE, SN, SM } from '@/lib/colors'
import { useState, useEffect, useCallback } from 'react'

// ── Design tokens ──────────────────────────────────────────────────────────
const C = {
  bg:   '#14110E',
  bg2:  '#1A1714',
  card: '#1E1B17',
  rule: '#2A2520',
  ink:  '#F6F1E7',
  ink2: '#D8CDB6',
  ink4: '#6B5F52',
  verm: '#D9442B',
  vermD:'#A8311E',
  gr:   '#3F7D44',
  grD:  '#2E5C32',
  amb:  '#E8A33B',
}

// ── Tipos ──────────────────────────────────────────────────────────────────
interface CocineroSession {
  id: string
  nombre: string
  rol: string
  restaurante_id: string
  restaurante_nombre: string
}

type Pantalla = 'pin' | 'estado' | 'confirmacion' | 'error_pin'

// ── Componente principal ───────────────────────────────────────────────────
export default function CocinaFicharPage() {
  const [restauranteCode, setRestauranteCode] = useState<string | null>(null)
  const [pin, setPin]             = useState('')
  const [pantalla, setPantalla]   = useState<Pantalla>('pin')
  const [cocinero, setCocinero]   = useState<CocineroSession | null>(null)
  const [turnoActivo, setTurnoActivo] = useState<{ id: string; entrada_at: string } | null>(null)
  const [loading, setLoading]     = useState(false)
  const [mensajeOk, setMensajeOk] = useState('')
  const [horasFichadas, setHorasFichadas] = useState<string | null>(null)
  const [hora, setHora]           = useState('')
  const [errorMsg, setErrorMsg]   = useState('')

  // Hora actual
  useEffect(() => {
    const tick = () => setHora(new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }))
    tick()
    const iv = setInterval(tick, 10000)
    return () => clearInterval(iv)
  }, [])

  // Leer restaurante de la URL (?r=CODIGO)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('r') ?? params.get('restaurante')
    if (code) setRestauranteCode(code.toUpperCase())
  }, [])

  // Auto-volver al teclado PIN tras confirmación
  useEffect(() => {
    if (pantalla === 'confirmacion') {
      const t = setTimeout(() => resetPantalla(), 4000)
      return () => clearTimeout(t)
    }
  }, [pantalla])

  // Auto-limpiar error de PIN
  useEffect(() => {
    if (pantalla === 'error_pin') {
      const t = setTimeout(() => {
        setPin('')
        setPantalla('pin')
        setErrorMsg('')
      }, 1800)
      return () => clearTimeout(t)
    }
  }, [pantalla])

  const resetPantalla = () => {
    setPin('')
    setCocinero(null)
    setTurnoActivo(null)
    setMensajeOk('')
    setHorasFichadas(null)
    setPantalla('pin')
  }

  // Validar PIN al completar 4 dígitos
  useEffect(() => {
    if (pin.length === 4) validarPin(pin)
  }, [pin])

  const validarPin = async (p: string) => {
    if (!restauranteCode) return
    setLoading(true)
    try {
      const r = await fetch('/api/cocina/validar-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: p, restaurante_code: restauranteCode }),
      })
      const d = await r.json()
      if (!r.ok) {
        setErrorMsg(d.error ?? 'PIN incorrecto')
        setPantalla('error_pin')
        setLoading(false)
        return
      }
      const ses: CocineroSession = d.camarero
      setCocinero(ses)

      // Comprobar turno activo
      const rt = await fetch('/api/turnos/activo', {
        headers: { 'x-ia-session': JSON.stringify({ id: ses.id, restaurante_id: ses.restaurante_id }) }
      })
      const dt = await rt.json()
      setTurnoActivo(dt.turno ?? null)
      setPantalla('estado')
    } catch {
      setErrorMsg('Error de conexión')
      setPantalla('error_pin')
    }
    setLoading(false)
  }

  const ficharEntrada = async () => {
    if (!cocinero) return
    setLoading(true)
    try {
      const r = await fetch('/api/turnos/fichar', {
        method: 'POST',
        headers: { 'x-ia-session': JSON.stringify({ id: cocinero.id, restaurante_id: cocinero.restaurante_id }) },
      })
      const d = await r.json()
      if (d.ok) {
        setMensajeOk(`Entrada registrada — ${hora}`)
        setPantalla('confirmacion')
      }
    } catch { /* noop */ }
    setLoading(false)
  }

  const ficharSalida = async () => {
    if (!cocinero) return
    setLoading(true)
    try {
      const r = await fetch('/api/turnos/fichar', {
        method: 'DELETE',
        headers: { 'x-ia-session': JSON.stringify({ id: cocinero.id, restaurante_id: cocinero.restaurante_id }) },
      })
      const d = await r.json()
      if (d.ok) {
        const h = d.horas ? `${d.horas}h trabajadas` : null
        setHorasFichadas(h)
        setMensajeOk(`Salida registrada — ${hora}`)
        setPantalla('confirmacion')
      }
    } catch { /* noop */ }
    setLoading(false)
  }

  // Tiempo desde entrada
  const tiempoDesdeEntrada = (): string => {
    if (!turnoActivo?.entrada_at) return ''
    const mins = Math.floor((Date.now() - new Date(turnoActivo.entrada_at).getTime()) / 60000)
    if (mins < 60) return `${mins} min`
    return `${Math.floor(mins / 60)}h ${mins % 60}min`
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (!restauranteCode) {
    return (
      <div style={{ ...baseStyle, justifyContent: 'center', alignItems: 'center' }}>
        <p style={{ fontFamily: SM, fontSize: 13, color: C.ink4, textAlign: 'center' }}>
          Accede con el enlace de tu restaurante
          <br />
          <span style={{ color: C.verm }}>?r=CODIGO</span>
        </p>
      </div>
    )
  }

  return (
    <div style={baseStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4, letterSpacing: '.12em', textTransform: 'uppercase' }}>
          ia.rest · Cocina
        </div>
        <div style={{ fontFamily: SM, fontSize: 28, color: C.ink, letterSpacing: '.04em', marginTop: 4 }}>
          {hora}
        </div>
        <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4, marginTop: 2 }}>
          {new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      {/* Contenido central */}
      <div style={centerStyle}>

        {/* ── Pantalla PIN ── */}
        {(pantalla === 'pin' || pantalla === 'error_pin') && (
          <div style={cardStyle}>
            <div style={{ fontFamily: SN, fontSize: 13, color: C.ink4, textAlign: 'center', marginBottom: 24, letterSpacing: '.04em' }}>
              Introduce tu PIN para fichar
            </div>

            {/* Indicador de puntos */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 32 }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: pantalla === 'error_pin'
                    ? C.verm
                    : pin.length > i ? C.ink : 'transparent',
                  border: pantalla === 'error_pin'
                    ? `2px solid ${C.verm}`
                    : `2px solid ${pin.length > i ? C.ink : C.rule}`,
                  transition: 'all .15s',
                }} />
              ))}
            </div>

            {/* Mensaje de error */}
            {pantalla === 'error_pin' && (
              <div style={{ fontFamily: SN, fontSize: 13, color: C.verm, textAlign: 'center', marginBottom: 20 }}>
                {errorMsg}
              </div>
            )}

            {/* Teclado numérico */}
            {pantalla === 'pin' && (
              <Teclado
                onDigit={d => { if (pin.length < 4) setPin(p => p + d) }}
                onBorrar={() => setPin(p => p.slice(0, -1))}
                disabled={loading}
              />
            )}
          </div>
        )}

        {/* ── Pantalla estado turno ── */}
        {pantalla === 'estado' && cocinero && (
          <div style={cardStyle}>
            {/* Nombre cocinero */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                Cocinero/a
              </div>
              <div style={{ fontFamily: SE, fontSize: 36, fontStyle: 'italic', color: C.ink }}>
                {cocinero.nombre.split(' ')[0]}
              </div>
              {cocinero.nombre.split(' ').length > 1 && (
                <div style={{ fontFamily: SN, fontSize: 15, color: C.ink2, marginTop: 2 }}>
                  {cocinero.nombre.split(' ').slice(1).join(' ')}
                </div>
              )}
            </div>

            <div style={{ borderTop: `1px solid ${C.rule}`, marginBottom: 28 }} />

            {/* Estado del turno */}
            {turnoActivo ? (
              <>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <div style={{
                    display: 'inline-block', fontFamily: SM, fontSize: 10,
                    color: C.amb, letterSpacing: '.1em', textTransform: 'uppercase',
                    background: `${C.amb}18`, border: `1px solid ${C.amb}44`,
                    borderRadius: 6, padding: '4px 10px', marginBottom: 12
                  }}>
                    Turno activo
                  </div>
                  <div style={{ fontFamily: SN, fontSize: 14, color: C.ink2 }}>
                    Llevas <strong style={{ color: C.amb }}>{tiempoDesdeEntrada()}</strong> trabajando
                  </div>
                  <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4, marginTop: 4 }}>
                    Entrada: {new Date(turnoActivo.entrada_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <button
                  onClick={ficharSalida}
                  disabled={loading}
                  style={{ ...btnStyle, background: C.verm }}
                >
                  {loading ? 'Fichando...' : 'Fichar Salida'}
                </button>
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <div style={{
                    display: 'inline-block', fontFamily: SM, fontSize: 10,
                    color: C.ink4, letterSpacing: '.1em', textTransform: 'uppercase',
                    background: `${C.rule}88`, border: `1px solid ${C.rule}`,
                    borderRadius: 6, padding: '4px 10px', marginBottom: 12
                  }}>
                    Sin turno activo
                  </div>
                  <div style={{ fontFamily: SN, fontSize: 14, color: C.ink2 }}>
                    ¿Quieres registrar tu <strong style={{ color: C.ink }}>entrada</strong>?
                  </div>
                </div>
                <button
                  onClick={ficharEntrada}
                  disabled={loading}
                  style={{ ...btnStyle, background: C.gr }}
                >
                  {loading ? 'Fichando...' : 'Fichar Entrada'}
                </button>
              </>
            )}

            <button onClick={resetPantalla} style={btnGhostStyle}>
              Cancelar
            </button>
          </div>
        )}

        {/* ── Pantalla confirmación ── */}
        {pantalla === 'confirmacion' && cocinero && (
          <div style={{ ...cardStyle, textAlign: 'center' }}>
            {/* Check animado */}
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: `${C.gr}22`, border: `2px solid ${C.gr}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.gr} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>

            <div style={{ fontFamily: SE, fontSize: 28, fontStyle: 'italic', color: C.ink, marginBottom: 8 }}>
              ¡Fichado!
            </div>
            <div style={{ fontFamily: SN, fontSize: 14, color: C.ink2, marginBottom: 6 }}>
              {mensajeOk}
            </div>
            {horasFichadas && (
              <div style={{ fontFamily: SM, fontSize: 13, color: C.amb, marginBottom: 4 }}>
                {horasFichadas}
              </div>
            )}
            <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2, marginBottom: 24 }}>
              {cocinero.nombre.split(' ')[0]}
            </div>

            <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>
              Volviendo en unos segundos...
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '16px 0 24px' }}>
        <span style={{ fontFamily: SM, fontSize: 10, color: C.rule }}>
          {restauranteCode}
        </span>
      </div>
    </div>
  )
}

// ── Teclado numérico ───────────────────────────────────────────────────────
function Teclado({ onDigit, onBorrar, disabled }: {
  onDigit: (d: string) => void
  onBorrar: () => void
  disabled: boolean
}) {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','←']

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      {keys.map((k, i) => {
        if (k === '') return <div key={i} />
        const isBorrar = k === '←'
        return (
          <button
            key={i}
            onClick={() => isBorrar ? onBorrar() : onDigit(k)}
            disabled={disabled}
            style={{
              height: 68,
              background: isBorrar ? 'transparent' : '#1E1B17',
              border: `1px solid ${isBorrar ? 'transparent' : '#2A2520'}`,
              borderRadius: 12,
              fontFamily: isBorrar ? "'Inter Tight',system-ui,sans-serif" : "'JetBrains Mono',ui-monospace,monospace",
              fontSize: isBorrar ? 20 : 26,
              color: isBorrar ? '#6B5F52' : '#F6F1E7',
              cursor: disabled ? 'default' : 'pointer',
              transition: 'background .1s, transform .08s',
              WebkitTapHighlightColor: 'transparent',
              userSelect: 'none',
            }}
          >
            {k}
          </button>
        )
      })}
    </div>
  )
}

// ── Estilos base ───────────────────────────────────────────────────────────
const baseStyle: React.CSSProperties = {
  minHeight: '100dvh',
  background: '#14110E',
  display: 'flex',
  flexDirection: 'column',
}

const headerStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '32px 20px 16px',
  borderBottom: '1px solid #2A2520',
}

const centerStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px 20px',
}

const cardStyle: React.CSSProperties = {
  background: '#1E1B17',
  border: '1px solid #2A2520',
  borderRadius: 20,
  padding: '32px 28px',
  width: '100%',
  maxWidth: 360,
  boxShadow: '0 32px 64px rgba(0,0,0,.5)',
}

const btnStyle: React.CSSProperties = {
  width: '100%',
  padding: '18px 0',
  border: 'none',
  borderRadius: 12,
  fontFamily: "'Inter Tight',system-ui,sans-serif",
  fontSize: 16,
  fontWeight: 700,
  color: '#fff',
  cursor: 'pointer',
  marginBottom: 10,
  letterSpacing: '.02em',
}

const btnGhostStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 0',
  background: 'transparent',
  border: '1px solid #2A2520',
  borderRadius: 12,
  fontFamily: "'Inter Tight',system-ui,sans-serif",
  fontSize: 13,
  color: '#6B5F52',
  cursor: 'pointer',
  marginTop: 4,
}

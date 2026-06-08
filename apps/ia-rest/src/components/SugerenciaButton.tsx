'use client'
import { useState } from 'react'

// ─── Tipos ──────────────────────────────────────────────────────
type Categoria = 'bug' | 'mejora' | 'idea' | 'urgente'
interface SugerenciaButtonProps {
  session: {
    id: string
    nombre: string
    rol: string
    restaurante_id?: string
  }
  /** Tema: 'light' = páginas crema (edge/owner), 'dark' = páginas oscuras (kds) */
  tema?: 'light' | 'dark'
  /**
   * 'floating' (default) — botón fijo bottom-right como antes
   * 'inline'             — icono sin posicionamiento, para meter en headers
   */
  variant?: 'floating' | 'inline'
}

// ─── Config categorías ───────────────────────────────────────────
const CATS: { id: Categoria; label: string; emoji: string; color: string }[] = [
  { id: 'bug',     label: 'Bug',     emoji: '🐛', color: '#D9442B' },
  { id: 'mejora',  label: 'Mejora',  emoji: '✨', color: '#2B6A6E' },
  { id: 'idea',    label: 'Idea',    emoji: '💡', color: '#E8A33B' },
  { id: 'urgente', label: 'Urgente', emoji: '🚨', color: '#A8311E' },
]

export default function SugerenciaButton({ session, tema = 'light', variant = 'floating' }: SugerenciaButtonProps) {
  const [open, setOpen] = useState(false)
  const [texto, setTexto] = useState('')
  const [categoria, setCategoria] = useState<Categoria>('mejora')
  const [estado, setEstado] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')
  const [errMsg, setErrMsg] = useState('')

  // ─── Paleta según tema ──────────────────────────────────────
  const isDark = tema === 'dark'
  const T = isDark
    ? {
        bg:      '#1A1612',
        surface: '#252018',
        border:  '#3A3226',
        text:    '#F6F1E7',
        text2:   '#C9BFAA',
        text3:   '#8D8270',
        input:   '#0D0B08',
        inputB:  '#3A3226',
        overlay: 'rgba(0,0,0,0.72)',
      }
    : {
        bg:      '#F6F1E7',
        surface: '#FFFDF8',
        border:  '#D8CDB6',
        text:    '#1A1714',
        text2:   '#3A332C',
        text3:   '#6B5F52',
        input:   '#F6F1E7',
        inputB:  '#C8BDA6',
        overlay: 'rgba(26,23,20,0.55)',
      }

  const ROL_LABEL: Record<string, string> = {
    super_admin: 'Super Admin',
    owner:       'Dueño',
    admin:       'Admin',
    jefe_sala:   'Jefe de sala',
    camarero:    'Camarero',
    cocina:      'Cocina',
  }

  const enviar = async () => {
    if (texto.trim().length < 5) {
      setErrMsg('Escribe al menos 5 caracteres')
      return
    }
    setEstado('sending')
    setErrMsg('')
    try {
      const r = await fetch('/api/sugerencias', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ia-session': JSON.stringify(session),
        },
        body: JSON.stringify({ categoria, texto: texto.trim() }),
      })
      const d = await r.json()
      if (!r.ok || d.error) throw new Error(d.error || 'Error')
      setEstado('ok')
      setTimeout(() => {
        setOpen(false)
        setEstado('idle')
        setTexto('')
        setCategoria('mejora')
      }, 2200)
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : 'Error al enviar')
      setEstado('err')
    }
  }

  const cerrar = () => {
    if (estado === 'sending') return
    setOpen(false)
    setEstado('idle')
    setTexto('')
    setCategoria('mejora')
    setErrMsg('')
  }

  const catActual = CATS.find(c => c.id === categoria)!

  return (
    <>
      {/* ── Botón disparador ── */}
      {variant === 'floating' ? (
        // Flotante legacy (ya no se usa, mantenido por compatibilidad)
        <button
          onClick={() => setOpen(true)}
          title="Enviar sugerencia"
          style={{
            position: 'fixed',
            bottom: 84,
            right: 16,
            zIndex: 900,
            width: 42,
            height: 42,
            borderRadius: '50%',
            background: isDark ? '#252018' : '#F6F1E7',
            border: `1.5px solid ${isDark ? '#4A3F33' : '#C8BDA6'}`,
            boxShadow: isDark
              ? '0 2px 12px rgba(0,0,0,0.6)'
              : '0 2px 10px rgba(26,23,20,0.15)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
        >
          💬
        </button>
      ) : (
        // Inline — para headers, al lado del botón de salir
        <button
          onClick={() => setOpen(true)}
          title="Enviar sugerencia"
          style={{
            width: 30,
            height: 30,
            borderRadius: 6,
            background: 'transparent',
            border: `1px solid ${isDark ? '#3A3226' : '#D8CDB6'}`,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            flexShrink: 0,
            transition: 'background 0.15s',
            color: isDark ? '#8D8270' : '#6B5F52',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = isDark ? '#2A2318' : '#EFE7D6'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          }}
        >
          💬
        </button>
      )}

      {/* ── Modal ── */}
      {open && (
        <div
          onClick={cerrar}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: T.overlay,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            padding: '0 0 env(safe-area-inset-bottom)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: T.bg,
              borderRadius: '16px 16px 0 0',
              width: '100%',
              maxWidth: 520,
              padding: '0 0 24px',
              fontFamily: "'Inter Tight',system-ui,sans-serif",
              boxShadow: '0 -4px 32px rgba(0,0,0,0.25)',
              maxHeight: '90dvh',
              overflowY: 'auto',
            }}
          >
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border }} />
            </div>

            {/* Header */}
            <div style={{ padding: '8px 20px 16px', borderBottom: `1px solid ${T.border}` }}>
              <div style={{
                fontFamily: "'Newsreader',Georgia,serif",
                fontSize: 20, fontWeight: 500,
                color: T.text, lineHeight: 1.2,
              }}>
                Sugerencia
              </div>
              <div style={{ fontSize: 12, color: T.text3, marginTop: 3, fontFamily: "'JetBrains Mono',monospace" }}>
                {ROL_LABEL[session.rol] ?? session.rol} · {session.nombre}
              </div>
            </div>

            {/* Contenido */}
            <div style={{ padding: '16px 20px' }}>

              {/* Categoría */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: T.text3, marginBottom: 8 }}>
                  Tipo
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {CATS.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setCategoria(c.id)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 20,
                        border: `1.5px solid ${categoria === c.id ? c.color : T.border}`,
                        background: categoria === c.id
                          ? `${c.color}20`
                          : 'transparent',
                        color: categoria === c.id ? c.color : T.text3,
                        fontSize: 13, fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        fontFamily: "'Inter Tight',system-ui,sans-serif",
                      }}
                    >
                      {c.emoji} {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: T.text3, marginBottom: 8 }}>
                  Mensaje
                </div>
                <textarea
                  value={texto}
                  onChange={e => { setTexto(e.target.value); setErrMsg('') }}
                  placeholder={
                    categoria === 'bug'
                      ? 'Describe el problema: qué pasó, en qué pantalla, cuándo…'
                      : categoria === 'urgente'
                      ? 'Describe el problema urgente con detalle…'
                      : categoria === 'idea'
                      ? '¿Qué funcionalidad añadirías? ¿Para qué te serviría?'
                      : '¿Qué mejorarías del sistema? ¿Qué te ralentiza?'
                  }
                  maxLength={1000}
                  rows={5}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: T.input,
                    border: `1px solid ${errMsg ? '#D9442B' : T.inputB}`,
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 14,
                    color: T.text,
                    fontFamily: "'Inter Tight',system-ui,sans-serif",
                    resize: 'vertical',
                    outline: 'none',
                    lineHeight: 1.5,
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  {errMsg
                    ? <span style={{ fontSize: 12, color: '#D9442B' }}>{errMsg}</span>
                    : <span />
                  }
                  <span style={{ fontSize: 11, color: T.text3 }}>{texto.length}/1000</span>
                </div>
              </div>

              {/* Estado OK */}
              {estado === 'ok' && (
                <div style={{
                  background: '#3F7D4420',
                  border: '1px solid #3F7D44',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 14,
                  fontSize: 14,
                  color: '#3F7D44',
                  fontWeight: 600,
                  textAlign: 'center',
                }}>
                  ✓ Enviada — gracias, lo revisaré pronto
                </div>
              )}

              {/* Botones */}
              {estado !== 'ok' && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={cerrar}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: 8,
                      border: `1px solid ${T.border}`,
                      background: 'transparent',
                      color: T.text3,
                      fontSize: 14, fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: "'Inter Tight',system-ui,sans-serif",
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={enviar}
                    disabled={estado === 'sending' || texto.trim().length < 5}
                    style={{
                      flex: 2,
                      padding: '12px',
                      borderRadius: 8,
                      border: 'none',
                      background: estado === 'sending' || texto.trim().length < 5
                        ? (isDark ? '#3A3226' : '#D8CDB6')
                        : catActual.color,
                      color: estado === 'sending' || texto.trim().length < 5
                        ? T.text3 : '#fff',
                      fontSize: 14, fontWeight: 700,
                      cursor: estado === 'sending' || texto.trim().length < 5
                        ? 'not-allowed' : 'pointer',
                      fontFamily: "'Inter Tight',system-ui,sans-serif",
                      transition: 'background 0.15s',
                    }}
                  >
                    {estado === 'sending' ? 'Enviando…' : `Enviar ${catActual.emoji}`}
                  </button>
                </div>
              )}

              {/* Footer info */}
              <div style={{ marginTop: 16, fontSize: 13, color: T.text3, textAlign: 'center', fontFamily: "'Caveat',cursive" }}>
                Solo lo ve Alberto — directo al panel de mejoras
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
